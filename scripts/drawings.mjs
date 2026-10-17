// Build drawings for the hidden ball drop: dimensioned, CAD-style sketch sheets generated from
// the same geometry the sandbox simulates (src/scenes/ball-drop-rig.js), so the drawings and the
// model cannot drift apart. Writes SVG sheets and one printable HTML set to docs/drawings/.
//
//   node scripts/drawings.mjs
//
// Sheets are 17 x 11 in (tabloid, landscape). Lumber sizes are actual dimensions of nominal
// stock (a 2x4 is 1 1/2 x 3 1/2 in).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../src/layout.js';
import { createPhysics } from '../src/physics.js';
import rig, { at, geometry as g } from '../src/scenes/ball-drop-rig.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'drawings');
const DATE = '2026-10-17';
const W = 1632; // 17 in at 96 px/in
const H = 1056; // 11 in
const PX_IN = 96;
const DEG = Math.PI / 180;
const COS = Math.cos(g.slope * DEG);
const SIN = Math.sin(g.slope * DEG);
const IN = 1 / 12; // one inch in feet

// Lumber and sheet goods, actual sizes in feet.
const PLY = 0.75 * IN;
const T2 = 1.5 * IN; // 2x thickness
const D4 = 3.5 * IN; // 2x4 / 4x4 depth
const D6 = 5.5 * IN; // 2x6 depth
const STUD_WALL = D4; // booth walls are 2x4 framing

// ---------------------------------------------------------------------------------------------
// Formatting

function ftIn(ft, { aff = false } = {}) {
  let inches = Math.round(Math.abs(ft) * 12 * 8) / 8;
  const sign = ft < 0 ? '-' : '';
  let f = Math.floor(inches / 12 + 1e-9);
  let i = inches - f * 12;
  if (i > 12 - 1e-9) {
    f += 1;
    i = 0;
  }
  const whole = Math.floor(i + 1e-9);
  let n = Math.round((i - whole) * 8);
  let d = 8;
  while (n && n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  const frac = n ? ` ${n}/${d}` : '';
  return `${sign}${f}'-${whole}${frac}"${aff ? ' AFF' : ''}`;
}
const inches = (ft) => {
  const s = ftIn(ft);
  return s.startsWith("0'-") ? s.slice(3) : s;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Geometry helpers in the wall's frame: `along` the wall from the middle of the opening, `out`
// from the wall's centerline toward the lane, `h` above the floor.

const deck = g.deckTop;
const vert = (t) => t / COS; // vertical thickness of a layer t thick, square to the deck
const joistBottom = (out) => deck(out) - vert(PLY + D4);
const origin = at(0, 0, 0);
const uVec = { x: at(1, 0, 0).x - origin.x, y: at(1, 0, 0).y - origin.y };
const nVec = { x: at(0, 1, 0).x - origin.x, y: at(0, 1, 0).y - origin.y };
const toLocal = (p) => ({
  along: (p.x - origin.x) * uVec.x + (p.y - origin.y) * uVec.y,
  out: (p.x - origin.x) * nVec.x + (p.y - origin.y) * nVec.y,
  h: p.height ?? 0,
});
const toPlan = (along, out) => at(along, out, 0);
// Lane-facing distance along the deck from its lip, for marking out on the plywood.
const fromLip = (out) => (g.lip - out) / COS;

const boothBackIn = -g.boothD + STUD_WALL; // inside face of the booth back wall
const frontBack = g.frontFace - STUD_WALL; // back face of the booth front wall
const halfW = g.boothW / 2;
const returnOuter = halfW;
const returnInner = halfW - STUD_WALL;
const drapeHalf = g.drapeW / 2;
const railIn = g.railAt - 0.075; // inner face of each rail
const barLen = 2 * g.railAt - 0.2;
const barHalf = barLen / 2;
const batten = { out: g.drapeOut, bottom: g.drapeTop, top: g.drapeTop + D4 };
const outrigger = { from: frontBack, to: g.drapeOut + 0.25, top: g.boothH, bottom: g.boothH - D6 };
const PIN_STATIONS = [-1, 1].flatMap((s) => [0.9, 2.71, 4.51].map((a) => s * a)).sort((a, b) => a - b);
const plateTop = joistBottom(g.frontFace); // booth front lower wall, top of beveled double plate
const beamTop = (out) => joistBottom(out + T2); // doubled 2x6 beam, top under the joists
const beamSpan = { mid: g.midBeam, rear: g.rearBeam };
const platformBack = boothBackIn;
const platformDepth = g.platform.front - platformBack;
const GUARD = 3.5; // guardrail height above the platform
const hoistPulley = { out: boothBackIn + 0.2, h: 14.5 };
const doorOut = [-9.35, -11.35];

// ---------------------------------------------------------------------------------------------
// The release, simulated: the ball's path and the rig's state over time, in the wall's frame.

function simulateRelease() {
  const physics = createPhysics(layout, rig);
  const fx = (id) => physics.fixtures().find((f) => f.id === id);
  const drapeRestH = fx('kabuki-drape').height;
  const frames = [];
  const sample = (t) => {
    const b = physics.poses()[0];
    const l = toLocal({ x: b.x, y: b.y, height: b.height });
    frames.push({ t, along: l.along, out: l.out, h: b.height, plan: { x: b.x, y: b.y }, bar: fx('stop-bar').angle, drapeDrop: drapeRestH - fx('kabuki-drape').height });
  };
  sample(0);
  physics.release();
  for (let i = 1; i <= 60 * 12; i++) {
    physics.step(1 / 60);
    sample(i / 60);
  }
  const at = (t) => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best));
  const landing = frames.find((f) => f.h < g.ballR + 0.15);
  const leavesLip = frames.find((f) => f.h < g.ballCenter.height && f.out - g.ballR * SIN > g.lip);
  return { frames, at, landing, leavesLip };
}
const sim = simulateRelease();
const landingLocal = { along: sim.landing.along, out: sim.landing.out };

// ---------------------------------------------------------------------------------------------
// Sheets and views

const STYLE = `
  .cut { stroke:#111; stroke-width:2; fill:url(#hatch); }
  .cutsolid { stroke:#111; stroke-width:2; fill:#1b1b1b; }
  .vis { stroke:#111; stroke-width:1.2; fill:none; }
  .visf { stroke:#111; stroke-width:1.2; fill:#fff; }
  .lite { stroke:#777; stroke-width:0.8; fill:none; }
  .litef { stroke:#777; stroke-width:0.8; fill:#f1f1f1; }
  .black { stroke:#111; stroke-width:1; fill:#2b2b30; }
  .grayf { stroke:#555; stroke-width:0.8; fill:#d9d9dc; }
  .hid { stroke:#555; stroke-width:0.9; fill:none; stroke-dasharray:6 4; }
  .ctr { stroke:#999; stroke-width:0.7; fill:none; stroke-dasharray:16 4 3 4; }
  .dim { stroke:#1a4fa0; stroke-width:0.7; fill:none; }
  .dimt { fill:#1a4fa0; font:11px 'DejaVu Sans', Arial, sans-serif; }
  .lbl { fill:#111; font:11px 'DejaVu Sans', Arial, sans-serif; }
  .lbls { fill:#333; font:9.5px 'DejaVu Sans', Arial, sans-serif; }
  .lblb { fill:#111; font:bold 11px 'DejaVu Sans', Arial, sans-serif; }
  .vt { fill:#111; font:bold 15px 'DejaVu Sans', Arial, sans-serif; }
  .vs { fill:#444; font:11px 'DejaVu Sans', Arial, sans-serif; }
  .ldr { stroke:#111; stroke-width:0.6; fill:none; }
  .ball { stroke:#111; stroke-width:1.4; fill:#fbfbf8; }
  .ghost { stroke:#888; stroke-width:1; fill:none; stroke-dasharray:4 3; }
  .path { stroke:#c0392b; stroke-width:1.2; fill:none; stroke-dasharray:3 3; }
  .zone { fill:#d33; fill-opacity:0.12; stroke:#d33; stroke-width:1; stroke-dasharray:5 3; }
  .route { stroke:#7b3fbf; stroke-width:1.5; fill:none; stroke-dasharray:8 4; }
  .lineK { stroke:#c0392b; stroke-width:1.6; fill:none; }
  .lineB { stroke:#1f7a3a; stroke-width:1.6; fill:none; }
  .lineR { stroke:#d68910; stroke-width:1.6; fill:none; stroke-dasharray:7 3; }
  .lineH { stroke:#1a4fa0; stroke-width:1.6; fill:none; stroke-dasharray:2 3; }
  .lineL { stroke:#7b3fbf; stroke-width:1.6; fill:none; }
  .red { stroke:#8e1d14; stroke-width:1.2; fill:#d23b2a; }
  .floor { stroke:#111; stroke-width:1.6; }
  .tb { stroke:#111; stroke-width:1.2; fill:#fff; }
  .tbl { stroke:#999; stroke-width:0.6; }
`;
const DEFS = `<defs>
  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" fill="#f4efe4"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8a6d3b" stroke-width="0.8"/>
  </pattern>
  <pattern id="ground" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="10" stroke="#aaa" stroke-width="0.6"/>
  </pattern>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#111"/>
  </marker>
  <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
    <circle cx="5" cy="5" r="4" fill="#111"/>
  </marker>
</defs>`;

const SHEETS = [];

class Sheet {
  constructor(number, title, scale) {
    this.number = number;
    this.title = title;
    this.scale = scale;
    this.parts = [];
    this.clips = 0;
    SHEETS.push(this);
  }
  add(s) {
    this.parts.push(s);
  }
  text(x, y, str, cls = 'lbl', anchor = 'start', extra = '') {
    this.add(`<text x="${r2(x)}" y="${r2(y)}" class="${cls}" text-anchor="${anchor}" ${extra}>${esc(str)}</text>`);
  }
  lines(x, y, rows, { cls = 'lbl', lh = 14, anchor = 'start' } = {}) {
    rows.forEach((row, i) => {
      if (row === '') return;
      const bold = row.startsWith('**');
      this.text(x, y + i * lh, bold ? row.replace(/\*\*/g, '') : row, bold ? 'lblb' : cls, anchor);
    });
    return y + rows.length * lh;
  }
  // Keyed notes legend: rows of [n, text lines...].
  keyed(x, y, items, { lh = 13, title = 'KEYED NOTES' } = {}) {
    this.text(x, y, title, 'vt');
    let yy = y + 22;
    for (const [n, ...rows] of items) {
      this.add(`<circle cx="${x + 9}" cy="${yy - 4}" r="9" fill="#fff" stroke="#111" stroke-width="1"/>`);
      this.text(x + 9, yy, String(n), 'lblb', 'middle', 'style="font-size:10px"');
      rows.forEach((row, i) => this.text(x + 26, yy + i * lh, row, 'lbl'));
      yy += Math.max(1, rows.length) * lh + 7;
    }
    return yy;
  }
  // A simple table: columns [{ title, width }], rows of strings.
  table(x, y, cols, rows, { lh = 15, size = 'lbl' } = {}) {
    const total = cols.reduce((s, c) => s + c.width, 0);
    this.add(`<rect x="${x}" y="${y}" width="${total}" height="${lh * (rows.length + 1) + 4}" class="tb"/>`);
    let cx = x;
    for (const c of cols) {
      this.text(cx + 4, y + lh - 3, c.title, 'lblb');
      cx += c.width;
    }
    rows.forEach((row, ri) => {
      const ry = y + lh * (ri + 2) - 3;
      this.add(`<line x1="${x}" y1="${y + lh * (ri + 1) + 2}" x2="${x + total}" y2="${y + lh * (ri + 1) + 2}" class="tbl"/>`);
      let rx = x;
      row.forEach((cell, ci) => {
        this.text(rx + 4, ry, cell, size);
        rx += cols[ci].width;
      });
    });
    return y + lh * (rows.length + 1) + 4;
  }
  svg() {
    const tbx = W - 560;
    const tby = H - 112;
    const block = `
      <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#111" stroke-width="2"/>
      <rect x="${tbx}" y="${tby}" width="542" height="94" class="tb"/>
      <line x1="${tbx}" y1="${tby + 30}" x2="${tbx + 542}" y2="${tby + 30}" class="tbl"/>
      <line x1="${tbx + 430}" y1="${tby}" x2="${tbx + 430}" y2="${tby + 94}" class="tbl"/>
      <text x="${tbx + 8}" y="${tby + 20}" class="lblb">GYM HAUNTED HOUSE: HIDDEN BALL DROP (GROUP 4)</text>
      <text x="${tbx + 8}" y="${tby + 50}" class="vt">${esc(this.title)}</text>
      <text x="${tbx + 8}" y="${tby + 64}" class="lbls">Scale: ${esc(this.scale)} (on a 17 x 11 in sheet)</text>
      <text x="${tbx + 8}" y="${tby + 76}" class="lbls">Planning sketch: verify every dimension on site before cutting.</text>
      <text x="${tbx + 8}" y="${tby + 88}" class="lbls">From the sandbox model (src/scenes/ball-drop-rig.js), scripts/drawings.mjs</text>
      <text x="${tbx + 486}" y="${tby + 20}" class="lbls" text-anchor="middle">SHEET</text>
      <text x="${tbx + 486}" y="${tby + 62}" class="vt" text-anchor="middle" style="font-size:28px">${esc(this.number)}</text>
      <text x="${tbx + 486}" y="${tby + 84}" class="lbls" text-anchor="middle">${DATE}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${STYLE}</style>${DEFS}
<rect width="${W}" height="${H}" fill="#fff"/>
${this.parts.join('\n')}
${block}
</svg>`;
  }
}

