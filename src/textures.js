// Procedural textures drawn on canvases, so the sandbox ships no image files and every
// surface tiles at real-world size. A seeded random keeps each texture the same on reload.

import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { color = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

// The whole gym floor in one texture: maple strips plus court lines. `pxPerFt` sets detail.
export function gymFloor(widthFt, depthFt, pxPerFt = 24) {
  const W = Math.round(widthFt * pxPerFt);
  const H = Math.round(depthFt * pxPerFt);
  const [c, g] = canvas(W, H);
  const rand = rng(7);
  const strip = Math.max(3, Math.round(pxPerFt * 0.1875)); // 2.25 in boards
  for (let y = 0; y < H; y += strip) {
    let x = -Math.floor(rand() * pxPerFt * 6);
    while (x < W) {
      const len = pxPerFt * (3 + rand() * 7);
      const l = 64 + rand() * 10;
      g.fillStyle = `hsl(${32 + rand() * 6}, ${48 + rand() * 12}%, ${l}%)`;
      g.fillRect(x, y, len, strip);
      g.fillStyle = 'rgba(80,45,15,0.18)';
      g.fillRect(x, y, 1, strip); // board end joint
      x += len;
    }
    g.fillStyle = 'rgba(90,55,20,0.12)';
    g.fillRect(0, y, W, 1);
  }
  // Varnish sheen variation.
  for (let i = 0; i < 60; i++) {
    const r = pxPerFt * (4 + rand() * 10);
    const x = rand() * W;
    const y = rand() * H;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,240,210,0.06)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Basketball court lines, centered (84 x 50 ft court).
  const ft = (v) => v * pxPerFt;
  const cx = W / 2;
  const cy = H / 2;
  const cw = ft(Math.min(84, widthFt - 1));
  const ch = ft(Math.min(50, depthFt - 1));
  g.strokeStyle = 'rgba(25,40,110,0.85)';
  g.lineWidth = Math.max(2, ft(2 / 12));
  g.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);
  g.beginPath();
  g.moveTo(cx, cy - ch / 2);
  g.lineTo(cx, cy + ch / 2);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, ft(6), 0, Math.PI * 2);
  g.stroke();
  for (const side of [-1, 1]) {
    const baseX = cx + (side * cw) / 2;
    g.strokeRect(side < 0 ? baseX : baseX - ft(19), cy - ft(6), ft(19), ft(12));
    g.beginPath();
    g.arc(baseX - side * ft(19), cy, ft(6), 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(baseX - side * ft(5.25), cy, ft(19.75), side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    g.stroke();
  }
  return texture(c);
}

// Black polyethylene sheeting: near-black with soft wrinkles. One tile covers 8 x 8 ft.
// Returns a color map and a matching bump map.
export function blackSheeting() {
  const size = 512;
  const [c, g] = canvas(size, size);
  const [b, gb] = canvas(size, size);
  const rand = rng(11);
  g.fillStyle = '#121214';
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    const x = rand() * size;
    const w = 4 + rand() * 26;
    const lean = (rand() - 0.5) * 80;
    const shade = rand() < 0.5;
    for (const [ctx, light, dark] of [
      [g, 'rgba(70,70,80,0.10)', 'rgba(0,0,0,0.25)'],
      [gb, 'rgba(255,255,255,0.22)', 'rgba(0,0,0,0.22)'],
    ]) {
      const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, shade ? light : dark);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      for (const dx of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x - w + dx, 0);
        ctx.lineTo(x + w + dx, 0);
        ctx.lineTo(x + w + lean + dx, size);
        ctx.lineTo(x - w + lean + dx, size);
        ctx.fill();
      }
    }
  }
  return { map: texture(c), bumpMap: texture(b, { color: false }) };
}

// Pine framing lumber. One tile covers 4 ft of board.
export function pine() {
  const [c, g] = canvas(256, 64);
  const rand = rng(5);
  g.fillStyle = '#d9b47c';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(150,95,45,${0.12 + rand() * 0.2})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    const y = rand() * 64;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 3);
    g.stroke();
  }
  g.fillStyle = 'rgba(120,70,30,0.5)';
  g.beginPath();
  g.ellipse(90, 30, 6, 4, 0, 0, Math.PI * 2);
  g.fill();
  return texture(c);
}

// White canopy fabric with a faint weave.
export function fabric() {
  const [c, g] = canvas(128, 128);
  const rand = rng(3);
  g.fillStyle = '#efefe9';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.03})`;
    g.fillRect(i, 0, 1, 128);
    g.fillRect(0, i, 128, 1);
  }
  return texture(c);
}

// Prop surface patterns, wrapped on sphere or box UVs.
export function propPattern(look) {
  const { pattern, color, accent = '#ffffff' } = look;
  if (!pattern || pattern === 'none') return null;
  if (pattern === 'panels') {
    // Beach-ball gores: alternating vertical segments with a white cap band.
    const [c, g] = canvas(512, 256);
    const gores = 6;
    for (let i = 0; i < gores; i++) {
      g.fillStyle = [color, '#ffffff', accent][i % 3];
      g.fillRect((i * 512) / gores, 0, 512 / gores + 1, 256);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 512, 14);
    g.fillRect(0, 242, 512, 14);
    return texture(c);
  }
  if (pattern === 'soccer') {
    const [c, g] = canvas(512, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = accent;
    const pent = (x, y, r) => {
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        g.lineTo(x + r * Math.cos(a) * 1.0, y + r * Math.sin(a) * 0.9);
      }
      g.fill();
    };
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 5; k++) pent(((k + (row % 2) * 0.5) * 512) / 5, 32 + row * 64, 20 + (row === 1 || row === 2 ? 4 : 0));
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let x = 0; x < 512; x += 51) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 25, 256);
      g.stroke();
    }
    return texture(c);
  }
  if (pattern === 'cardboard') {
    const [c, g] = canvas(256, 256);
    const rand = rng(9);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 3) {
      g.fillStyle = `rgba(90,55,25,${0.04 + rand() * 0.05})`;
      g.fillRect(0, y, 256, 1);
    }
    g.fillStyle = 'rgba(200,170,120,0.85)'; // packing tape
    g.fillRect(108, 0, 40, 256);
    g.fillStyle = 'rgba(40,30,20,0.7)';
    g.font = 'bold 22px sans-serif';
    g.fillText('THIS SIDE UP', 20, 60);
    return texture(c);
  }
  return null;
}
