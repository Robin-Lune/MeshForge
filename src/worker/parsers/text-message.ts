import type { RawMeshtasticPacket } from "../../../types";

export const ALLOWED_TEXT_MARKERS = [
  "/URGENT",
  "/SOS",
  "/ALL",
  "/SECOURS",
] as const;

export function textPayload(raw: RawMeshtasticPacket): string | null {
  const payload = raw.payload;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload.text === "string") return payload.text;
  return null;
}

export function matchingTextMarker(raw: RawMeshtasticPacket): string | null {
  if (raw.type !== "text") return null;
  const text = textPayload(raw);
  if (text === null) return null;
  return ALLOWED_TEXT_MARKERS.find((marker) => text.includes(marker)) ?? null;
}

export function isAllowedTextMessage(raw: RawMeshtasticPacket): boolean {
  if (raw.type !== "text") return true;
  return matchingTextMarker(raw) !== null;
}
