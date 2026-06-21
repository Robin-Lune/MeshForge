// Formatage partagé (logique pure, testée). `now` est toujours injecté pour
// rester déterministe — jamais de Date.now() implicite dans ces helpers.

// Durée écoulée depuis `iso` jusqu'à `now`, en français court.
export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "jamais";
  const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
