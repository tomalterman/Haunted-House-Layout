// Leak check: rasterize barrier segments onto a grid and flood-fill from a start point.
// Lines are drawn as supercover (every cell the segment passes through) and the fill
// moves in 4 directions, so sloped walls have no corner gaps to slip through.

export function reachableFrom(barriers, room, start, cell = 0.25) {
  const cols = Math.ceil(room.width / cell);
  const rows = Math.ceil(room.depth / cell);
  const blocked = new Uint8Array(cols * rows);
  const toCell = (v, max) => Math.min(max - 1, Math.max(0, Math.floor(v / cell)));

  for (const { a, b } of barriers) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (cell / 8)));
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const c = toCell(a.x + (b.x - a.x) * t, cols);
      const r = toCell(a.y + (b.y - a.y) * t, rows);
      blocked[r * cols + c] = 1;
      // Fill the corner cell when the line steps diagonally between samples.
      if (prev && prev.c !== c && prev.r !== r) blocked[prev.r * cols + c] = 1;
      prev = { c, r };
    }
  }

  const seen = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  const s = toCell(start.y, rows) * cols + toCell(start.x, cols);
  if (blocked[s]) throw new Error(`Start point ${start.x},${start.y} is on a barrier`);
  let head = 0;
  let tail = 0;
  queue[tail++] = s;
  seen[s] = 1;
  while (head < tail) {
    const i = queue[head++];
    const c = i % cols;
    const r = (i - c) / cols;
    const next = [];
    if (c > 0) next.push(i - 1);
    if (c < cols - 1) next.push(i + 1);
    if (r > 0) next.push(i - cols);
    if (r < rows - 1) next.push(i + cols);
    for (const n of next) {
      if (!seen[n] && !blocked[n]) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  return (p) => seen[toCell(p.y, rows) * cols + toCell(p.x, cols)] === 1;
}
