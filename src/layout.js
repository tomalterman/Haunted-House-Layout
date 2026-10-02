// Gym haunted house layout. Every position is in feet.
// Origin is the top-left corner of the room, x to the right, y down.
// Correct a measurement here and both views pick it up.

export const MEASUREMENTS = {
  roomWidth: 85,
  roomDepth: 60,
  wallHeight: 8,
  panelLength: 8,

  // Stage runs along the bottom wall behind the pony wall. Depth not on the sketch.
  stageDepth: 4,
  ponyStartX: 20,
  ponyLength: 50,
  ponyHeight: 4,

  tentSize: 10,
  // Left block: two tents on the bottom row against the left wall, one on top of the right one.
  // Right block: two tents along the top, one below the left one.
  rightTentsX: 65,
  rightTopGap: 4, // gap between the top wall and the right tents. Not on the sketch.

  // Diagonal runs from the top-right corner of the left block to R1's left side,
  // this far below R1's top edge (as drawn, about halfway down).
  diagonalDropOnR1: 5,

  // Serpentine partitions, placed by eye from the sketch.
  // "hang" partitions drop from the diagonal; "rise" partitions stand up from the pony wall.
  partitions: [
    { id: 'P1', x: 30, kind: 'hang', end: 51.25 }, // 4.75 ft turn gap above the pony wall
    { id: 'P2', x: 43, kind: 'rise', end: 29.85 }, // 7.65 ft turn gap below the diagonal
    { id: 'P3', x: 55, kind: 'hang', end: 47.75 }, // 8.25 ft turn gap above the pony wall
  ],

  entrance: { y0: 48, y1: 54 }, // left wall, into L1
  exit: { y0: 6, y1: 10 }, // right wall, out of R2

  // Route openings in tent sides, measured from the tent's top edge.
  l3ExitOpening: { from: 1, to: 5 }, // L3 right side
  r3EntryOpening: { from: 1, to: 8 }, // R3 left side
};