// A drawing view: `scale` px per ft, with world (u right, v up) mapped onto the sheet. Everything
// drawn through a view is clipped to its box.
function view(sheet, { x, y, w, h, scale, u0, v1, title, subtitle, clip = true }) {
  const X = (u) => x + (u - u0) * scale;
  const Y = (v) => y + (v1 - v) * scale;
  const id = `clip${sheet.number.replace(/\W/g, '')}_${sheet.clips++}`;
  const open = clip ? `<g clip-path="url(#${id})">` : '<g>';
  sheet.add(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`);
  const buf = [];
  const over = []; // dimensions, notes, and keys: drawn on top and never clipped
  const v = {
    X,
    Y,
    scale,
    add: (s) => buf.push(s),
    line(u1, v1_, u2, v2, cls = 'vis', extra = '') {
      buf.push(`<line x1="${r2(X(u1))}" y1="${r2(Y(v1_))}" x2="${r2(X(u2))}" y2="${r2(Y(v2))}" class="${cls}" ${extra}/>`);
    },
    poly(pts, cls = 'vis', closed = true, extra = '') {
      const d = pts.map(([u, w2]) => `${r2(X(u))},${r2(Y(w2))}`).join(' ');
      buf.push(`<${closed ? 'polygon' : 'polyline'} points="${d}" class="${cls}" ${extra}/>`);
    },
    rect(u1, v1_, u2, v2, cls = 'vis') {
      v.poly([[u1, v1_], [u2, v1_], [u2, v2], [u1, v2]], cls);
    },
    circle(u, w2, rad, cls = 'vis') {
      buf.push(`<circle cx="${r2(X(u))}" cy="${r2(Y(w2))}" r="${r2(rad * scale)}" class="${cls}"/>`);
    },
    text(u, w2, str, cls = 'lbl', anchor = 'start', dx = 0, dy = 0, rot = 0) {
      const tx = X(u) + dx;
      const ty = Y(w2) + dy;
      buf.push(`<text x="${r2(tx)}" y="${r2(ty)}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${r2(rot)} ${r2(tx)} ${r2(ty)})"` : ''}>${esc(str)}</text>`);
    },
    // Aligned dimension from a to b, offset `off` ft to the left of a->b (negative: right).
    dim(a, b, off, label, { textOff = 4, ext = true } = {}) {
      const du = b[0] - a[0];
      const dv = b[1] - a[1];
      const len = Math.hypot(du, dv);
      const nu = -dv / len;
      const nv = du / len;
      const pa = [a[0] + nu * off, a[1] + nv * off];
      const pb = [b[0] + nu * off, b[1] + nv * off];
      const s = Math.sign(off) || 1;
      if (ext) {
        v.line(a[0] + nu * 0.12 * s, a[1] + nv * 0.12 * s, pa[0] + nu * 0.18 * s, pa[1] + nv * 0.18 * s, 'dim');
        v.line(b[0] + nu * 0.12 * s, b[1] + nv * 0.12 * s, pb[0] + nu * 0.18 * s, pb[1] + nv * 0.18 * s, 'dim');
      }
      const keep = buf.length;
      v.line(pa[0], pa[1], pb[0], pb[1], 'dim');
      // Architectural ticks.
      for (const p of [pa, pb]) {
        const cx = X(p[0]);
        const cy = Y(p[1]);
        const ang = Math.atan2(-(dv), du) + Math.PI / 4;
        buf.push(`<line x1="${r2(cx - 5 * Math.cos(ang))}" y1="${r2(cy - 5 * Math.sin(ang))}" x2="${r2(cx + 5 * Math.cos(ang))}" y2="${r2(cy + 5 * Math.sin(ang))}" class="dim" style="stroke-width:1.3"/>`);
      }
      let ang = (Math.atan2(-dv, du) * 180) / Math.PI;
      if (ang > 90.01) ang -= 180;
      if (ang < -90.01) ang += 180;
      const mx = (X(pa[0]) + X(pb[0])) / 2;
      const my = (Y(pa[1]) + Y(pb[1])) / 2;
      // Put the text on the outside of the dimension line, away from the object.
      const sx = nu * s;
      const sy = -nv * s;
      const tx = mx + sx * (textOff + 2);
      const ty = my + sy * (textOff + 2) + 4;
      buf.push(`<text x="${r2(tx)}" y="${r2(ty)}" class="dimt" text-anchor="middle" transform="rotate(${r2(ang)} ${r2(tx)} ${r2(ty - 4)})">${esc(label ?? ftIn(len))}</text>`);
      over.push(...buf.splice(ext ? keep - 2 : keep));
    },
    // Height marker: a small triangle at (u, v), a leader out to `toU`, and a label there,
    // nudged `dy` px up or down so stacked markers stay readable.
    elev(u, w2, label, { side = 1, toU = null, dy = 0 } = {}) {
      const cx = X(u);
      const cy = Y(w2);
      const ex = toU === null ? cx + 30 * side : X(toU);
      over.push(`<path d="M${r2(cx)},${r2(cy)} l-5,-8 h10 z" fill="#1a4fa0"/>`);
      over.push(`<polyline points="${r2(cx)},${r2(cy)} ${r2(ex - 8 * side)},${r2(cy)} ${r2(ex)},${r2(cy + dy)}" class="dim"/>`);
      over.push(`<text x="${r2(ex + 4 * side)}" y="${r2(cy + dy + 4)}" class="dimt" text-anchor="${side > 0 ? 'start' : 'end'}">${esc(label)}</text>`);
    },
    // Keyed note: a leader from (u, v) to a numbered circle `dx`, `dy` px away.
    key(u, w2, n, dx, dy) {
      const px = X(u);
      const py = Y(w2);
      const kx = px + dx;
      const ky = py + dy;
      const len = Math.hypot(dx, dy) || 1;
      over.push(`<line x1="${r2(px)}" y1="${r2(py)}" x2="${r2(kx - (dx / len) * 9)}" y2="${r2(ky - (dy / len) * 9)}" class="ldr" marker-start="url(#dot)"/>`);
      over.push(`<circle cx="${r2(kx)}" cy="${r2(ky)}" r="9" fill="#fff" stroke="#111" stroke-width="1"/>`);
      over.push(`<text x="${r2(kx)}" y="${r2(ky + 4)}" class="lblb" text-anchor="middle" style="font-size:10px">${n}</text>`);
    },
    // Leader from a point to a label at a sheet-pixel offset.
    note(u, w2, dx, dy, rows, { anchor } = {}) {
      const px = X(u);
      const py = Y(w2);
      const tx = px + dx;
      const ty = py + dy;
      const a = anchor ?? (dx >= 0 ? 'start' : 'end');
      over.push(`<polyline points="${r2(px)},${r2(py)} ${r2(tx)},${r2(ty)} ${r2(tx + (a === 'start' ? 6 : -6))},${r2(ty)}" class="ldr" marker-start="url(#dot)"/>`);
      const rowsArr = Array.isArray(rows) ? rows : [rows];
      rowsArr.forEach((row, i) => {
        over.push(`<text x="${r2(tx + (a === 'start' ? 9 : -9))}" y="${r2(ty + 4 + i * 12)}" class="lbl" text-anchor="${a}">${esc(row)}</text>`);
      });
    },
    // A detail or section callout bubble.
    bubble(u, w2, label, sheetRef) {
      const cx = X(u);
      const cy = Y(w2);
      over.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="15" fill="#fff" stroke="#111" stroke-width="1.2"/>`);
      over.push(`<line x1="${r2(cx - 15)}" y1="${r2(cy)}" x2="${r2(cx + 15)}" y2="${r2(cy)}" stroke="#111" stroke-width="0.8"/>`);
      over.push(`<text x="${r2(cx)}" y="${r2(cy - 3)}" class="lblb" text-anchor="middle">${esc(label)}</text>`);
      over.push(`<text x="${r2(cx)}" y="${r2(cy + 11)}" class="lbls" text-anchor="middle">${esc(sheetRef)}</text>`);
    },
    figure(u, base, height = 6, cls = 'lite') {
      // A simple person outline for scale.
      const hd = height * 0.13;
      v.circle(u, base + height - hd / 2, hd / 2, cls);
      v.line(u, base + height - hd, u, base + height * 0.47, cls);
      v.line(u, base + height * 0.47, u - height * 0.1, base, cls);
      v.line(u, base + height * 0.47, u + height * 0.1, base, cls);
      v.line(u - height * 0.15, base + height * 0.62, u + height * 0.15, base + height * 0.72, cls);
    },
  };
  v.finish = () => {
    sheet.add(`${open}${buf.join('\n')}</g>`);
    sheet.add(over.join('\n'));
    if (title) {
      sheet.add(`<text x="${x}" y="${y + h + 22}" class="vt">${esc(title)}</text>`);
      if (subtitle) sheet.add(`<text x="${x}" y="${y + h + 38}" class="vs">${esc(subtitle)}</text>`);
    }
  };
  return v;
}

// A polyline of the deck surface between two out positions, offset down by `drop` (vertical ft).
const deckLine = (from, to, drop = 0) => [
  [from, deck(from) - drop],
  [to, deck(to) - drop],
];

// ---------------------------------------------------------------------------------------------
// The section through the middle of the opening (used full size on A-2, small on A-6).

function drawSection(v, { state = null, detail = true } = {}) {
  const bar = state ? state.bar : 0;
  const drapeDrop = state ? state.drapeDrop : 0;
  const ball = state ? { out: state.out, h: state.h } : { out: g.ballCenter.out, h: g.ballCenter.height };

  // Floor.
  v.add(`<rect x="${r2(v.X(-13.5))}" y="${r2(v.Y(0))}" width="${r2(25.5 * v.scale)}" height="${r2(0.45 * v.scale)}" fill="url(#ground)"/>`);
  v.line(-13.5, 0, 12, 0, 'floor');

  // Booth side wall beyond (inside face), and its top.
  v.rect(-g.boothD, 0, g.frontFace, g.boothH, 'lite');
  if (detail) {
    // Door in the side wall beyond.
    v.rect(doorOut[1], 0, doorOut[0], 6 + 8 * IN, 'lite');
    v.text((doorOut[0] + doorOut[1]) / 2, 3.2, 'DOOR', 'lbls', 'middle');
    v.text((doorOut[0] + doorOut[1]) / 2, 2.6, 'BEYOND', 'lbls', 'middle');
  }

  // Booth back wall (cut).
  v.rect(-g.boothD, 0, boothBackIn, g.boothH, 'cut');
  // Booth front lower wall (cut), with its beveled double top plate under the deck.
  v.poly([[frontBack, 0], [g.frontFace, 0], [g.frontFace, joistBottom(g.frontFace)], [frontBack, joistBottom(frontBack)]], 'cut');
  // Header (cut) and the jamb beyond.
  v.rect(frontBack, g.openTop, g.frontFace, g.boothH, 'cut');
  v.rect(frontBack, deck(frontBack), g.frontFace, g.openTop, 'lite');

  // Maze wall (cut).
  v.rect(-g.wallT / 2, 0, g.wallT / 2, 8, 'cut');

  // Ramp: rails beyond, deck (cut), joist, beams and posts.
  v.poly([...deckLine(g.back, g.lip, -vert(g.railH)), [g.lip, deck(g.lip)], [g.back, deck(g.back)]], 'litef');
  v.poly([...deckLine(g.back, g.lip), [g.lip, deck(g.lip) - vert(2 * PLY)], [g.frontFace, deck(g.frontFace) - vert(2 * PLY)], [g.frontFace, joistBottom(g.frontFace)], [g.back, joistBottom(g.back)]], 'cut');
  v.line(g.back, deck(g.back) - vert(PLY), g.frontFace, deck(g.frontFace) - vert(PLY), 'lite');
  v.line(g.frontFace, deck(g.frontFace) - vert(PLY), g.lip, deck(g.lip) - vert(PLY), 'lite');
  for (const out of [g.midBeam, g.rearBeam]) {
    const top = beamTop(out);
    v.rect(out - T2, top - D6, out + T2, top, 'cut');
    v.rect(out - D4 / 2, 0, out + D4 / 2, top - D6, 'visf'); // post (on the near side of the cut, shown beyond)
  }
  // Back stop.
  v.poly(stand(g.back + 0.07, T2, D4), 'visf');

  // Stop bar (hinged at its lane-side bottom edge).
  v.poly(barPoly(bar), 'red');

  // Platform with guardrail, ladder beyond.
  const pt = g.platform.top;
  v.rect(platformBack, pt - PLY, g.platform.front, pt, 'cut');
  v.rect(platformBack, pt - PLY - D6, g.platform.front, pt - PLY, 'visf');
  v.rect(g.platform.front - D4, 0, g.platform.front, pt - PLY - D6, 'visf');
  v.rect(platformBack, 0, platformBack + D4, pt - PLY - D6, 'visf');
  v.line(g.platform.front - D4 / 2, pt, g.platform.front - D4 / 2, pt + GUARD, 'vis');
  v.line(platformBack + 0.2, pt + GUARD, g.platform.front - D4 / 2, pt + GUARD, 'vis');
  v.line(platformBack + 0.2, pt + GUARD / 2, g.platform.front - D4 / 2, pt + GUARD / 2, 'vis');

  // Hoist pulley on the back wall.
  v.circle(hoistPulley.out, hoistPulley.h, 0.18, 'visf');

  // Return, outrigger, batten, drape.
  v.rect(g.frontFace, g.drapeBottom, g.drapeOut + 0.1, g.boothH, 'lite');
  v.rect(outrigger.from, outrigger.bottom, outrigger.to, outrigger.top, 'visf');
  v.circle(g.drapeOut, outrigger.bottom - 0.12, 0.1, 'visf');
  // Lip filler beyond.
  v.line(g.frontFace, deck(g.lip), g.drapeOut, deck(g.lip), 'lite');
  const bDrop = Math.min(drapeDrop, g.drapeTop - g.drapeBottom + g.drapeBottom - 0.4);
  if (drapeDrop < 0.01) {
    v.rect(batten.out - T2 / 2, batten.bottom, batten.out + T2 / 2, batten.top, 'cut');
    v.rect(batten.out + T2 / 2, g.drapeBottom, batten.out + T2 / 2 + 0.07, g.drapeTop, 'black');
  } else {
    v.rect(batten.out - T2 / 2, batten.bottom, batten.out + T2 / 2, batten.top, 'cut');
    const top = g.drapeTop - bDrop;
    const bottom = Math.max(0, g.drapeBottom - bDrop);
    if (top > 0.45) v.rect(batten.out + T2 / 2, bottom, batten.out + T2 / 2 + 0.07, top, 'black');
    const heap = Math.min(0.4, Math.max(0, (g.drapeBottom - bDrop) < 0 ? -(g.drapeBottom - bDrop) / 20 + 0.1 : 0));
    if (heap > 0) v.poly([[batten.out - 0.1, 0], [batten.out + 0.9, 0], [batten.out + 0.5, heap], [batten.out + 0.05, heap * 0.8]], 'black');
  }

  // Ball.
  v.circle(ball.out, ball.h, g.ballR, 'ball');
  v.line(ball.out - 0.25, ball.h, ball.out + 0.25, ball.h, 'lite');
  v.line(ball.out, ball.h - 0.25, ball.out, ball.h + 0.25, 'lite');
}

// The stop bar, square to the deck, rotated `angle` degrees forward about its lane-side hinge.
function barPoly(angle) {
  const hingeOut = g.barOut + (T2 / 2) * COS;
  const base = [hingeOut, deck(hingeOut)];
  const a = angle * DEG;
  // Bar in deck coords: s along the deck (downhill +), n square to it (up +).
  const pts = [[0, 0], [-T2, 0], [-T2, D4], [0, D4]].map(([s, n]) => {
    const rs = s * Math.cos(a) + n * Math.sin(a);
    const rn = -s * Math.sin(a) + n * Math.cos(a);
    return [base[0] + rs * COS + rn * SIN, base[1] - rs * SIN + rn * COS];
  });
  return pts;
}
// A board standing square to the deck at `out`, `thick` along the slope and `tall` high.
function stand(out, thick, tall) {
  const b = [out, deck(out)];
  return [[0, 0], [thick, 0], [thick, tall], [0, tall]].map(([s, n]) => [b[0] + s * COS + n * SIN, b[1] - s * SIN + n * COS]);
}

// ---------------------------------------------------------------------------------------------
// A-1: Site plan and key numbers

function sheetSite() {
  const s = new Sheet('A-1', 'Site plan and key numbers', '1/8 in = 1 ft (site plan)');
  const scale = 12;
  const v = view(s, { x: 50, y: 70, w: 85 * scale + 20, h: 60 * scale + 10, scale, u0: -0.8, v1: 0.5, title: 'SITE PLAN: GYM, 85 x 60 FT', subtitle: 'Plan coordinates: x from the left wall, y from the top wall (stage along the bottom). Group 4 is the third lane.' });
  // Plan coordinates: u = x, v = -y.
  const P = (p) => [p.x, -p.y];
  const lane = layout.groups.find((gr) => gr.n === 4);
  v.poly(lane.points.map(P), 'none', true, 'style="fill:#fff7d6;stroke:none"');
  v.rect(0, 0, layout.room.width, -layout.room.depth, 'vis');
  const st = layout.stage;
  v.rect(st.x, -st.y, st.x + st.width, -(st.y + st.depth), 'litef');
  v.text(st.x + st.width / 2, -(st.y + st.depth / 2), 'STAGE', 'lbls', 'middle', 0, 4);
  for (const w of layout.walls) v.line(w.a.x, -w.a.y, w.b.x, -w.b.y, 'vis', 'style="stroke-width:3"');
  for (const t of layout.tentSides) v.line(t.a.x, -t.a.y, t.b.x, -t.b.y, 'lite', 'style="stroke-width:2"');
  v.poly(layout.route.map(P), 'route', false);
  for (const gr of layout.groups) v.text(gr.at.x, -gr.at.y, `G${gr.n}`, 'lblb', 'middle', 0, 4);

  // The rig footprint.
  const corners = [[-halfW, g.frontFace], [halfW, g.frontFace], [halfW, -g.boothD], [-halfW, -g.boothD]].map(([a, o]) => P(toPlan(a, o)));
  v.poly(corners, 'black', true, 'style="fill:#2b2b30;fill-opacity:0.85"');
  const deckPts = [[-4, g.lip], [4, g.lip], [4, g.back], [-4, g.back]].map(([a, o]) => P(toPlan(a, o)));
  v.poly(deckPts, 'lite', true, 'style="stroke:#fff"');
  const drapeA = P(toPlan(-drapeHalf, g.drapeOut));
  const drapeB = P(toPlan(drapeHalf, g.drapeOut));
  v.line(drapeA[0], drapeA[1], drapeB[0], drapeB[1], 'vis', 'style="stroke-width:2.5"');
  const L = P(sim.landing.plan);
  v.circle(L[0], L[1], 5, 'zone');
  v.circle(L[0], L[1], 0.3, 'red');
  const end = sim.frames[sim.frames.length - 1];
  v.poly(sim.frames.filter((f, i) => i % 6 === 0 && f.t >= sim.landing.t).map((f) => P(f.plan)), 'path', false);
  v.note(L[0], L[1], 150, 40, ['Landing spot (simulated)', `x ${sim.landing.plan.x.toFixed(1)}, y ${sim.landing.plan.y.toFixed(1)}`, 'Keep 5 ft around it clear', 'when the cord is pulled']);
  v.note(P(end.plan)[0], P(end.plan)[1], 120, 30, ['Ball path after landing', '(rolls on to the stage end)']);
  const bc = P(toPlan(0, -6));
  v.note(bc[0], bc[1], -90, -70, ['Booth 11\'-4" x 11\'-3"', 'behind the diagonal wall'], { anchor: 'end' });

  // Where to set out the opening along the diagonal wall.
  const A = layout.diagonal.a;
  const B = layout.diagonal.b;
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const ux = (B.x - A.x) / len;
  const uy = (B.y - A.y) / len;
  const alongA = (g.station.x - A.x) * ux + (g.station.y - A.y) * uy;
  v.dim([A.x, -A.y], [g.station.x, -g.station.y], 2.6, `${ftIn(alongA)} to opening center`, { textOff: 2 });
  v.dim([A.x, -A.y], [A.x + ux * (alongA - halfW), -(A.y + uy * (alongA - halfW))], -2.2, `${ftIn(alongA - halfW)} to booth`, { textOff: 2 });
  v.text(A.x, -A.y, 'Diagonal wall, left end (20, 36)', 'lbls', 'end', -6, 14);
  v.finish();

  // Key numbers and index.
  const x = 1110;
  let y = 80;
  s.text(x, y, 'WHAT IS BEING BUILT', 'vt');
  y = s.lines(x, y + 20, [
    'A booth behind the diagonal wall holds the 6.5 ft ball on a',
    '12 degree ramp. One pull on a cord drops a black kabuki drape',
    'and frees a hinged stop bar; the ball rolls over the 8 ft wall',
    'and drops into the front of the group 4 lane, then rolls down',
    'the lane after the group and stops at the stage end.',
  ]);
  y += 12;
  s.text(x, y, 'KEY NUMBERS', 'vt');
  y = s.table(x, y + 10, [{ title: 'Item', width: 230 }, { title: 'Value', width: 230 }], [
    ['Opening center on the wall', `${ftIn(alongA)} from left end`],
    ['Opening (clear)', `${ftIn(g.openW)} wide x to ${ftIn(g.openTop)}`],
    ['Booth (outside)', `${ftIn(g.boothW)} W x ${ftIn(g.boothD + g.frontFace)} D x ${ftIn(g.boothH)}`],
    ['Ramp', `${ftIn(g.deckWidth)} wide, ${g.slope} deg, ${ftIn((g.lip - g.back) / COS)} long`],
    ['Deck at lip / lane face', `${ftIn(deck(g.lip))} / ${ftIn(deck(g.laneFace))}`],
    ['Deck at high end', ftIn(deck(g.back))],
    ['Ball center at rest', `${ftIn(g.ballCenter.height)} high`],
    ['Kabuki drape', `${ftIn(g.drapeW)} x ${ftIn(g.drapeTop - g.drapeBottom)}, hem ${ftIn(g.drapeBottom)}`],
    ['Operator platform', `${ftIn(g.platform.width)} x ${ftIn(platformDepth)}, top ${ftIn(g.platform.top)}`],
    ['Ball leaves lip', `${sim.leavesLip.t.toFixed(1)} s after the pull`],
    ['Ball lands', `${sim.landing.t.toFixed(1)} s, ${ftIn(sim.landing.out - g.laneFace)} out from wall`],
  ]);
  y += 20;
  s.text(x, y, 'SHEETS', 'vt');
  y = s.lines(x, y + 20, [
    'A-1  Site plan and key numbers',
    'A-2  Section A-A through the ramp',
    'A-3  Elevations from the lane',
    'A-4  Plan of the rig',
    'A-5  Mechanism details: stop bar and kabuki drop',
    'A-6  Rigging and the release sequence',
    'A-7  Framing, cut list, and hardware',
    'A-8  Operating, reset, and safety',
  ]);
  y += 10;
  s.lines(x, y, [
    '**Conventions**',
    'AFF = above finished floor (the gym floor).',
    '"Out" is measured square to the diagonal wall, toward the lane,',
    'from the wall centerline; the maze wall is 6 in thick, 8 ft tall.',
    'Lumber is nominal (2x4 = 1 1/2 x 3 1/2 in actual).',
  ]);
}

// ---------------------------------------------------------------------------------------------
// A-2: Section A-A

function sheetSection() {
  const s = new Sheet('A-2', 'Section A-A through the ramp', '3/8 in = 1 ft');
  const scale = 36;
  const v = view(s, { x: 40, y: 60, w: 1000, h: 760, scale, u0: -15.2, v1: 18.6, title: 'SECTION A-A', subtitle: 'Cut through the middle of the opening, square to the wall, looking toward the wall\'s right-hand end. Booth left, lane right. Ball at rest on the stop bar.' });
  drawSection(v);

  // The release, ghosted: the ball's path, as it leaves the lip, and at landing.
  const path = sim.frames.filter((f) => f.t <= sim.landing.t + 0.6).map((f) => [f.out, f.h]);
  v.poly(path, 'path', false);
  v.circle(sim.leavesLip.out, sim.leavesLip.h, g.ballR, 'ghost');
  v.circle(sim.landing.out, sim.landing.h, g.ballR, 'ghost');
  v.text(sim.leavesLip.out + 0.6, sim.leavesLip.h + g.ballR + 0.3, `leaves the lip, ${sim.leavesLip.t.toFixed(1)} s`, 'lbls', 'middle');
  v.text(sim.landing.out, sim.landing.h + g.ballR + 0.3, `lands, ${sim.landing.t.toFixed(1)} s (red: ball center path)`, 'lbls', 'middle');
  v.figure(11.6, 0, 6);
  v.text(11.6, 6.4, "6'-0\" figure", 'lbls', 'middle');

  // Heights: booth side on the left, lane side on the right.
  const L = -14.6;
  v.elev(L, g.boothH, ftIn(g.boothH, { aff: true }), { toU: L + 1.1 });
  v.elev(L, g.platform.top + GUARD, `${ftIn(g.platform.top + GUARD, { aff: true })} guardrail`, { toU: L + 1.1 });
  v.elev(L, g.platform.top, `${ftIn(g.platform.top, { aff: true })} platform`, { toU: L + 1.1 });
  v.elev(g.back - 0.05, deck(g.back), `${ftIn(deck(g.back), { aff: true })} deck, high end`, { side: -1, toU: g.back - 1.6, dy: -6 });
  v.elev(g.ballCenter.out, g.ballCenter.height, `${ftIn(g.ballCenter.height, { aff: true })} ball center`, { toU: g.ballCenter.out + 4.2, dy: -14 });
  const R = 3.3;
  v.elev(g.frontFace, g.openTop, `${ftIn(g.openTop, { aff: true })} opening top`, { toU: R, dy: 8 });
  v.elev(batten.out, g.drapeTop, `${ftIn(g.drapeTop, { aff: true })} batten / drape top`, { toU: R, dy: -8 });
  v.elev(g.lip, deck(g.lip), `${ftIn(deck(g.lip), { aff: true })} lip`, { toU: R, dy: -16 });
  v.elev(g.laneFace, 8, `${ftIn(8, { aff: true })} maze wall top`, { toU: R, dy: -2 });
  v.elev(batten.out + 0.1, g.drapeBottom, `${ftIn(g.drapeBottom, { aff: true })} drape hem`, { toU: R, dy: 12 });
  v.elev(g.laneFace, deck(g.laneFace), `${ftIn(deck(g.laneFace), { aff: true })} deck at the wall`, { toU: R, dy: -30 });

  // Horizontal dimensions along the floor.
  const chain = [-g.boothD, g.rearBeam, g.midBeam, g.frontFace, g.laneFace, g.lip];
  for (let i = 0; i < chain.length - 1; i++) v.dim([chain[i], 0], [chain[i + 1], 0], -1.0, chain[i + 1] - chain[i] < 0.7 ? inches(chain[i + 1] - chain[i]) : null);
  v.dim([-g.boothD, 0], [g.frontFace, 0], -2.0, `${ftIn(g.boothD + g.frontFace)} booth (outside)`);
  v.dim([g.laneFace, 0], [g.drapeOut, 0], -2.0, `${ftIn(g.drapeOut - g.laneFace)} to drape`, { textOff: 2 });
  v.text(-g.boothD, -1.0, 'rear beam', 'lbls', 'start', 4, 26);
  // Along the deck, from the lip (mark these on the plywood).
  const dl = (out) => [out, deck(out)];
  v.dim(dl(g.lip), dl(g.barOut + (T2 / 2) * COS), 2.7, `${ftIn(fromLip(g.barOut + (T2 / 2) * COS))} lip to bar hinge, along deck`);
  v.dim(dl(g.lip), dl(g.back), 3.6, `${ftIn((g.lip - g.back) / COS)} deck length along the slope`);

  // Slope symbol.
  const ax = -1.6;
  v.line(ax, deck(ax) + 0.4, ax - 2.2, deck(ax) + 0.4, 'dim');
  v.line(ax, deck(ax) + 0.4, ax - 2.2, deck(ax) + 0.4 + 2.2 * Math.tan(g.slope * DEG), 'dim');
  v.text(ax - 2.3, deck(ax) + 0.55, `${g.slope}°`, 'dimt', 'end');

  // Keyed notes.
  v.key(g.drapeOut + 0.12, 11.5, 1, 46, 0);
  v.key(g.drapeOut, batten.top, 2, 40, -26);
  v.key(outrigger.to - 0.3, outrigger.top, 3, 30, -30);
  v.key(g.drapeOut - 0.6, 14.6, 4, -46, 30);
  v.key((frontBack + g.frontFace) / 2, 4.0, 5, -44, 0);
  v.key(0, 5.5, 6, 30, 30);
  v.key(g.lip - 0.25, deck(g.lip) - 0.06, 7, 40, 34);
  v.key(-1.5, deck(-1.5) - 0.12, 8, 0, 44);
  v.key(g.midBeam, beamTop(g.midBeam) - D6 / 2, 9, 30, 30);
  v.key(g.rearBeam, beamTop(g.rearBeam) - D6 / 2, 9, 30, 30);
  v.key(g.midBeam + 0.0, 3.0, 10, 30, 0);
  v.key(-3.0, deck(-3.0) + vert(g.railH) - 0.05, 11, 30, -40);
  const bp = barPoly(0)[2];
  v.key(bp[0], bp[1], 12, -14, -42);
  v.key(g.back + 0.15, deck(g.back) + 0.25, 13, -24, -36);
  v.key(hoistPulley.out + 0.15, hoistPulley.h, 14, 34, -8);
  v.key(-10.6, g.platform.top - 0.2, 15, 34, 34);
  v.key(platformBack + 0.1, 3, 16, -40, 0);
  v.key(-10.6, g.platform.top + GUARD / 2, 17, -44, -40);
  v.bubble(g.barOut - 0.3, deck(g.barOut) - 1.0, 'D1', 'A-5');
  v.bubble(g.drapeOut + 1.9, g.boothH + 0.6, 'D3', 'A-5');
  v.figure(-10.0, g.platform.top, 5.83, 'lite');
  v.finish();

  const x = 1080;
  let y = s.keyed(x, 80, [
    [1, 'Kabuki drape: IFR black velour, chain in the hem pocket.'],
    [2, '2x4 batten, flown on two lift lines, 6 kabuki pins (D3, D4).'],
    [3, '2x6 outrigger, bolted to the booth corner post, pulley at end.'],
    [4, 'Return (beyond): 2x4 frame, black, closes the drape\'s sides.'],
    [5, 'Booth front lower wall: 2x4 @ 24" o.c. Beveled double top', 'plate carries the deck\'s low end.'],
    [6, 'Maze wall (existing). Carries no rig load.'],
    [7, 'Lip: two layers 3/4" ply, bullnose edge, carpet wrapped.'],
    [8, 'Deck: 3/4" ply on 2x4 joists @ 16" o.c., down the slope.'],
    [9, 'Beam: (2) 2x6 on 4x4 posts, top beveled 12 deg.'],
    [10, '4x4 ramp post, two per beam, 7\'-6" apart (A-4).'],
    [11, 'Guide rail (beyond): 3/4" ply x 18", padded 2x4 cap.'],
    [12, 'Stop bar: 2x4 on edge, hinged, gravity latches (D1, D2).'],
    [13, 'Back stop: 2x4 on edge. Holds the ball while reloading.'],
    [14, `Hoist pulley at ${ftIn(hoistPulley.h)} on the back wall (reload).`],
    [15, `Operator platform: 3/4" ply on 2x6, 4x4 legs, top ${ftIn(g.platform.top)}.`],
    [16, 'Booth back wall: 2x4 @ 24" o.c., built in two lifts.'],
    [17, 'Guardrail 42" with mid rail. T-handle and cleat rail on it.'],
  ]);
  y += 8;
  s.lines(x, y, [
    '**Notes**',
    '1. The booth stands on the floor behind the maze wall, its front',
    '   face against the wall\'s back face. Nothing bears on the wall.',
    `2. The lip layer clears the wall cap by ${inches(deck(g.laneFace) - vert(2 * PLY) - 8)} at the lane face.`,
    '   Joists stop at the booth front wall; only the 1\'-6" doubled',
    '   ply lip cantilevers over the wall.',
    '3. Heights are to the deck surface. Frame the deck, then cut',
    '   posts to suit and scribe to the floor.',
    '4. Snap the bar line on the ply, measured along the deck from',
    '   the lip (dimension above the deck).',
    '5. The ball clears the jambs by 9" each side and the header by',
    '   about 1\'-5" as it rolls out.',
    '6. Paint everything a visitor could see flat black.',
  ]);
}

