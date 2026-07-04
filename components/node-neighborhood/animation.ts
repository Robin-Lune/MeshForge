import type { NodeTraceroute, TracerouteHop } from "../../types";
import { signalColor } from "../map/signal-color";
import {
  fmtSnr,
  splitHops,
  traceDirectionLabel,
  type VisualNodeAnchors,
} from "./format";
import {
  traceHopsWithPosition,
  visualNodeCoordinates,
} from "./features";

export const TRACE_SEGMENT_MS = 920;
export const TRACE_DIRECTION_PAUSE_MS = 420;

export function traceAnimationSteps(
  trace: NodeTraceroute | null,
): TracerouteHop[] {
  const { forward, back } = splitHops(traceHopsWithPosition(trace));
  return [
    ...forward.sort((a, b) => a.step - b.step),
    ...back.sort((a, b) => a.step - b.step),
  ];
}

export function traceAnimationDuration(trace: NodeTraceroute | null): number {
  const { forward, back } = splitHops(traceHopsWithPosition(trace));
  if (forward.length + back.length === 0) return 0;
  return (
    (forward.length + back.length) * TRACE_SEGMENT_MS +
    (forward.length > 0 && back.length > 0 ? TRACE_DIRECTION_PAUSE_MS : 0)
  );
}

export function buildTraceAnimationFrame(
  trace: NodeTraceroute | null,
  elapsedMs: number,
  visualAnchors: VisualNodeAnchors = {},
): {
  lines: GeoJSON.FeatureCollection;
  halo: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
  arrows: GeoJSON.FeatureCollection;
  pulses: GeoJSON.FeatureCollection;
  packet: GeoJSON.FeatureCollection;
} {
  const { forward, back } = splitHops(traceHopsWithPosition(trace));
  const steps = [
    ...forward.sort((a, b) => a.step - b.step),
    ...back.sort((a, b) => a.step - b.step),
  ];
  const lines: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const arrows: GeoJSON.Feature[] = [];
  const pulses: GeoJSON.Feature[] = [];
  const packets: GeoJSON.Feature[] = [];
  const pauseAfter =
    forward.length > 0 && back.length > 0 ? forward.length - 1 : -1;
  const totalDuration = traceAnimationDuration(trace);
  let cursor = 0;

  for (let i = 0; i < steps.length; i += 1) {
    const h = steps[i];
    const start = cursor;
    const end = start + TRACE_SEGMENT_MS;
    const progress =
      elapsedMs <= start
        ? 0
        : elapsedMs >= end
          ? 1
          : (elapsedMs - start) / TRACE_SEGMENT_MS;
    if (progress > 0) {
      const from = visualNodeCoordinates(
        h.fromNode,
        [h.fromLon as number, h.fromLat as number],
        visualAnchors,
      );
      const to = visualNodeCoordinates(
        h.toNode,
        [h.toLon as number, h.toLat as number],
        visualAnchors,
      );
      const lineFrom = offsetPoint(from, to, h.direction);
      const lineTo = offsetPoint(to, from, h.direction, true);
      const linePartial = lerpPoint(lineFrom, lineTo, ease(progress));
      const color = signalColor(h.snr);
      const phaseColor = h.direction === "back" ? "#a78bfa" : "#67ea94";
      const hopLabel = traceDirectionLabel(h.direction);
      lines.push({
        type: "Feature",
        properties: {
          color,
          haloColor: phaseColor,
          opacity: Math.min(0.35 + progress, 1),
          width: 2.4,
        },
        geometry: { type: "LineString", coordinates: [lineFrom, linePartial] },
      });
      if (progress < 1) {
        pulses.push(
          nodePulse(
            from,
            phaseColor,
            progress < 0.22 ? 30 : 22,
            progress < 0.22 ? 0.78 : 0.38,
          ),
        );
        if (progress >= 0.78) {
          pulses.push(
            nodePulse(
              to,
              phaseColor,
              18 + (progress - 0.78) * 48,
              0.9 - (progress - 0.78) * 1.5,
            ),
          );
        }
      } else if (elapsedMs >= totalDuration && i === steps.length - 1) {
        pulses.push(nodePulse(to, "#67ea94", 26, 0.5));
      }
      if (progress >= 0.42) {
        labels.push({
          type: "Feature",
          properties: {
            label: `${hopLabel} ${h.step + 1} · ${fmtSnr(h.snr)}`,
            prefix: `${hopLabel} ${h.step + 1}`,
            value: fmtSnr(h.snr),
            color,
            direction: h.direction,
            opacity: Math.min((progress - 0.42) / 0.24, 1),
          },
          geometry: {
            type: "Point",
            coordinates: lerpPoint(lineFrom, lineTo, 0.54),
          },
        });
      }
      if (progress >= 0.28) {
        arrows.push(
          ...traceArrows(
            lineFrom,
            lineTo,
            Math.min(ease(progress), 1),
            color,
            Math.min((progress - 0.28) / 0.2, 1),
          ),
        );
      }
      if (progress < 1) {
        packets.push(...packetTrail(lineFrom, lineTo, ease(progress), color));
      } else {
        packets.length = 0;
      }
    }
    cursor = end + (i === pauseAfter ? TRACE_DIRECTION_PAUSE_MS : 0);
  }

  return {
    lines: { type: "FeatureCollection", features: lines },
    halo: {
      type: "FeatureCollection",
      features: lines.map((f) => ({
        ...f,
        properties: {
          ...(f.properties ?? {}),
          color: f.properties?.haloColor,
          width: 8,
          opacity: 0.22,
        },
      })),
    },
    labels: { type: "FeatureCollection", features: labels },
    arrows: { type: "FeatureCollection", features: arrows },
    pulses: { type: "FeatureCollection", features: pulses },
    packet: { type: "FeatureCollection", features: packets.slice(-5) },
  };
}