const round2 = (n) => Math.round(n * 100) / 100;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function buildLayout(m = MEASUREMENTS) {
  const W = m.roomWidth;
  const D = m.roomDepth;
  const S = m.tentSize;
  const ponyY = D - m.stageDepth;

  const tent = (id, x, y) => ({ id, x, y, size: S });
  const tents = [
    tent('L1', 0, ponyY - S),
    tent('L2', S, ponyY - S),
    tent('L3', S, ponyY - 2 * S),
    tent('R1', m.rightTentsX, m.rightTopGap),
    tent('R2', m.rightTentsX + S, m.rightTopGap),
    tent('R3', m.rightTentsX, m.rightTopGap + S),
  ];
  const T = Object.fromEntries(tents.map((t) => [t.id, t]));

  const diagA = { x: T.L3.x + S, y: T.L3.y };
  const diagB = { x: T.R1.x, y: T.R1.y + m.diagonalDropOnR1 };
  const diagonalYAt = (x) => diagA.y + ((x - diagA.x) * (diagB.y - diagA.y)) / (diagB.x - diagA.x);

  const measured = (a, b) => {
    const length = round2(dist(a, b));
    return { a, b, length, panels: Math.round(length / m.panelLength) };
  };

  const diagonal = measured(diagA, diagB);
  const corridor = measured({ x: T.R3.x, y: T.R3.y + S }, { x: T.R3.x, y: ponyY });
  const pony = { ...measured({ x: m.ponyStartX, y: ponyY }, { x: m.ponyStartX + m.ponyLength, y: ponyY }), y: ponyY };

  const partitions = m.partitions.map((p) => {
    const a = p.kind === 'hang' ? { x: p.x, y: round2(diagonalYAt(p.x)) } : { x: p.x, y: ponyY };
    const b = { x: p.x, y: p.end };
    return { id: p.id, kind: p.kind, ...measured(a, b) };
  });

  const doors = {
    entrance: { side: 'left', x: 0, y0: m.entrance.y0, y1: m.entrance.y1 },
    exit: { side: 'right', x: W, y0: m.exit.y0, y1: m.exit.y1 },
  };

  // Each door opens through a tent side; a door that runs past that side would leave a gap
  // in the wall beside the tent.
  const within = (door, lo, hi) => door.y0 >= lo && door.y1 <= hi;
  if (!within(doors.entrance, T.L1.y, T.L1.y + S)) throw new Error('Entrance door must stay within the side of tent L1');
  if (!within(doors.exit, T.R2.y, T.R2.y + S)) throw new Error('Exit door must stay within the side of tent R2');

  const h = m.wallHeight;
  const walls = [
    { id: 'outer-top', a: { x: 0, y: 0 }, b: { x: W, y: 0 }, height: h },
    { id: 'outer-bottom', a: { x: 0, y: D }, b: { x: W, y: D }, height: h },
    { id: 'outer-left-upper', a: { x: 0, y: 0 }, b: { x: 0, y: doors.entrance.y0 }, height: h },
    { id: 'outer-left-lower', a: { x: 0, y: doors.entrance.y1 }, b: { x: 0, y: D }, height: h },
    { id: 'outer-right-upper', a: { x: W, y: 0 }, b: { x: W, y: doors.exit.y0 }, height: h },
    { id: 'outer-right-lower', a: { x: W, y: doors.exit.y1 }, b: { x: W, y: D }, height: h },
    { id: 'pony', a: pony.a, b: pony.b, height: m.ponyHeight },
    { id: 'diagonal', a: diagonal.a, b: diagonal.b, height: h },
    { id: 'corridor', a: corridor.a, b: corridor.b, height: h },
    ...partitions.map((p) => ({ id: p.id, a: p.a, b: p.b, height: h })),
  ].map((w) => ({ ...w, length: round2(dist(w.a, w.b)) }));

  // Each tent side as a fixed coordinate plus the span it covers along the other axis.
  const sidesOf = (t) => ({
    top: { fixed: t.y, axis: 'x', span: [t.x, t.x + S] },
    bottom: { fixed: t.y + S, axis: 'x', span: [t.x, t.x + S] },
    left: { fixed: t.x, axis: 'y', span: [t.y, t.y + S] },
    right: { fixed: t.x + S, axis: 'y', span: [t.y, t.y + S] },
  });

  // Tent sides are closed (sidewalls) except where the route passes.
  // Openings are [from, to] intervals along each side, in absolute feet.
  const full = (t, side) => sidesOf(t)[side].span;
  const openings = {
    'L1-left': [[doors.entrance.y0, doors.entrance.y1]],
    'L1-right': [full(T.L1, 'right')],
    'L2-left': [full(T.L2, 'left')],
    'L2-top': [full(T.L2, 'top')],
    'L3-bottom': [full(T.L3, 'bottom')],
    'L3-right': [[T.L3.y + m.l3ExitOpening.from, T.L3.y + m.l3ExitOpening.to]],
    'R3-left': [[T.R3.y + m.r3EntryOpening.from, T.R3.y + m.r3EntryOpening.to]],
    'R3-top': [full(T.R3, 'top')],
    'R1-bottom': [full(T.R1, 'bottom')],
    'R1-right': [full(T.R1, 'right')],
    'R2-left': [full(T.R2, 'left')],
    'R2-right': [[doors.exit.y0, doors.exit.y1]],
  };

  const tentSides = [];
  for (const t of tents) {
    for (const [side, s] of Object.entries(sidesOf(t))) {
      const open = (openings[`${t.id}-${side}`] || []).slice().sort((p, q) => p[0] - q[0]);
      let cursor = s.span[0];
      const pieces = [];
      for (const [o0, o1] of open) {
        if (o0 > cursor) pieces.push([cursor, o0]);
        cursor = Math.max(cursor, o1);
      }
      if (cursor < s.span[1]) pieces.push([cursor, s.span[1]]);
      pieces.forEach(([p0, p1], i) => {
        const pt = (v) => (s.axis === 'x' ? { x: v, y: s.fixed } : { x: s.fixed, y: v });
        const id = pieces.length === 1 ? `tent-${t.id}-${side}` : `tent-${t.id}-${side}-${i}`;
        tentSides.push({ id, tent: t.id, side, a: pt(p0), b: pt(p1) });
      });
    }
  }

  const barriers = [...walls.map(({ id, a, b }) => ({ id, a, b })), ...tentSides];

  // Visitor route, derived from the features so it follows corrections.
  const [P1, P2, P3] = partitions;
  const mid = (u, v) => (u + v) / 2;
  const lane0 = mid(diagA.x, P1.a.x);
  const lane1 = mid(P1.a.x, P2.a.x);
  const lane2 = mid(P2.a.x, P3.a.x);
  const lane3 = mid(P3.a.x, corridor.a.x);
  const enterMid = mid(doors.entrance.y0, doors.entrance.y1);
  const exitMid = mid(doors.exit.y0, doors.exit.y1);
  const l3Open = T.L3.y + mid(m.l3ExitOpening.from, m.l3ExitOpening.to);
  const r3Open = T.R3.y + mid(m.r3EntryOpening.from, m.r3EntryOpening.to);
  const underP1 = mid(P1.b.y, ponyY);
  const overP2 = mid(P2.b.y, diagonalYAt(P2.a.x));
  const underP3 = mid(P3.b.y, ponyY);
  const route = [
    { x: -1.5, y: enterMid },
    { x: T.L1.x + S / 2, y: enterMid },
    { x: T.L2.x + S / 2, y: T.L2.y + S / 2 },
    { x: T.L3.x + S / 2, y: l3Open },
    { x: lane0, y: l3Open + 1 }, // drop a foot after leaving L3 so the curve clears the opening
    { x: lane0, y: underP1 },
    { x: lane1, y: underP1 },
    { x: lane1, y: Math.max(overP2, diagonalYAt(lane1) + 3) }, // stay below the sloping diagonal
    { x: P2.a.x, y: overP2 },
    { x: lane2, y: Math.max(overP2, diagonalYAt(lane2) + 3) },
    { x: lane2, y: underP3 },
    { x: lane3, y: underP3 },
    { x: lane3, y: r3Open },
    { x: T.R3.x + S / 2, y: r3Open },
    { x: T.R1.x + S / 2, y: T.R1.y + S / 2 },
    { x: T.R2.x + S / 2, y: exitMid },
    { x: W + 1.5, y: exitMid },
  ].map((p) => ({ x: round2(p.x), y: round2(p.y) }));

  return {
    room: { width: W, depth: D },
    wallHeight: h,
    stage: { x: 0, y: ponyY, width: W, depth: m.stageDepth },
    pony,
    tents,
    diagonal,
    corridor,
    partitions,
    doors,
    walls,
    tentSides,
    barriers,
    route,
  };
}

export const layout = buildLayout();
