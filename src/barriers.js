// Leak check: rasterize barrier segments onto a grid and flood-fill from a start point.
// Lines are drawn as supercover (every cell the segment passes through) and the fill
// moves in 4 directions, so sloped walls have no corner gaps to slip through.
//
// The grid extends PAD feet past the room on every side. That margin is solid except a
// pocket directly outside each door, so a probe placed outside the entrance can only get
// in, and a probe outside the exit can only be reached, through the real door gaps.

const PAD = 1;

export function reachableFrom(barriers, room, start, { cell = 0.25, doors = [] } = {}) {
  const cols = Math.ceil((room.width + 2 * PAD) / cell);
  const rows = Math.ceil((room.depth + 2 * PAD) / cell);
  const blocked = new Uint8Array(cols * rows);
  const col = (x) => Math.min(cols - 1, Math.max(0, Math.floor((x + PAD) / cell)));
  const row = (y) => Math.min(rows - 1, Math.max(0, Math.floor((y + PAD) / cell)));

  // Block the margin outside the room, then open a pocket in front of each door.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell - PAD + cell / 2;
      const y = r * cell - PAD + cell / 2;
      if (x < 0 || x > room.width || y < 0 || y > room.depth) blocked[r * cols + c] = 1;
    }
  }
  for (const d of doors) {
    const c0 = d.side === 'left' ? col(-PAD) : col(room.width + cell / 2);
    const c1 = d.side === 'left' ? col(-cell / 2) : col(room.width + PAD - cell / 2);
    for (let r = row(d.y0); r <= row(d.y1 - cell / 2); r++) {
      for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 0;
    }
  }

  for (const { a, b } of barriers) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (cell / 8)));
    let prevC = -1;
    let prevR = -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const c = col(a.x + (b.x - a.x) * t);
      const r = row(a.y + (b.y - a.y) * t);
      blocked[r * cols + c] = 1;
      // Fill the corner cell when the line steps diagonally between samples.
      if (prevC >= 0 && prevC !== c && prevR !== r) blocked[prevR * cols + c] = 1;
      prevC = c;
      prevR = r;
    }
  }

  // Breadth-first fill; dist holds the walking distance in cells from the start.
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  const s = row(start.y) * cols + col(start.x);
  if (blocked[s]) throw new Error(`Start point ${start.x},${start.y} is on a barrier`);
  let head = 0;
  let tail = 0;
  queue[tail++] = s;
  dist[s] = 0;
  const visit = (n, from) => {
    if (dist[n] < 0 && !blocked[n]) {
      dist[n] = dist[from] + 1;
      queue[tail++] = n;
    }
  };
  while (head < tail) {
    const i = queue[head++];
    const c = i % cols;
    if (c > 0) visit(i - 1, i);
    if (c < cols - 1) visit(i + 1, i);
    if (i >= cols) visit(i - cols, i);
    if (i < cols * (rows - 1)) visit(i + cols, i);
  }

  const at = (p) => dist[row(p.y) * cols + col(p.x)];
  const reach = (p) => at(p) >= 0;
  // Shortest walking distance in feet (grid steps), or Infinity when unreachable.
  reach.distance = (p) => (at(p) >= 0 ? at(p) * cell : Infinity);
  return reach;
}