// ---------------------------------------------------------------------------------------------
// A-3: Elevations from the lane

function drawElevation(v, { drape }) {
  // Floor and maze wall face.
  v.add(`<rect x="${r2(v.X(-8))}" y="${r2(v.Y(0))}" width="${r2(16 * v.scale)}" height="${r2(0.45 * v.scale)}" fill="url(#ground)"/>`);
  v.line(-8, 0, 8, 0, 'floor');
  v.rect(-8, 0, 8, 8, 'grayf');
  v.line(-8, 8 - 2 * IN, 8, 8 - 2 * IN, 'lite');
  for (let a = -7.5; a <= 7.5; a += 7.5) v.line(a, 0, a, 8, 'lite');
  // Booth front above the wall.
  v.rect(-halfW, 8, halfW, g.boothH, 'black');
  v.rect(-g.openW / 2, deck(g.lip), g.openW / 2, g.openTop, 'litef');
  // Through the opening: back wall, deck, rails, ball, stop bar, back stop.
  v.rect(-g.openW / 2, deck(g.lip), g.openW / 2, g.openTop, 'grayf');
  v.rect(-g.deckWidth / 2, deck(g.lip), g.deckWidth / 2, deck(g.back), 'litef');
  for (const s of [-1, 1]) v.rect(s * railIn, deck(g.lip), s * (railIn + 0.15), deck(g.back) + vert(g.railH), 'black');
  v.rect(-barHalf, deck(g.barOut), barHalf, deck(g.barOut) + D4, 'red');
  v.rect(-barHalf, deck(g.back), barHalf, deck(g.back) + D4, 'visf');
  v.circle(0, g.ballCenter.height, g.ballR, 'ball');
  v.line(-g.deckWidth / 2, deck(g.lip), g.deckWidth / 2, deck(g.lip), 'vis');
  v.rect(-g.deckWidth / 2, deck(g.lip) - vert(2 * PLY), g.deckWidth / 2, deck(g.lip), 'black');
  // Lip fillers and returns (seen end-on), outriggers.
  for (const s of [-1, 1]) {
    v.rect(s * 4, deck(g.lip) - 0.0625, s * (returnInner), deck(g.lip), 'black');
    v.rect(s * returnInner, g.drapeBottom, s * returnOuter, g.boothH, 'black');
    v.rect(s * returnInner, outrigger.bottom, s * returnOuter, outrigger.top, 'visf');
  }
  // Batten and its lift lines.
  v.rect(-drapeHalf, batten.bottom, drapeHalf, batten.top, 'visf');
  for (const s of [-1, 1]) {
    v.line(s * (drapeHalf - 0.15), batten.top, s * (returnInner - 0.05), outrigger.bottom - 0.1, 'lineL');
    v.circle(s * (returnInner - 0.12), outrigger.bottom - 0.12, 0.1, 'visf');
  }
  for (const a of PIN_STATIONS) v.circle(a, batten.bottom + D4 / 2, 0.06, 'visf');
  if (drape) {
    v.rect(-drapeHalf, g.drapeBottom, drapeHalf, g.drapeTop, 'black');
    for (let a = -drapeHalf + 0.45; a < drapeHalf; a += 0.6) v.line(a, g.drapeBottom + 0.05, a, g.drapeTop - 0.05, 'lite', 'style="stroke:#55555c"');
    for (const a of PIN_STATIONS) v.circle(a, batten.bottom + D4 / 2, 0.06, 'visf');
  }
  // Camera on the header.
  v.rect(-0.25, g.boothH, 0.25, g.boothH + 0.3, 'visf');
}

