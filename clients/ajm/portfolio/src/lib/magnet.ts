/**
 * Magnetic pull for the AJ monogram (Łukasz, 2026-09-29: "the AJ should be drawn to the pointer like
 * a magnet"). Given the pointer's offset from the mark's centre, returns how far the mark leans
 * toward it: nothing on the centre or beyond `radius`, strongest at mid range, capped at `max` px,
 * and always well short of the pointer itself.
 */
export function magnetPull(dx: number, dy: number, radius = 560, max = 60): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d === 0 || d >= radius) return { x: 0, y: 0 };
  const reach = Math.min(max * Math.sin(Math.PI * (d / radius)), d * 0.45);
  const round = (v: number) => Math.round(v * 10) / 10 || 0;
  return { x: round((dx / d) * reach), y: round((dy / d) * reach) };
}
