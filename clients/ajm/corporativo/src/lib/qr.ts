/**
 * A QR-looking module pattern for the entry animation (decorative, not a scannable code):
 * the three finder squares a phone camera just saw, plus deterministic "data" modules,
 * so the page greets the visitor with the shape they scanned.
 */
export function qrPattern(size = 21, seed = 7): boolean[][] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const inFinder = (r: number, c: number, r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  const finderOn = (r: number, c: number) => {
    const edge = r === 0 || r === 6 || c === 0 || c === 6;
    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
    return edge || core;
  };
  const grid: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const origins: [number, number][] = [
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
      ];
      const finder = origins.find(([r0, c0]) => inFinder(r, c, r0, c0));
      if (finder) row.push(finderOn(r - finder[0], c - finder[1]));
      else if (origins.some(([r0, c0]) => inFinder(r, c, r0 - 1, c0 - 1) || inFinder(r, c, r0 + 1, c0 + 1))) row.push(false);
      else row.push(rand() < 0.5);
    }
    grid.push(row);
  }
  return grid;
}
