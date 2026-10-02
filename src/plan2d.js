// Top-down 2D plan as an SVG string. The viewBox is in feet, so the drawing is to scale.

export const PLAN_STYLE = {
  viewBox: [-7, -6, 97, 70], // x, y, width, height in feet, with margins for labels
  wall: 0.7,
  tentSide: 0.2,
  route: 0.4,
  label: 2.6, // font size in feet: about 10.5 px when the plan is 390 px wide
};

const CHAR_WIDTH = 0.6; // conservative average glyph width, as a share of font size

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => Math.round(n * 100) / 100;

function labelBox(x, y, text, angleDeg, size) {
  const w = text.length * CHAR_WIDTH * size;
  const h = size;
  const t = (angleDeg * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t));
  const bh = Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t));
  return { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
}

export function planLabels(l) {
  const L = PLAN_STYLE.label;
  const out = [];
  const add = (text, x, y, angle = 0, cls = 'label') =>
    out.push({ text, x: num(x), y: num(y), angle: num(angle), cls, box: labelBox(x, y, text, angle, L) });

  const W = l.room.width;
  const D = l.room.depth;
  add(`${fmt(W)} ft`, W / 2, -3.2, 0, 'dim');
  add(`${fmt(D)} ft`, -4.6, D * 0.35, -90, 'dim');

  const d = l.diagonal;
  const dx = d.b.x - d.a.x;
  const dy = d.b.y - d.a.y;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const off = 2.2; // offset toward the off-route side above the wall
  add(
    `Diagonal ${d.length.toFixed(1)} ft · ${d.panels} panels`,
    (d.a.x + d.b.x) / 2 + (dy / len) * off,
    (d.a.y + d.b.y) / 2 - (dx / len) * off,
    angle,
  );

  const c = l.corridor;
  add(`${fmt(c.length)} ft · ${c.panels} panels`, c.a.x + 1.9, (c.a.y + c.b.y) / 2, 90);

  add(`Stage · pony wall ${fmt(l.pony.length)} ft`, (l.pony.a.x + l.pony.b.x) / 2, l.stage.y + l.stage.depth / 2 + 0.2, 0, 'stage-label');

  for (const t of l.tents) add(`${fmt(t.size)}×${fmt(t.size)}`, t.x + t.size / 2, t.y + 2.4, 0, 'tent-label');

  const e = l.doors.entrance;
  add('Entrance', -2.4, (e.y0 + e.y1) / 2, -90, 'door-label');
  const x = l.doors.exit;
  add('Exit', W + 2.4, (x.y0 + x.y1) / 2, 90, 'door-label');
  return out;
}

function offRouteAreas(l) {
  const T = Object.fromEntries(l.tents.map((t) => [t.id, t]));
  const W = l.room.width;
  const S = T.L1.size;
  const above = [
    [0, 0], [W, 0], [W, T.R1.y], [T.R1.x, T.R1.y], [l.diagonal.b.x, l.diagonal.b.y],
    [l.diagonal.a.x, l.diagonal.a.y], [T.L3.x, T.L3.y], [T.L3.x, T.L1.y], [0, T.L1.y],
  ];
  const right = [
    [T.R2.x, T.R2.y + S], [W, T.R2.y + S], [W, l.pony.y], [l.corridor.a.x, l.pony.y],
    [l.corridor.a.x, T.R3.y + S], [T.R3.x + S, T.R3.y + S],
  ];
  return [above, right].map((pts) => pts.map(([px, py]) => `${num(px)},${num(py)}`).join(' '));
}