function sheetElevations() {
  const s = new Sheet('A-3', 'Elevations from the lane', '3/8 in = 1 ft');
  const scale = 36;
  const common = { y: 60, w: 560, h: 720, scale, u0: -7.8, v1: 18.9 };
  const a = view(s, { ...common, x: 50, title: 'ELEVATION B: SHOW CONDITION', subtitle: 'Seen from the group 4 lane, drape hung and armed. Only black surfaces show.' });
  drawElevation(a, { drape: true });
  a.dim([-halfW, g.boothH + 0.4], [halfW, g.boothH + 0.4], 0.5, `${ftIn(g.boothW)} booth`);
  a.dim([-drapeHalf, g.drapeBottom], [drapeHalf, g.drapeBottom], -0.9, `${ftIn(g.drapeW)} drape (between returns)`);
  a.dim([drapeHalf, g.drapeBottom], [drapeHalf, g.drapeTop], -1.1, `${ftIn(g.drapeTop - g.drapeBottom)} drape`);
  a.dim([-6.6, 0], [-6.6, g.drapeBottom], 0.0, `${ftIn(g.drapeBottom)} hem`, { textOff: 2, ext: false });
  a.dim([-7.4, 0], [-7.4, 8], 0.0, "8'-0\" wall", { textOff: 2, ext: false });
  a.dim([halfW, 0], [halfW, g.boothH], -1.6, `${ftIn(g.boothH)} booth top`);
  a.key(PIN_STATIONS[4], batten.bottom + D4 / 2, 1, 26, -40);
  a.key(-drapeHalf + 0.3, batten.top + 0.15, 2, -10, -46);
  a.key(0, g.boothH + 0.15, 3, 40, -30);
  a.key(-returnOuter + 0.1, 12, 4, -40, 0);
  a.key(2.5, 11, 5, 0, 0);
  a.key(-returnOuter - 0.6, 8 - 0.1, 6, -24, 30);
  a.finish();

  const b = view(s, { ...common, x: 660, title: 'ELEVATION C: DRAPE REMOVED', subtitle: 'Same view with the drape and batten left off to show the opening and ramp.' });
  drawElevation(b, { drape: false });
  b.dim([-g.openW / 2, g.boothH + 0.4], [g.openW / 2, g.boothH + 0.4], 0.5, `${ftIn(g.openW)} clear opening`);
  b.dim([g.openW / 2, g.boothH + 0.4], [halfW, g.boothH + 0.4], 0.5, ftIn(g.jamb), { textOff: 2 });
  b.dim([-railIn, deck(g.lip) - 0.3], [railIn, deck(g.lip) - 0.3], -0.9, `${ftIn(2 * railIn)} between rails`);
  b.dim([halfW, 0], [halfW, g.openTop], -1.0, `${ftIn(g.openTop)} opening top`);
  b.dim([halfW, 0], [halfW, deck(g.lip)], -1.9, `${ftIn(deck(g.lip))} lip`);
  b.dim([-g.ballR, g.ballCenter.height], [g.ballR, g.ballCenter.height], 0.0, "6'-6\" ball", { ext: false, textOff: 2 });
  b.key(barHalf - 0.6, deck(g.barOut) + D4 / 2, 7, 50, 20);
  b.key(railIn + 0.07, deck(g.back) + 0.6, 8, 50, -10);
  b.key(-4.7, deck(g.lip) - 0.03, 9, -30, 40);
  b.key(1.5, g.openTop + 0.35, 10, 50, -40);
  b.key(0, deck(g.back) + 0.12, 11, -60, 50);
  b.key(-g.deckWidth / 2 + 0.4, deck(g.lip) - 0.06, 12, -20, 60);
  b.finish();

  const x = 1290;
  let y = s.keyed(x, 80, [
    [1, 'Kabuki pins (6) on the batten', '(A-5, D3 and D4).'],
    [2, 'Lift line to the outrigger pulley,', 'leads back to a cleat in the booth.'],
    [3, 'Lane camera on the header,', 'for the operator\'s monitor.'],
    [4, 'Return, seen end-on.'],
    [5, 'Drape: IFR black velour.'],
    [6, 'Maze wall (existing), 8\'-0".'],
    [7, `Stop bar, 2x4 on edge, ${ftIn(barLen)}.`],
    [8, 'Rail: 3/4" ply x 18", padded cap.'],
    [9, 'Lip filler: 3/4" ply, black.'],
    [10, 'Header: 2x4 frame, black sheeting.'],
    [11, 'Back stop (reload).'],
    [12, 'Lip: doubled ply, carpet wrapped.'],
  ], { lh: 13 });
  y += 6;
  s.lines(x, y, [
    '**Notes**',
    '1. Booth front, jambs, and header are',
    '   framed like the maze walls and covered',
    '   in the same black sheeting.',
    '2. The drape fills the width between the',
    '   returns. With the returns, the lip',
    '   fillers, and the hem below the lip, it',
    '   closes every sight line from the lanes',
    '   (checked in the model from every route',
    '   position at 3\'-6", 5\'-6", 6\'-6" eyes).',
    '3. Returns run from the hem to the booth',
    '   top, notched over the maze wall cap.',
    '4. Ball at rest: top at 16\'-0", 5 ft back',
    '   from the opening. It only rolls down-',
    '   hill, so it never nears the header.',
  ]);
}