function ease(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

function lerpPoint(
  a: [number, number],
  b: [number, number],
  p: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
}

function offsetPoint(
  from: [number, number],
  to: [number, number],
  _direction: "forward" | "back",
  reverse = false,
): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const offset = -0.0012 * (reverse ? -1 : 1);
  return [from[0] + (-dy / len) * offset, from[1] + (dx / len) * offset];
}

function packetTrail(
  from: [number, number],
  to: [number, number],
  progress: number,
  color: string,
): GeoJSON.Feature[] {
  return [0, 0.045, 0.09, 0.135, 0.18]
    .map((delay, i) => ({ p: progress - delay, i }))
    .filter(({ p }) => p > 0)
    .map(({ p, i }) => ({
      type: "Feature" as const,
      properties: {
        color,
        radius: Math.max(2.5, 6 - i * 0.8),
        opacity: Math.max(0.18, 0.95 - i * 0.16),
      },
      geometry: {
        type: "Point" as const,
        coordinates: lerpPoint(from, to, Math.min(p, 1)),
      },
    }));
}

function traceArrows(
  from: [number, number],
  to: [number, number],
  progress: number,
  color: string,
  opacity: number,
): GeoJSON.Feature[] {
  const bearing = lineBearing(from, to);
  return [0.38, 0.68]
    .filter((p) => p < progress - 0.08)
    .map((p) => ({
      type: "Feature" as const,
      properties: {
        color,
        opacity: Math.max(0, Math.min(opacity, 0.9)),
        rotate: bearing,
      },
      geometry: {
        type: "Point" as const,
        coordinates: lerpPoint(from, to, p),
      },
    }));
}

function lineBearing(from: [number, number], to: [number, number]): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function nodePulse(
  coordinates: [number, number],
  color: string,
  radius: number,
  opacity: number,
): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {
      color,
      radius,
      coreRadius: Math.max(4, radius * 0.18),
      opacity: Math.max(0, Math.min(opacity, 1)),
    },
    geometry: { type: "Point", coordinates },
  };
}
