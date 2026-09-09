// Pure module (KTD14 Layer 1): turns quantized freehand stroke points into a
// drawable outline and lays out label text. Shared by the map (2D canvas) and
// the walk view's floor texture (KTD6). No imports from map/ or walk/, no DOM
// globals besides an injectable Path2D constructor for Node tests.
import { getStroke } from "perfect-freehand";

// Feet-per-unit for quantized store points: stored as integer twentieths of a foot.
const STORE_UNITS_PER_FOOT = 20;

export const LABEL_CAP_HEIGHT_FEET = 1.5;
// Typical sans-serif cap height as a fraction of the font's pixel size.
const CAP_HEIGHT_RATIO = 0.7;

function toStrokeArgs(pointsOrArgs, size) {
  if (Array.isArray(pointsOrArgs)) {
    return { points: pointsOrArgs, pressure: undefined, size };
  }
  const { points, pressure, size: objSize = size } = pointsOrArgs ?? {};
  return { points, pressure, size: objSize };
}

/**
 * Decode quantized stroke points (integer twentieths of a foot, as stored by
 * the shared store) into a closed outline polygon in feet, via
 * perfect-freehand's getStroke. Accepts either `(points, size)` or a single
 * `{ points, pressure, size }` object. Returns null for fewer than 2 points.
 */
export function strokeOutline(pointsOrArgs, size = 0.6) {
  const { points, pressure, size: strokeSize = 0.6 } = toStrokeArgs(pointsOrArgs, size);
  if (!points || points.length < 2) return null;

  // The store keeps points flat ([x0, y0, x1, y1, ...]) to stay compact; older
  // callers and tests pass [[x, y], ...] pairs. Accept both.
  const pairs = typeof points[0] === "number" ? toPairs(points) : points;
  if (pairs.length < 2) return null;
  const feetPoints = pairs.map(([x, y], i) => {
    const fx = x / STORE_UNITS_PER_FOOT;
    const fy = y / STORE_UNITS_PER_FOOT;
    return pressure ? [fx, fy, pressure[i]] : [fx, fy];
  });

  return getStroke(feetPoints, {
    size: strokeSize,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !pressure,
    last: true,
  });
}

function toPairs(flat) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

function feetToPixels([x, y], scale, offset) {
  const [ox, oy] = offset;
  return [(x + ox) * scale, (y + oy) * scale];
}

/**
 * Build a Path2D from a strokeOutline() polygon, transform feet to pixels,
 * and fill it. Pass Path2DCtor for Node tests (e.g. @napi-rs/canvas's Path2D)
 * since there is no DOM global there.
 */
export function drawOutline(ctx, outline, options = {}) {
  if (!outline || outline.length === 0) return;
  const { scale = 1, offset = [0, 0], color, Path2DCtor = globalThis.Path2D } = options;

  const path = new Path2DCtor();
  const [startX, startY] = feetToPixels(outline[0], scale, offset);
  path.moveTo(startX, startY);
  for (let i = 1; i < outline.length; i++) {
    const [px, py] = feetToPixels(outline[i], scale, offset);
    path.lineTo(px, py);
  }
  path.closePath();

  if (color) ctx.fillStyle = color;
  ctx.fill(path);
}

/**
 * CSS font string sized so the cap height is about 1.5 feet times scale.
 */
export function fontForCapHeight(capFeet, scale) {
  const px = (capFeet / CAP_HEIGHT_RATIO) * scale;
  return `bold ${px}px system-ui, sans-serif`;
}

export function labelFont(scale) {
  return fontForCapHeight(LABEL_CAP_HEIGHT_FEET, scale);
}

/**
 * Draw label.text at feet (label.x, label.y), transformed like drawOutline,
 * with a stroked halo under the filled text for legibility over the floor
 * plan or floor texture.
 */
export function drawLabel(ctx, label, options = {}) {
  const {
    scale = 1,
    offset = [0, 0],
    color,
    haloColor = "rgba(0,0,0,0.6)",
  } = options;

  const [x, y] = feetToPixels([label.x, label.y], scale, offset);

  ctx.font = labelFont(scale);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.15 * scale;
  ctx.strokeStyle = haloColor;
  ctx.strokeText(label.text, x, y);

  if (color) ctx.fillStyle = color;
  ctx.fillText(label.text, x, y);
}

/**
 * Bounding box of an outline polygon in feet, for hit tests and dirty rects.
 */
export function strokeBounds(outline) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