// ---------------------------------------------------------------------------------------------
// A-4: Plan of the rig

function sheetPlan() {
  const s = new Sheet('A-4', 'Plan of the rig', '3/8 in = 1 ft');
  const scale = 36;
  // u = along, v = -out (booth up, lane down).
  const v = view(s, { x: 40, y: 60, w: 760, h: 790, scale, u0: -10.5, v1: 12.3, title: 'PLAN (TOP VIEW, BOOTH ROOF OPEN)', subtitle: 'Square to the diagonal wall. Lane at the bottom. Structure under the deck dashed.' });
  const Pt = (a, o) => [a, -o];
  const R = (a1, o1, a2, o2, cls) => v.rect(a1, -o1, a2, -o2, cls);
  // Lane context from the layout: walls, route, landing zone.
  const lp = (p) => {
    const l = toLocal(p);
    return Pt(l.along, l.out);
  };
  for (const w of layout.walls) {
    const a = lp(w.a);
    const b = lp(w.b);
    v.line(a[0], a[1], b[0], b[1], 'vis', 'style="stroke-width:3;stroke:#999"');
  }
  v.poly(layout.route.map(lp), 'route', false);
  const L = Pt(landingLocal.along, landingLocal.out);
  v.circle(L[0], L[1], 5, 'zone');
  v.circle(L[0], L[1], g.ballR, 'ghost');
  v.note(L[0] + 3.6, L[1] - 1.5, 110, 0, ['Landing zone (simulated): keep', 'a 5 ft radius clear at release']);

  // Maze wall.
  R(-10.5, -g.wallT / 2, 10.5, g.wallT / 2, 'cut');
  // Booth walls.
  R(-halfW, g.frontFace, halfW, frontBack, 'cut');
  R(-halfW, frontBack, -halfW + STUD_WALL, boothBackIn, 'cut');
  R(halfW - STUD_WALL, frontBack, halfW, boothBackIn, 'cut');
  R(-halfW, boothBackIn, halfW, -g.boothD, 'cut');
  // Door in the left side wall, swinging out.
  R(-halfW - 0.05, doorOut[0], -halfW + STUD_WALL + 0.05, doorOut[1], 'visf');
  v.add(`<path d="M${r2(v.X(-halfW))},${r2(v.Y(-doorOut[1]))} A${r2(2 * scale)},${r2(2 * scale)} 0 0 0 ${r2(v.X(-halfW - 2))},${r2(v.Y(-doorOut[1] - 0))}" class="lite"/>`);
  v.line(-halfW, -doorOut[1], -halfW - 2, -doorOut[1], 'lite');
  // Returns, lip fillers, drape, batten.
  for (const sgn of [-1, 1]) {
    R(sgn * returnInner, g.frontFace, sgn * returnOuter, g.drapeOut + 0.1, 'cut');
    R(sgn * 4, g.frontFace, sgn * returnInner, g.drapeOut, 'litef');
  }
  R(-drapeHalf, batten.out - T2 / 2, drapeHalf, batten.out + T2 / 2, 'visf');
  R(-drapeHalf, batten.out + T2 / 2, drapeHalf, batten.out + T2 / 2 + 0.07, 'black');
  // Deck, rails, stop bar, back stop, joists, beams, posts.
  R(-g.deckWidth / 2, g.back, g.deckWidth / 2, g.lip, 'visf');
  for (let a = -g.deckWidth / 2 + 0.75 * IN; a <= g.deckWidth / 2; a += 16 * IN) v.line(a, -g.back, a, -g.frontFace, 'hid');
  v.line(g.deckWidth / 2 - 0.75 * IN, -g.back, g.deckWidth / 2 - 0.75 * IN, -g.frontFace, 'hid');
  for (const out of [g.midBeam, g.rearBeam]) {
    v.rect(-g.deckWidth / 2, -(out - T2), g.deckWidth / 2, -(out + T2), 'hid');
    for (const sgn of [-1, 1]) v.rect(sgn * g.postAlong - D4 / 2, -(out - D4 / 2), sgn * g.postAlong + D4 / 2, -(out + D4 / 2), 'hid');
  }
  for (const sgn of [-1, 1]) R(sgn * railIn, g.back, sgn * (railIn + 0.15), g.lip, 'black');
  R(-barHalf, g.barOut - T2 / 2, barHalf, g.barOut + T2 / 2, 'red');
  R(-barHalf, g.back, barHalf, g.back + T2, 'visf');
  // Ball.
  v.circle(0, -g.ballCenter.out, g.ballR, 'ball');
  // Platform, guardrail, ladder.
  R(-g.platform.width / 2, g.platform.front, g.platform.width / 2, platformBack, 'litef');
  v.poly([Pt(-g.platform.width / 2 + 0.1, g.platform.front - 0.1), Pt(g.platform.width / 2 - 0.1, g.platform.front - 0.1), Pt(g.platform.width / 2 - 0.1, platformBack + 0.1)], 'vis', false, 'style="stroke-width:2"');
  for (let o = platformBack + 0.3; o < g.platform.front - 0.2; o += 0.85) v.line(-g.platform.width / 2 - 1.6, -o, -g.platform.width / 2 - 0.1, -o, 'vis');
  v.line(-g.platform.width / 2 - 1.6, -(platformBack + 0.1), -g.platform.width / 2 - 1.6, -(g.platform.front - 0.1), 'vis');
  v.line(-g.platform.width / 2 - 0.1, -(platformBack + 0.1), -g.platform.width / 2 - 0.1, -(g.platform.front - 0.1), 'vis');
  v.circle(0, -hoistPulley.out, 0.18, 'visf');

  // Dimensions.
  v.dim(Pt(-halfW, -g.boothD), Pt(halfW, -g.boothD), 0.8, `${ftIn(g.boothW)} booth (outside)`);
  v.dim(Pt(halfW, -g.boothD), Pt(halfW, g.frontFace), -1.0, `${ftIn(g.boothD + g.frontFace)} booth (outside)`);
  v.dim(Pt(halfW, g.frontFace), Pt(halfW, g.drapeOut + 0.1), -1.0, `${ftIn(g.drapeOut + 0.1 - g.frontFace)}`, { textOff: 2 });
  v.dim(Pt(-g.deckWidth / 2, g.lip), Pt(g.deckWidth / 2, g.lip), -0.9, `${ftIn(g.deckWidth)} deck`);
  v.dim(Pt(-g.openW / 2, g.frontFace), Pt(g.openW / 2, g.frontFace), -3.4, `${ftIn(g.openW)} opening`);
  v.dim(Pt(-railIn, g.midBeam + 1.2), Pt(railIn, g.midBeam + 1.2), 0.0, `${ftIn(2 * railIn)} clear between rails`, { textOff: 2, ext: false });
  v.dim(Pt(-g.postAlong, g.back - 0.3), Pt(g.postAlong, g.back - 0.3), 0.0, `${ftIn(2 * g.postAlong)} posts c/c`, { textOff: 2, ext: false });
  v.dim(Pt(-halfW, g.rearBeam), Pt(-halfW, g.midBeam), 1.2, `${ftIn(g.midBeam - g.rearBeam)}`, { textOff: 2 });
  v.dim(Pt(-halfW, g.midBeam), Pt(-halfW, g.frontFace), 1.2, `${ftIn(g.frontFace - g.midBeam)}`, { textOff: 2 });
  v.dim(Pt(-halfW, -g.boothD), Pt(-halfW, g.rearBeam), 1.2, `${ftIn(g.rearBeam + g.boothD)}`, { textOff: 2 });
  // Keyed notes.
  v.key(0, -g.ballCenter.out + 1.6, 1, 120, 0);
  v.key(barHalf - 1, -g.barOut, 2, 150, 24);
  v.key(railIn + 0.07, 2.2, 3, 120, 0);
  v.key(-g.postAlong, -g.midBeam, 4, -60, 20);
  v.key(-2.5, -(g.drapeOut + 0.1), 5, -40, 60);
  v.key(4.7, -(g.drapeOut - 0.6), 6, 80, 50);
  v.key(-halfW, 10.35, 7, -40, 0);
  v.key(-g.platform.width / 2 - 0.9, 10.5, 8, -10, -46);
  v.key(1.2, 10.0, 9, 70, -30);
  v.key(0, -hoistPulley.out, 10, 40, -34);
  v.key(returnOuter - 0.1, -0.6, 11, 60, 30);
  v.key(-1, -g.back - 0.06, 12, -50, -56);
  v.text(-10.2, -5.6, 'GROUP 4 LANE', 'lblb');
  v.text(6.3, 6.0, 'BEHIND THE DIAGONAL', 'lblb', 'start');
  v.text(6.3, 5.6, 'WALL (OFF ROUTE)', 'lblb', 'start');
  v.finish();

  const x = 860;
  let y = s.keyed(x, 80, [
    [1, "6'-6\" ball at rest against the stop bar."],
    [2, 'Stop bar (A-5, D1 and D2).'],
    [3, 'Guide rail, 3/4" ply x 18".'],
    [4, '4x4 ramp post (4). Beams dashed under the deck.'],
    [5, 'Drape on the batten, 1\'-1 3/4" in front of the wall\'s lane face.'],
    [6, 'Lip filler (2), at lip height.'],
    [7, 'Door 2\'-0" x 6\'-8" in the left side wall, opens out.'],
    [8, 'Ladder to the platform.'],
    [9, `Platform ${ftIn(g.platform.width)} x ${ftIn(platformDepth)}, guardrail on open sides.`],
    [10, `Hoist pulley on the back wall at ${ftIn(hoistPulley.h)}.`],
    [11, 'Return (2), continues the booth side out over the lane.'],
    [12, 'Back stop at the deck\'s high end.'],
  ]);
  y += 6;
  y = s.lines(x, y, [
    '**Notes**',
    '1. Set out the booth from the opening center on the wall',
    `   (${ftIn(Math.hypot(g.station.x - layout.diagonal.a.x, g.station.y - layout.diagonal.a.y))} from the diagonal wall's left end, sheet A-1).`,
    '   Snap a centerline square to the wall through that point.',
    '2. The booth is a box on its own: front, two sides, and back',
    '   wall frames, 2x4 at 24" o.c., corner posts tied together',
    '   at the top. Brace and anchor it (A-7, A-8): it is 17 ft tall.',
    '3. Joists run down the slope at 16" o.c. Two beams on 4x4',
    '   posts and the booth front wall carry them.',
    '4. The left side door opens out; keep the path to it clear.',
    '5. The platform sits against the back wall, behind the deck\'s',
    '   high end, so the operator\'s head is clear of the deck.',
    '6. The landing zone and route are from the layout model;',
    '   the dashed purple line is the visitor route.',
  ]);
  y += 20;
  s.text(x, y, 'SET-OUT POINTS (gym plan coordinates, ft)', 'vt');
  const pts = [
    ['Opening center on wall', 0, 0],
    ['Booth front, left corner', -halfW, g.frontFace],
    ['Booth front, right corner', halfW, g.frontFace],
    ['Booth back, left corner', -halfW, -g.boothD],
    ['Booth back, right corner', halfW, -g.boothD],
    ['Ramp lip, center', 0, g.lip],
    ['Rear posts, left / right', -g.postAlong, g.rearBeam],
    ['', g.postAlong, g.rearBeam],
    ['Mid posts, left / right', -g.postAlong, g.midBeam],
    ['', g.postAlong, g.midBeam],
  ].map(([name, a, o]) => {
    const p = toPlan(a, o);
    return [name, `x ${p.x.toFixed(2)}`, `y ${p.y.toFixed(2)}`];
  });
  pts.push(['Landing spot (simulated)', `x ${sim.landing.plan.x.toFixed(2)}`, `y ${sim.landing.plan.y.toFixed(2)}`]);
  s.table(x, y + 10, [{ title: 'Point', width: 230 }, { title: 'x', width: 90 }, { title: 'y', width: 90 }], pts);
}

// ---------------------------------------------------------------------------------------------
// A-5: Mechanism details

