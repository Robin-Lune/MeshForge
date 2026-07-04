type ScreenBox = { x: number; y: number; w: number; h: number };

export function nodeIdFromMarkerKey(key: string): string {
  const index = key.indexOf(":");
  return index === -1 ? key : key.slice(index + 1);
}

export function markerBoxes(container: HTMLElement): ScreenBox[] {
  const base = container.getBoundingClientRect();
  return [...container.querySelectorAll<HTMLElement>(".maplibregl-marker")]
    .filter((el) => !el.classList.contains("mf-trace-packet"))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - base.left - 3,
        y: r.top - base.top - 3,
        w: r.width + 6,
        h: r.height + 6,
      };
    });
}

export function placeTraceLabel(
  el: HTMLElement,
  x: number,
  y: number,
  isBack: boolean,
  occupied: ScreenBox[],
): ScreenBox {
  const side = isBack ? 1 : -1;
  const candidates = labelCandidates(side);
  const bounds = el.parentElement
    ? { w: el.parentElement.clientWidth, h: el.parentElement.clientHeight }
    : null;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let best: { box: ScreenBox; score: number } | null = null;

  for (const [dx, dy] of candidates) {
    const box = { x: x + dx - w / 2, y: y + dy - h / 2, w, h };
    const score =
      occupied.reduce((sum, other) => sum + overlapArea(box, other), 0) +
      outOfBoundsArea(box, bounds);

    if (score === 0) {
      el.style.left = `${Math.round(box.x)}px`;
      el.style.top = `${Math.round(box.y)}px`;
      return box;
    }
    if (!best || score < best.score) best = { box, score };
  }

  const box = best?.box ?? { x: x - w / 2, y: y - h / 2, w, h };
  el.style.left = `${Math.round(box.x)}px`;
  el.style.top = `${Math.round(box.y)}px`;
  return box;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labelCandidates(side: number): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  for (const distance of [16, 28, 42, 58]) {
    for (const dx of [0, 22, -22, 44, -44, 70, -70]) {
      candidates.push([dx, distance * side]);
    }
  }
  for (const distance of [16, 30, 46]) {
    for (const dx of [0, 28, -28, 56, -56]) {
      candidates.push([dx, -distance * side]);
    }
  }
  return candidates;
}

function boxesOverlap(a: ScreenBox, b: ScreenBox): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function overlapArea(a: ScreenBox, b: ScreenBox): number {
  if (!boxesOverlap(a, b)) return 0;
  return (
    (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  );
}

function outOfBoundsArea(
  box: ScreenBox,
  bounds: { w: number; h: number } | null,
): number {
  if (!bounds) return 0;
  const outsideX = Math.max(0, -box.x) + Math.max(0, box.x + box.w - bounds.w);
  const outsideY = Math.max(0, -box.y) + Math.max(0, box.y + box.h - bounds.h);
  return (outsideX * box.h + outsideY * box.w) * 3;
}