function smoothPath(pts) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1 = { x: num(p1.x + (p2.x - p0.x) / 6), y: num(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: num(p2.x - (p3.x - p1.x) / 6), y: num(p2.y - (p3.y - p1.y) / 6) };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

function arrow(p, q) {
  const a = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  return `<path class="route-arrow" d="M1.1,0 L-0.8,-0.9 L-0.8,0.9 Z" transform="translate(${p.x},${p.y}) rotate(${num(a)})"/>`;
}

const line = (cls, a, b, extra = '') =>
  `<line class="${cls}" x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}"${extra}/>`;

export function renderPlan2D(l) {
  const S = PLAN_STYLE;
  const W = l.room.width;
  const D = l.room.depth;
  const parts = [];

  parts.push(`<title id="plan-title">Gym haunted house layout, to scale</title>`);
  parts.push(
    `<desc>Top-down plan of the ${fmt(W)} by ${fmt(D)} foot gym. Walls funnel visitors from the entrance on the left wall through three tents, ` +
      `an S-shaped serpentine of three partitions below a ${l.diagonal.length.toFixed(1)} foot diagonal wall, three more tents, and out the exit on the right wall.</desc>`,
  );
  parts.push(
    `<style>` +
      `.floor{fill:var(--plan-floor,#efe6d2)}` +
      `.off{fill:var(--plan-off,#d9d6cf)}` +
      `.stage{fill:var(--plan-stage,#c9c3b8)}` +
      `.tent{fill:var(--plan-tent,#f7f1e3);stroke:none}` +
      `.tent-side{stroke:var(--plan-tent-side,#8a8578);stroke-width:${S.tentSide};stroke-linecap:square}` +
      `.wall{stroke:var(--plan-wall,#17171a);stroke-width:${S.wall};stroke-linecap:square}` +
      `.wall[data-short]{stroke-width:${S.wall * 0.6}}` +
      `.door{stroke:var(--plan-door,#2f7d5b);stroke-width:1.1}` +
      `.route-line{fill:none;stroke:var(--plan-route,#8a4fd1);stroke-width:${S.route};stroke-dasharray:1.1 0.8;stroke-linecap:round}` +
      `.route-arrow{fill:var(--plan-route,#8a4fd1)}` +
      `.dim-line{stroke:var(--plan-dim,#6b6760);stroke-width:0.15}` +
      `text{font-family:var(--plan-font,system-ui,sans-serif);font-size:${S.label}px;fill:var(--plan-text,#2b2a27);text-anchor:middle;dominant-baseline:central}` +
      `.dim,.tent-label,.stage-label{fill:var(--plan-muted,#5c5850)}` +
      `.door-label{fill:var(--plan-door,#2f7d5b);font-weight:600}` +
      `.label{font-weight:600}` +
      `</style>`,
  );

  parts.push(`<rect class="floor" x="0" y="0" width="${W}" height="${D}"/>`);
  for (const pts of offRouteAreas(l)) parts.push(`<polygon class="off" points="${pts}"/>`);
  parts.push(`<rect class="stage" x="${l.stage.x}" y="${l.stage.y}" width="${l.stage.width}" height="${l.stage.depth}"/>`);

  for (const t of l.tents) parts.push(`<rect class="tent" x="${t.x}" y="${t.y}" width="${t.size}" height="${t.size}"/>`);
  for (const s of l.tentSides) parts.push(line('tent-side', s.a, s.b));

  // Dimension lines in the margin.
  parts.push(line('dim-line', { x: 0, y: -3.2 }, { x: W / 2 - 4.6, y: -3.2 }));
  parts.push(line('dim-line', { x: W / 2 + 4.6, y: -3.2 }, { x: W, y: -3.2 }));
  parts.push(line('dim-line', { x: 0, y: -4.2 }, { x: 0, y: -2.2 }));
  parts.push(line('dim-line', { x: W, y: -4.2 }, { x: W, y: -2.2 }));

  const route = l.route;
  const arrows = [2, 5, 8, 11, 14, 17].filter((i) => i < route.length - 1).map((i) => arrow(route[i], route[i + 1]));
  parts.push(`<g id="route"><path class="route-line" d="${smoothPath(route)}"/>${arrows.join('')}</g>`);

  for (const w of l.walls) {
    const short = w.height < l.wallHeight ? ' data-short="true"' : '';
    parts.push(line('wall', w.a, w.b, ` data-id="${w.id}"${short}`));
  }

  const e = l.doors.entrance;
  const x = l.doors.exit;
  parts.push(line('door', { x: -0.6, y: e.y0 }, { x: -0.6, y: e.y1 }));
  parts.push(line('door', { x: W + 0.6, y: x.y0 }, { x: W + 0.6, y: x.y1 }));

  for (const lb of planLabels(l)) {
    const rot = lb.angle ? ` transform="rotate(${lb.angle} ${lb.x} ${lb.y})"` : '';
    parts.push(`<text class="${lb.cls}" x="${lb.x}" y="${lb.y}"${rot}>${esc(lb.text)}</text>`);
  }

  const vb = S.viewBox.join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-labelledby="plan-title" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