function sheetDetails() {
  const s = new Sheet('A-5', 'Mechanism details: stop bar and kabuki drop', 'as noted');

  // D1: stop bar section, drawn square to the deck (deck horizontal). u = along the deck,
  // downhill (toward the lane) to the right; v = up from the deck surface.
  const d1 = view(s, { x: 40, y: 60, w: 620, h: 370, scale: 144, u0: -2.75, v1: 1.95, title: 'D1  STOP BAR AND GRAVITY LATCH (SECTION)', subtitle: '1 1/2 in = 1 ft. Drawn square to the deck (deck shown level). Lane to the right.' });
  const barReach = Math.sqrt(g.ballR ** 2 - (g.ballR - g.barH) ** 2);
  const contact = -T2 - 0.07 * 0 - barReach; // ball's deck contact, from the bar's lane face
  d1.rect(-2.75, 0, 1.3, -PLY, 'cut');
  d1.rect(-2.75, -PLY, 1.3, -PLY - D4, 'visf');
  d1.text(0.9, -0.2, '3/4" ply on 2x4 joist', 'lbls', 'end');
  // Rail beyond.
  d1.rect(-2.75, 0, 1.3, g.railH, 'litef');
  d1.rect(-2.75, g.railH, 1.3, g.railH + T2, 'lite');
  d1.text(-2.65, g.railH - 0.1, 'Rail beyond: 3/4" ply x 18", 2x4 cap with foam pad', 'lbls');
  // Bar, hinge, over-travel block.
  d1.rect(-T2, 0, 0, D4, 'red');
  d1.circle(0.02, 0.02, 0.025, 'visf');
  d1.rect(-T2 - T2, 0, -T2, T2, 'visf');
  // Ball profile on the centerline (for position only: the latches are out at the rails).
  d1.add(`<path d="M${r2(d1.X(contact - 1.3))},${r2(d1.Y(g.ballR - Math.sqrt(g.ballR ** 2 - 1.3 ** 2)))} A${r2(g.ballR * 144)},${r2(g.ballR * 144)} 0 0 1 ${r2(d1.X(contact + 1.35))},${r2(d1.Y(g.ballR - Math.sqrt(g.ballR ** 2 - 1.35 ** 2)))}" class="ghost" style="stroke:#333"/>`);
  d1.text(contact, 0.36, 'ball (on centerline)', 'lbls', 'middle');
  d1.circle(contact, 0, 0.02, 'vis');
  // Gravity latch on the rail: pivot uphill of and above the bar, hooked tip in front of the bar top.
  const pv = [-0.55, 0.78];
  const tip = [0.06, D4 + 0.02];
  d1.rect(pv[0] - 0.14, pv[1] - 0.14, pv[0] + 0.14, pv[1] + 0.14, 'lite');
  d1.poly([[pv[0], pv[1] + 0.04], [tip[0] + 0.05, D4 + 0.12], [tip[0] + 0.05, D4 - 0.06], [tip[0] - 0.01, D4 - 0.06], [tip[0] - 0.03, D4 + 0.03], [pv[0], pv[1] - 0.04]], 'grayf');
  d1.circle(pv[0], pv[1], 0.035, 'visf');
  d1.circle(tip[0] + 0.02, D4 + 0.16, 0.018, 'visf');
  d1.line(tip[0] + 0.02, D4 + 0.16, tip[0] + 0.45, 1.75, 'lineB', 'marker-end="url(#arrow)"');
  d1.line(-T2 / 2, D4, -1.0, 1.75, 'lineR', 'marker-end="url(#arrow)"');
  d1.add(`<path d="M${r2(d1.X(-0.04))},${r2(d1.Y(D4 + 0.2))} A${r2(0.42 * 144)},${r2(0.42 * 144)} 0 0 1 ${r2(d1.X(0.35))},${r2(d1.Y(0.08))}" class="hid" marker-end="url(#arrow)"/>`);
  d1.text(tip[0] + 0.5, 1.72, 'LINE B', 'lblb', 'start');
  d1.text(-1.05, 1.72, 'LINE R', 'lblb', 'end');
  d1.key(-T2 / 2, D4 / 2, 1, 40, 70);
  d1.key(0.02, 0.02, 2, 60, 40);
  d1.key(-T2 * 1.5, T2 / 2, 3, -30, 60);
  d1.key(pv[0], pv[1], 4, -50, -30);
  d1.key(tip[0] + 0.05, D4 + 0.1, 5, 60, -50);
  d1.key(0.3, 0.12, 6, 60, -30);
  d1.key(-2.2, 1.0, 7, 0, -30);
  d1.dim([0.0, 0], [0.0, D4], -0.5, '3 1/2"', { textOff: 2 });
  d1.dim([-T2, 0], [0, 0], -0.25, '1 1/2"', { textOff: 2 });
  d1.dim([contact, 0], [-T2, 0], -0.25, `${inches(-T2 - contact)}`, { textOff: 2 });
  d1.dim([-2.55, 0], [-2.55, g.railH], 0.2, '1\'-6"', { textOff: 2 });
  d1.text(contact, -0.45, 'ball touches the deck', 'lbls', 'middle');
  d1.finish();

  // D2: stop bar seen from uphill (looking toward the lane).
  const d2 = view(s, { x: 40, y: 510, w: 620, h: 230, scale: 60, u0: -5.0, v1: 3.1, title: 'D2  STOP BAR FROM BEHIND (LOOKING DOWNHILL)', subtitle: '5/8 in = 1 ft. Both latch arms tie to one bridle on line B; line R ties to a ring at the bar center.' });
  d2.rect(-4.6, 0, 4.6, -PLY, 'cut');
  for (const sgn of [-1, 1]) d2.rect(sgn * railIn, 0, sgn * (railIn + 0.15), g.railH, 'black');
  d2.rect(-barHalf, 0, barHalf, D4, 'red');
  for (const sgn of [-1, 1]) {
    d2.rect(sgn * (barHalf - 1.0) - 0.12, 0, sgn * (barHalf - 1.0) + 0.12, 0.08, 'visf');
    d2.rect(sgn * (railIn - 0.3), D4 - 0.05, sgn * railIn, D4 + 0.25, 'grayf');
    d2.line(sgn * (railIn - 0.15), D4 + 0.25, 0, 2.4, 'lineB');
  }
  d2.circle(0, 2.4, 0.06, 'visf');
  d2.line(0, 2.4, 0, 3.0, 'lineB', 'marker-end="url(#arrow)"');
  d2.circle(0, D4 + 0.05, 0.05, 'visf');
  d2.line(0, D4 + 0.1, 0.9, 1.4, 'lineR', 'marker-end="url(#arrow)"');
  d2.dim([-barHalf, 0], [barHalf, 0], -0.55, `${ftIn(barLen)} bar`);
  d2.dim([-railIn, g.railH], [railIn, g.railH], 0.35, `${ftIn(2 * railIn)} between rails`);
  d2.dim([barHalf - 1.0, 0], [barHalf, 0], 0.0, '1\'-0"', { textOff: -16, ext: false });
  d2.key(0, 2.4, 8, 40, -10);
  d2.key(barHalf - 1.0, 0.04, 2, 30, 30);
  d2.key(-(railIn - 0.15), D4 + 0.15, 4, -30, -30);
  d2.key(0, D4 + 0.05, 9, -40, -20);
  d2.finish();
  s.keyed(40, 812, [
    [1, `Stop bar: 2x4 on edge, ${ftIn(barLen)}, painted`, 'red so it is easy to check.'],
    [2, '3" butt hinges (2), lane-side bottom edge,', '1\'-0" from each end: folds toward the lane.'],
    [3, 'Over-travel block, 1 1/2" sq: stops the bar', 'going past upright when it is reset.'],
    [4, 'Gravity gate latch on each rail\'s inner face,', 'about 1\'-6" clear of the ball at this height.'],
    [5, 'Hooked tip drops in front of the bar top; its', 'sloped back lets the bar push past on reset.'],
  ], { title: 'KEYED NOTES (D1, D2)', lh: 12 });
  s.keyed(370, 812, [
    [6, 'On release the ball knocks the bar flat', 'and rolls over 1 1/2" of bar.'],
    [7, 'Rail beyond: 3/4" ply x 18", 2x4 cap', 'with a foam pad.'],
    [8, 'Bridle ring: both latch arms to line B', 'and the T-handle.'],
    [9, 'Ring at the bar center for line R (reset).'],
  ], { title: ' ', lh: 12 });

  // D3: one kabuki pin station on the batten (seen from the lane).
  const d3 = view(s, { x: 720, y: 60, w: 440, h: 300, scale: 288, u0: -0.72, v1: 0.55, title: 'D3  KABUKI PIN STATION (FRONT)', subtitle: '3 in = 1 ft. One of 6 stations along the batten.' });
  d3.rect(-0.72, 0, 0.72, D4, 'litef');
  d3.text(0.66, 0.03, '2x4 batten (on edge)', 'lbls', 'end');
  for (const a of [-0.0625, 0.0625]) {
    d3.circle(a, D4 * 0.45, 0.025, 'vis');
    d3.line(a, D4 * 0.45 - 0.025, a, D4 * 0.45 - 0.07, 'vis');
  }
  d3.rect(-0.25, D4 * 0.45 - 0.0104, 0.12, D4 * 0.45 + 0.0104, 'grayf');
  d3.circle(-0.27, D4 * 0.45, 0.025, 'vis');
  d3.add(`<path d="M${r2(d3.X(-0.025))},${r2(d3.Y(D4 * 0.45))} C${r2(d3.X(-0.05))},${r2(d3.Y(-0.15))} ${r2(d3.X(0.05))},${r2(d3.Y(-0.15))} ${r2(d3.X(0.025))},${r2(d3.Y(D4 * 0.45))}" class="vis" style="stroke-width:2"/>`);
  d3.rect(-0.72, -0.15, 0.72, -0.5, 'black');
  d3.line(-0.27, D4 * 0.45, -0.72, D4 * 0.45, 'lineK', 'marker-end="url(#arrow)"');
  d3.note(0.0625, D4 * 0.45 - 0.05, 60, 40, ['1/4" screw eyes (2), 1 1/2" apart']);
  d3.note(0.08, D4 * 0.45, 70, -40, ['Kabuki pin: 1/4" smooth steel rod,', '4" long, eye at the pull end']);
  d3.note(0, -0.1, 250, 10, ['1" webbing loop sewn to the drape top,', 'hangs on the pin between the eyes']);
  d3.note(-0.6, D4 * 0.45, -10, -40, ['LINE K: pulling 3" frees every pin'], { anchor: 'start' });
  d3.text(0, -0.36, 'DRAPE', 'vt', 'middle', 0, 0, 0);
  d3.finish();

  // D4: the batten as a whole, with the 6 stations and its lines.
  const d4 = view(s, { x: 720, y: 450, w: 860, h: 200, scale: 54, u0: -7.4, v1: 2.2, title: 'D4  BATTEN, PINS, AND LINES (FRONT)', subtitle: '9/16 in = 1 ft. Line K runs along all 6 pins and out over the right outrigger; L1 and L2 fly the batten.' });
  d4.rect(-drapeHalf, 0, drapeHalf, D4, 'litef');
  d4.rect(-drapeHalf, -0.15, drapeHalf, -1.2, 'black');
  for (const sgn of [-1, 1]) {
    d4.rect(sgn * returnInner, -1.2, sgn * returnOuter, 1.9, 'black');
    d4.circle(sgn * (returnInner - 0.12), 1.6, 0.1, 'visf');
    d4.line(sgn * (drapeHalf - 0.2), D4, sgn * (returnInner - 0.12), 1.5, 'lineL');
    d4.line(sgn * (returnInner - 0.12), 1.7, sgn * (returnInner - 0.12) - sgn * 0.8, 2.1, 'lineL', 'marker-end="url(#arrow)"');
  }
  for (const a of PIN_STATIONS) {
    d4.rect(a - 0.12, D4 * 0.4, a + 0.12, D4 * 0.6, 'grayf');
    d4.add(`<path d="M${r2(d4.X(a - 0.04))},${r2(d4.Y(D4 * 0.5))} q${r2(0.04 * 54)},${r2(0.5 * 54)} ${r2(0.08 * 54)},0" class="vis"/>`);
  }
  d4.line(PIN_STATIONS[0] - 0.12, D4 * 0.5, returnInner - 0.3, D4 * 0.5, 'lineK');
  d4.line(returnInner - 0.3, D4 * 0.5, returnInner - 0.3, 1.2, 'lineK');
  d4.circle(returnInner - 0.3, 1.25, 0.07, 'visf');
  d4.line(returnInner - 0.3, 1.32, returnInner - 1.3, 1.95, 'lineK', 'marker-end="url(#arrow)"');
  d4.dim([-drapeHalf, 0], [drapeHalf, 0], -1.5, `${ftIn(g.drapeW)} batten and drape`, { textOff: 2 });
  d4.dim([PIN_STATIONS[2], D4], [PIN_STATIONS[3], D4], 0.35, ftIn(PIN_STATIONS[3] - PIN_STATIONS[2]), { textOff: 2 });
  d4.dim([PIN_STATIONS[3], D4], [PIN_STATIONS[4], D4], 0.35, ftIn(PIN_STATIONS[4] - PIN_STATIONS[3]), { textOff: 2 });
  d4.note(-drapeHalf + 0.25, 1.0, -10, -24, ['L1'], { anchor: 'end' });
  d4.note(drapeHalf - 0.25, 1.0, 10, -24, ['L2']);
  d4.note(returnInner - 0.3, 1.25, -60, -24, ['Pulley; line K leads back into the booth'], { anchor: 'end' });
  d4.finish();

  // Notes.
  const x = 720;
  let y = 728;
  s.text(x, y, 'HOW THE TRIGGER WORKS', 'vt');
  s.lines(x, y + 20, [
    '1. Armed: the bar stands upright between the rails, held by two gravity latches. The ball rests against it and pushes with only',
    '   about 2 1/2 lb (12 lb ball on a 12 deg slope), so the latches and the pull see very little load.',
    '2. The drape hangs on 6 webbing loops, one over each kabuki pin. Every pin points the same way along the batten and is tied to line K.',
    '3. The operator pulls one T-handle (A-6). Line K moves 3" and all 6 pins slide out of their loops together: the drape falls.',
    '   Line B has 2" of extra slack, so it lifts the latch arms a moment later: the bar is free, the ball knocks it flat and rolls.',
    '4. The drape is heaped on the lane floor in about 1 s; the ball reaches the drape line at about 2.6 s.',
    '5. Reset: haul the ball up past the bar (line H), pull line R to stand the bar up (the latches click over it), ease the ball down',
    '   onto the bar, trip the snap shackle, re-hang the drape on the lowered batten, fly it out, and set line K\'s slack. See A-8.',
  ], { lh: 14 });
}

// ---------------------------------------------------------------------------------------------
// A-6: Rigging schematic and release sequence

function sheetRigging() {
  const s = new Sheet('A-6', 'Rigging and the release sequence', 'section frames 3/16 in = 1 ft; rigging not to scale');

  // Release sequence: six small sections from the simulation.
  const times = [
    [0, 'ARMED. Ball on the bar, drape hung.'],
    [0.5, 'Pull. Drape falling, bar tipping.'],
    [1.2, 'Drape down, bar flat. Ball rolling.'],
    [2.6, 'Ball reaches the lip.'],
    [3.1, 'Over the wall, dropping.'],
    [3.6, 'Landed. Rolls on down the lane after the group.'],
  ];
  const scale = 14;
  times.forEach(([t, caption], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const f = sim.at(t);
    const v = view(s, { x: 40 + col * 345, y: 70 + row * 395, w: 330, h: 290, scale, u0: -12.0, v1: 19.0, title: `t = ${t.toFixed(1)} s`, subtitle: caption });
    drawSection(v, { state: f, detail: false });
    v.finish();
  });

  // Rigging schematic, not to scale.
  const x0 = 1100;
  const y0 = 70;
  s.text(x0, y0, 'RIGGING (NOT TO SCALE)', 'vt');
  const box = (x, y, w, h, label, sub) => {
    s.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="tb"/>`);
    s.text(x + w / 2, y + 16, label, 'lblb', 'middle');
    if (sub) s.text(x + w / 2, y + 30, sub, 'lbls', 'middle');
  };
  const pulley = (x, y, label, below = false) => {
    s.add(`<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#111" stroke-width="1.2"/>`);
    if (label) s.text(x, y + (below ? 20 : -10), label, 'lbls', 'middle');
  };
  const path = (pts, cls) => s.add(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="${cls}" fill="none"/>`);
  const tag = (x, y, t) => s.text(x, y, t, 'lblb', 'start');
  // Boxes.
  box(x0 + 270, y0 + 60, 210, 40, 'BATTEN + 6 KABUKI PINS', 'over the lane at 16\'-6"');
  box(x0 + 270, y0 + 250, 210, 40, 'STOP BAR LATCHES (2)', 'on the rails');
  box(x0 + 270, y0 + 420, 210, 40, 'BALL NET (reload only)', 'snap shackle + trip line');
  box(x0, y0 + 500, 150, 40, 'T-HANDLE', 'on platform guardrail');
  box(x0, y0 + 580, 150, 40, 'CLEAT RAIL', 'on platform guardrail');
  // K: handle -> booth side, top -> over the header -> outrigger end -> along the batten.
  path([[x0 + 40, y0 + 500], [x0 + 40, y0 + 140], [x0 + 200, y0 + 140], [x0 + 440, y0 + 140], [x0 + 440, y0 + 100]], 'lineK');
  pulley(x0 + 40, y0 + 140, 'P1 side wall top');
  pulley(x0 + 200, y0 + 140, 'P2 header');
  pulley(x0 + 440, y0 + 140, 'P3 outrigger', true);
  tag(x0 + 48, y0 + 200, 'K');
  // B: handle -> pulley above the bar -> bridle on the latch arms.
  path([[x0 + 70, y0 + 500], [x0 + 70, y0 + 230], [x0 + 330, y0 + 230], [x0 + 330, y0 + 250]], 'lineB');
  pulley(x0 + 180, y0 + 230, 'P4 above bar');
  tag(x0 + 78, y0 + 300, 'B');
  // R: bar ring -> cleat rail.
  path([[x0 + 400, y0 + 290], [x0 + 400, y0 + 340], [x0 + 110, y0 + 340], [x0 + 110, y0 + 580]], 'lineR');
  tag(x0 + 118, y0 + 400, 'R');
  // H: cleat -> back wall pulley -> ball net; trip line alongside.
  path([[x0 + 20, y0 + 580], [x0 + 20, y0 + 560], [x0 - 20, y0 + 560], [x0 - 20, y0 + 440], [x0 + 270, y0 + 440]], 'lineH');
  pulley(x0 + 190, y0 + 440, 'P5 back wall, 14\'-6"');
  path([[x0 + 130, y0 + 580], [x0 + 130, y0 + 470], [x0 + 300, y0 + 470], [x0 + 300, y0 + 460]], 'lineH');
  tag(x0 - 14, y0 + 520, 'H');
  tag(x0 + 172, y0 + 485, 'trip line');
  // L1, L2: batten lift lines -> outrigger pulleys -> back along the booth -> cleats.
  path([[x0 + 290, y0 + 60], [x0 + 290, y0 + 30], [x0 + 140, y0 + 30], [x0 + 140, y0 + 120]], 'lineL');
  path([[x0 + 460, y0 + 60], [x0 + 460, y0 + 18], [x0 + 150, y0 + 18], [x0 + 150, y0 + 120]], 'lineL');
  path([[x0 + 140, y0 + 160], [x0 + 140, y0 + 580]], 'lineL');
  path([[x0 + 150, y0 + 160], [x0 + 150, y0 + 580]], 'lineL');
  pulley(x0 + 290, y0 + 30);
  pulley(x0 + 460, y0 + 18);
  tag(x0 + 156, y0 + 260, 'L1 L2');
  // Legend.
  let ly = y0 + 650;
  const legend = [
    ['lineK', 'K  Kabuki release: handle to all 6 pins (taut).'],
    ['lineB', 'B  Bar release: handle to both latch arms, 2" slack.'],
    ['lineR', 'R  Bar reset: bar ring to cleat (slack in show).'],
    ['lineH', 'H  Hoist + trip line: reload only, never in show.'],
    ['lineL', 'L1, L2  Batten lift lines: fly out to stops, cleat.'],
  ];
  for (const [cls, label] of legend) {
    s.add(`<line x1="${x0}" y1="${ly - 4}" x2="${x0 + 34}" y2="${ly - 4}" class="${cls}"/>`);
    s.text(x0 + 42, ly, label, 'lbl');
    ly += 16;
  }
  s.lines(x0, ly + 8, [
    '1/4" braided polyester line, black. Pulleys: 1 1/2" single',
    'blocks on screw eyes or eye bolts. Handle travel about 6":',
    'K frees the drape in the first 3", B frees the bar after 5".',
    'Test the pull 20 times before any show (A-8).',
  ]);
}

// ---------------------------------------------------------------------------------------------
// A-7: Framing, cut list, and hardware

function sheetFraming() {
  const s = new Sheet('A-7', 'Framing, cut list, and hardware', '1/4 in = 1 ft (framing elevations)');
  const scale = 24;
  // Front wall framing (seen from inside the booth, looking toward the lane).
  const f = view(s, { x: 40, y: 60, w: 330, h: 450, scale, u0: -6.4, v1: 17.6, title: 'FRONT WALL FRAMING', subtitle: 'Seen from inside the booth. Built in two lifts.' });
  const studs = (v, from, to, bottom, top, skip = () => false) => {
    for (let a = from; a <= to + 1e-6; a += 2) if (!skip(a)) v.rect(a - T2 / 2, bottom, a + T2 / 2, top, 'visf');
  };
  f.rect(-halfW, 0, halfW, T2, 'visf');
  f.rect(-halfW, plateTop - 2 * T2, halfW, plateTop, 'visf');
  studs(f, -halfW + T2 / 2, halfW, T2, plateTop - 2 * T2);
  f.rect(halfW - T2, T2, halfW, plateTop - 2 * T2, 'visf');
  // Upper lift: jamb frames and header.
  for (const sgn of [-1, 1]) {
    f.rect(sgn * halfW, plateTop, sgn * (g.openW / 2), plateTop + T2, 'visf');
    f.rect(sgn * halfW, g.boothH - T2, sgn * (g.openW / 2), g.boothH, 'visf');
    f.rect(sgn * (g.openW / 2) - (sgn > 0 ? 0 : -T2) - (sgn > 0 ? 0 : T2), plateTop + T2, sgn * (g.openW / 2) + sgn * T2, g.boothH - T2, 'visf');
    f.rect(sgn * halfW - sgn * T2, plateTop + T2, sgn * halfW, g.boothH - T2, 'visf');
  }
  f.rect(-g.openW / 2, g.openTop, g.openW / 2, g.openTop + D4, 'visf');
  f.rect(-g.openW / 2, g.boothH - T2, g.openW / 2, g.boothH, 'visf');
  f.dim([-halfW, 0], [halfW, 0], -0.8, ftIn(g.boothW));
  f.dim([halfW, 0], [halfW, plateTop], -0.8, ftIn(plateTop));
  f.dim([halfW, plateTop], [halfW, g.boothH], -0.8, ftIn(g.boothH - plateTop));
  f.dim([-g.openW / 2, g.openTop + D4], [g.openW / 2, g.openTop + D4], 0.0, `${ftIn(g.openW)} opening`, { textOff: -14, ext: false });
  f.note(0, plateTop - T2, 30, 40, ['Double top plate, bevel', '12 deg: deck bears here']);
  f.finish();

  // Side wall framing (left side, with door), seen from outside.
  const sw = view(s, { x: 390, y: 60, w: 330, h: 450, scale, u0: -12.0, v1: 17.6, title: 'LEFT SIDE WALL FRAMING', subtitle: 'Seen from outside. Right side the same, no door.' });
  const L0 = -g.boothD;
  const L1 = g.frontFace;
  sw.rect(L0, 0, L1, T2, 'visf');
  sw.rect(L0, 8 - T2, L1, 8 + T2, 'visf');
  sw.rect(L0, g.boothH - T2, L1, g.boothH, 'visf');
  for (let o = L0 + D4 / 2; o <= L1; o += 2) {
    const inDoor = o > doorOut[1] - 0.1 && o < doorOut[0] + 0.1;
    sw.rect(o - T2 / 2, inDoor ? 6 + 8 * IN + D4 : T2, o + T2 / 2, 8 - T2, inDoor ? 'litef' : 'visf');
    sw.rect(o - T2 / 2, 8 + T2, o + T2 / 2, g.boothH - T2, 'visf');
  }
  sw.rect(L0, T2, L0 + D4, g.boothH - T2, 'cut');
  sw.rect(L1 - D4, T2, L1, g.boothH - T2, 'cut');
  sw.rect(doorOut[1], 0, doorOut[0], 6 + 8 * IN, 'lite');
  sw.rect(doorOut[1] - T2, T2, doorOut[1], 6 + 8 * IN + D4, 'visf');
  sw.rect(doorOut[0], T2, doorOut[0] + T2, 6 + 8 * IN + D4, 'visf');
  sw.rect(doorOut[1] - T2, 6 + 8 * IN, doorOut[0] + T2, 6 + 8 * IN + D4, 'visf');
  sw.line(L0 + D4, T2, L1 - D4, 8 - T2, 'hid');
  sw.line(L0 + D4, 8 + T2, L1 - D4, g.boothH - T2, 'hid');
  sw.dim([L0, 0], [L1, 0], -0.8, ftIn(L1 - L0));
  sw.dim([L0, 0], [L0, 8 + T2], 0.8, "8'-1 1/2\"");
  sw.dim([L0, 8 + T2], [L0, g.boothH], 0.8, ftIn(g.boothH - 8 - T2));
  sw.note(L1 - D4 / 2, 13, 30, -30, ['4x4 corner post', '17\'-0", or spliced', 'with plates at 8\'']);
  sw.note((L0 + L1) / 2, 12, 40, -40, ['Diagonal brace', '(1x4 let in or', '2x4 on face)']);
  sw.note((doorOut[0] + doorOut[1]) / 2, 3, 30, 60, ['Door 2\'-0" x 6\'-8"']);
  sw.finish();

  // Deck framing plan: looking down on the deck frame, plywood off. u = along, v = up the slope
  // (distance along the deck from the lip).
  const dp = view(s, { x: 40, y: 600, w: 690, h: 300, scale: 24, u0: -6.4, v1: 10.9, title: 'DECK FRAMING PLAN (PLYWOOD OFF)', subtitle: '1/4 in = 1 ft. Distances measured along the slope from the lip. Lane at the bottom.' });
  const along = (out) => fromLip(out);
  const deckLen = along(g.back);
  dp.rect(-g.deckWidth / 2, 0, g.deckWidth / 2, deckLen, 'litef');
  dp.rect(-g.deckWidth / 2, 0, g.deckWidth / 2, along(g.frontFace), 'grayf');
  dp.text(0, along(g.frontFace) / 2 - 0.15, 'doubled 3/4" ply lip, over the wall', 'lbls', 'middle');
  for (let a = -g.deckWidth / 2 + 0.75 * IN; a <= g.deckWidth / 2 + 1e-6; a += 16 * IN) {
    const ax = Math.min(a, g.deckWidth / 2 - 0.75 * IN);
    dp.rect(ax - T2 / 2, along(g.frontFace), ax + T2 / 2, deckLen, 'visf');
  }
  dp.rect(-halfW, along(g.frontFace), halfW, along(frontBack), 'cut');
  dp.text(-halfW + 0.1, along(frontBack) + 0.12, 'booth front wall top plate', 'lbls');
  for (const out of [g.midBeam, g.rearBeam]) {
    dp.rect(-g.deckWidth / 2, along(out + T2), g.deckWidth / 2, along(out - T2), 'hid');
    for (const sgn of [-1, 1]) dp.rect(sgn * g.postAlong - D4 / 2, along(out) - D4 / 2, sgn * g.postAlong + D4 / 2, along(out) + D4 / 2, 'cut');
  }
  for (const sgn of [-1, 1]) dp.rect(sgn * railIn, 0, sgn * (railIn + 0.15), deckLen, 'black');
  dp.line(-barHalf, fromLip(g.barOut + (T2 / 2) * COS), barHalf, fromLip(g.barOut + (T2 / 2) * COS), 'vis', 'style="stroke:#d23b2a;stroke-width:2.5"');
  dp.dim([g.deckWidth / 2, 0], [g.deckWidth / 2, along(g.frontFace)], -0.5, ftIn(along(g.frontFace)), { textOff: 2 });
  dp.dim([g.deckWidth / 2, 0], [g.deckWidth / 2, fromLip(g.barOut + (T2 / 2) * COS)], -1.6, `${ftIn(fromLip(g.barOut + (T2 / 2) * COS))} bar hinge line`, { textOff: 2 });
  dp.dim([g.deckWidth / 2, 0], [g.deckWidth / 2, along(g.midBeam)], -2.7, `${ftIn(along(g.midBeam))} mid beam`, { textOff: 2 });
  dp.dim([-g.deckWidth / 2, 0], [-g.deckWidth / 2, along(g.rearBeam)], 0.6, `${ftIn(along(g.rearBeam))} rear beam`, { textOff: 2 });
  dp.dim([-g.deckWidth / 2, 0], [-g.deckWidth / 2, deckLen], 1.6, `${ftIn(deckLen)} deck`, { textOff: 2 });
  dp.dim([-g.deckWidth / 2 + 0.75 * IN, deckLen], [-g.deckWidth / 2 + 0.75 * IN + 16 * IN, deckLen], 0.4, '16" o.c.', { textOff: 2 });
  dp.text(0, -0.55, 'LIP (lane side)', 'lblb', 'middle');
  dp.finish();

  // Cut list.
  const x = 815;
  let y = 75;
  s.text(x, y, 'CUT LIST (ESTIMATE, CHECK ON SITE)', 'vt');
  y = s.table(x, y + 10, [{ title: 'Part', width: 196 }, { title: 'Material', width: 134 }, { title: 'Qty', width: 52 }, { title: 'Size / length', width: 400 }], [
    ['Booth front, lower wall', '2x4', '8 + 3', `studs ${ftIn(plateTop - 3 * T2)}; plates ${ftIn(g.boothW)}, top two beveled 12 deg`],
    ['Booth front, jambs + header', '2x4', '8 + 6', `studs ${ftIn(g.boothH - plateTop - 2 * T2)}; plates and header ${ftIn(g.openW)}`],
    ['Booth sides (each)', '2x4', '16 + 4', `studs 7 @ ${ftIn(8 - 2 * T2)} + 7 @ ${ftIn(9 - 2 * T2)}, door; plates ${ftIn(g.boothD + g.frontFace)}`],
    ['Booth back', '2x4', '16 + 4', `studs 7 @ ${ftIn(8 - 2 * T2)} + 7 @ ${ftIn(9 - 2 * T2)}, blocking; plates ${ftIn(g.boothW)}`],
    ['Corner posts', '4x4', '4', '17\'-0" (or 8\' + 9\' spliced)'],
    ['Bracing', '1x4 or 2x4', '6', 'diagonals, each wall, both lifts'],
    ['Booth sheathing', 'black sheeting', '~700 sf', 'match the maze walls'],
    ['Deck joists', '2x4', '7', `${ftIn((g.frontFace - g.back) / COS)} along slope, 16" o.c.`],
    ['Deck beams', '2x6', '4', `${ftIn(g.deckWidth)} (doubled, 2 beams)`],
    ['Ramp posts', '4x4', '4', `mid ${ftIn(beamTop(g.midBeam) - D6)}, rear ${ftIn(beamTop(g.rearBeam) - D6)}`],
    ['Deck top', '3/4" plywood', '3 sh', `${ftIn((g.lip - g.back) / COS)} x ${ftIn(g.deckWidth)}`],
    ['Lip doubler', '3/4" plywood', '1', `${ftIn((g.lip - g.frontFace) / COS)} x ${ftIn(g.deckWidth)}, bullnose edge`],
    ['Guide rails', '3/4" plywood', '2', `18" x ${ftIn((g.lip - g.back) / COS)} (splice backed)`],
    ['Rail caps', '2x4 + foam', '2', `${ftIn((g.lip - g.back) / COS)}, pipe insulation pad`],
    ['Stop bar / back stop', '2x4', '2', ftIn(barLen)],
    ['Over-travel blocks', '2x2', '2', '6"'],
    ['Lip fillers', '3/4" plywood', '2', `${ftIn(returnInner - 4)} x ${ftIn(g.drapeOut - g.frontFace)}`],
    ['Returns', '2x4 + sheeting', '2', `${ftIn(g.drapeOut + 0.1 - g.frontFace)} x ${ftIn(g.boothH - g.drapeBottom)}, notch at wall cap`],
    ['Outriggers', '2x6', '2', `${ftIn(outrigger.to - outrigger.from + 1)}, bolted to corner posts`],
    ['Batten', '2x4 (straight)', '1', ftIn(g.drapeW)],
    ['Platform', '3/4" ply, 2x6, 4x4', '1', `${ftIn(g.platform.width)} x ${ftIn(platformDepth)}, top ${ftIn(g.platform.top)}`],
    ['Guardrail', '2x4', '6', '42" posts, top + mid rails'],
    ['Kabuki drape', 'IFR black velour', '1', `${ftIn(g.drapeW)} x ${ftIn(g.drapeTop - g.drapeBottom)} finished, 6 loops, hem chain`],
  ]);
  y += 20;
  s.text(x, y, 'HARDWARE', 'vt');
  s.table(x, y + 10, [{ title: 'Item', width: 290 }, { title: 'Qty', width: 70 }, { title: 'Notes', width: 422 }], [
    ['Gravity gate latch (steel)', '2', 'stop bar, on rail inner faces'],
    ['3" butt hinges', '2', 'stop bar to deck, lane-side edge'],
    ['1/4" screw eyes', '14', '12 for kabuki pins, spares'],
    ['1/4" smooth steel rod (kabuki pins)', '6', '4" long, one end bent to an eye'],
    ['1 1/2" single pulley blocks', '8', 'K, B, H, L1, L2 routing'],
    ['1/4" braided polyester line, black', '200 ft', 'all lines'],
    ['Cleats', '4', 'cleat rail on the platform guardrail'],
    ['T-handle', '1', 'pull handle, K and B tied off'],
    ['Snap shackle with trip line', '1', 'hoist line to ball net (reload)'],
    ['Carpet', '8 x 2 ft', 'wrap the lip'],
    ['Lane camera + monitor', '1', 'header camera, monitor on platform'],
    ['Anchors / ballast', 'as req.', 'booth to floor or to framing, per owner'],
  ]);
}

// ---------------------------------------------------------------------------------------------
// A-8: Operating, reset, and safety

function sheetOperation() {
  const s = new Sheet('A-8', 'Operating, reset, and safety', 'none');
  const col = (x, rows) => s.lines(x, 90, rows, { lh: 16 });
  col(50, [
    '**ARMING (BEFORE EACH GROUP)**',
    '1. Ball rests against the upright stop bar. Both latches down.',
    '2. Drape hung on all 6 pins, batten flown to its stops, L1/L2 cleated.',
    '3. Line K snug, line B with its 2" of slack, line R slack.',
    '4. Hoist line H unclipped and pulled back into the booth.',
    '5. Drape heap cleared from the lane. Lane clear.',
    '6. Radio check with the lane wrangler: "Armed."',
    '',
    '**RELEASE RULE**',
    'Pull only when ALL of these are true on the monitor:',
    '  - the group has walked well past the landing spot',
    `    (about 10 ft past it, on toward the stage end);`,
    '  - nobody is entering from group 3 (the doorway is just',
    '    a few feet from the landing spot);',
    '  - no staff member is in the landing zone.',
    'If in doubt, do not pull. Skipping one group is fine.',
    '',
    '**THE PULL**',
    'One smooth pull on the T-handle, about 6".',
    'Call "Ball out." The wrangler steers the ball and keeps',
    'the group moving toward the exit.',
    '',
    '**TIMING (SIMULATED)**',
    `Drape on the floor: about 1 s.`,
    `Ball leaves the lip: ${sim.leavesLip.t.toFixed(1)} s. Lands: ${sim.landing.t.toFixed(1)} s, at about 13 mph.`,
    'Rolls down the lane at about walking pace and stops at',
    'the stage end within about a minute.',
  ]);
  col(570, [
    '**RESET (BETWEEN GROUPS)**',
    '1. Wrangler walks the ball back up the lane to the wall',
    '   under the opening.',
    '2. Operator lowers line H from the hoist pulley; the wrangler',
    '   clips the snap shackle to the ball\'s net.',
    '3. Operator hauls the ball up the wall face, over the lip, and',
    '   up the ramp past the flat stop bar to the back stop.',
    '   Cleat line H.',
    '4. Pull line R: the bar stands up and the latches click over it.',
    '   Check both latch arms are down.',
    '5. Ease line H until the ball rests on the bar. Pull the trip',
    '   line to open the snap shackle; pull line H back.',
    '6. Lower the batten on L1/L2 to about 6 ft over the lane.',
    '   The wrangler picks up the drape and hooks its 6 loops on the',
    '   pins (each pin pushed through both eyes and its loop).',
    '7. Fly the batten back to its stops, cleat L1/L2.',
    '8. Take up line K so the pins are snug; set line B\'s 2" slack.',
    '9. Clear the lane, then arm (left column).',
    '',
    'Time the reset in rehearsal; it must fit the gap between',
    'groups. A second ball and drape would halve it.',
  ]);
  col(1090, [
    '**SAFETY**',
    '- Landing zone: the ball lands at about 13 mph on the route\'s',
    '  turn corner. The release rule is the main safeguard.',
    '- Wrangler in the lower lane, in black, on the radio.',
    '- Booth: 17 ft tall on a small footprint. Brace all four',
    '  walls, tie the corner posts at the top, and anchor or',
    '  ballast the base. Agree the method with the maze owner.',
    '- No rig load on the maze wall.',
    '- Platform guardrail 42" with mid rail on open sides.',
    '- Drape and booth fabric: inherently flame-retardant',
    '  (NFPA 701). Ask the fire marshal early.',
    '- No exposed screws or staples where the ball touches:',
    '  deck, rails, lip, booth edges. Carpet the lip.',
    '- Keep hands clear of the bar when latching it; load the',
    '  ball only after the bar is latched (step 4 then 5).',
    '- The fallen drape is a trip hazard: clear it before the',
    '  next group enters.',
    '',
    '**TEST BEFORE ANY SHOW**',
    '1. Pull 20 times without the ball: all pins and both latches',
    '   release every time, in order (drape, then bar).',
    '2. 10 releases with the ball and nobody in the lane. Mark the',
    '   landing spot; compare with A-1 (within about 1 1/2 ft).',
    '3. Walk the route at kid and adult eye height with show',
    '   lighting: nothing of the rig shows.',
    '4. Rehearse the reset with the real crew and time it.',
  ]);
}

// ---------------------------------------------------------------------------------------------

sheetSite();
sheetSection();
sheetElevations();
sheetPlan();
sheetDetails();
sheetRigging();
sheetFraming();
sheetOperation();

mkdirSync(OUT_DIR, { recursive: true });
const names = ['site-plan', 'section', 'elevations', 'plan', 'details', 'rigging-sequence', 'framing-cut-list', 'operating'];
SHEETS.forEach((sh, i) => writeFileSync(join(OUT_DIR, `${sh.number}-${names[i]}.svg`), sh.svg()));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ball Drop Drawings</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: 17in 11in; margin: 0; }
  html, body { margin: 0; background: #e9e9ec; }
  .sheet { width: 17in; height: 11in; margin: 16px auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); page-break-after: always; break-after: page; }
  .sheet svg { width: 100%; height: 100%; display: block; }
  @media screen and (max-width: 1700px) { .sheet { width: calc(100vw - 32px); height: auto; aspect-ratio: 17 / 11; } }
  @media print { html, body { background: #fff; } .sheet { margin: 0; box-shadow: none; width: 17in; height: 11in; } }
</style></head><body>
${SHEETS.map((sh) => `<div class="sheet">${sh.svg()}</div>`).join('\n')}
</body></html>`;
writeFileSync(join(OUT_DIR, 'ball-drop-drawings.html'), html);
console.log(`Wrote ${SHEETS.length} sheets to ${OUT_DIR}`);
console.log(`Landing ${sim.landing.t.toFixed(2)} s at (${sim.landing.plan.x.toFixed(1)}, ${sim.landing.plan.y.toFixed(1)}); leaves lip ${sim.leavesLip.t.toFixed(2)} s`);
