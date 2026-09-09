// Layer 1: turn freehand wall strokes into collision/render segments.
// Thick black map strokes are the haunt path walls. Colored team marks stay
// floor paint. No imports from map/ or walk/.

export const WALL_TEAM = "walls";
export const WALL_COLOR = "#111111";
export const WALL_SWATCH = { id: WALL_TEAM, name: "Walls", color: WALL_COLOR };

const STORE_UNITS_PER_FOOT = 20;
const DEFAULT_THICKNESS = 0.6;
const MIN_SEGMENT_FEET = 0.15;
const FALLBACK_COLOR = "#888888";
const BLACK_LUMA = 30;

function parseHex(color) {
  if (typeof color !== "string") return null;
  let hex = color.trim();
  if (hex[0] === "#") hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** Hex or CSS color whose luminance is near black — the map's wall ink. */
export function isNearBlack(color) {
  const rgb = parseHex(color);
  if (!rgb) return false;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] <= BLACK_LUMA;
}

export function isWallTeam(teamId) {
  if (teamId == null) return false;
  const id = String(teamId);
  return id === WALL_TEAM || id.toLowerCase() === WALL_TEAM || isNearBlack(id);
}

export function isWallStroke(stroke, _teams) {
  return isWallTeam(stroke?.team);
}

/** Resolve a stroke/label team id to a CSS color, including the Walls swatch. */
export function markColor(teamId, teams) {
  if (isWallTeam(teamId)) return WALL_COLOR;
  return teams?.find((team) => team.id === teamId)?.color ?? FALLBACK_COLOR;
}

function decodePoints(stroke) {
  const pts = stroke?.points;
  if (!pts || pts.length === 0) return [];
  if (typeof pts[0] === "number") {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      out.push([pts[i] / STORE_UNITS_PER_FOOT, pts[i + 1] / STORE_UNITS_PER_FOOT]);
    }
    return out;
  }
  return pts.map(([x, y]) => [x, y]);
}

function simplify(points, minLength) {
  if (points.length === 0) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const d = Math.hypot(points[i][0] - prev[0], points[i][1] - prev[1]);
    if (d >= minLength) out.push(points[i]);
  }
  return out;
}

export function strokeToWallSegments(stroke, { minLength = MIN_SEGMENT_FEET } = {}) {
  const points = simplify(decodePoints(stroke), minLength);
  if (points.length < 2) return [];
  const thickness = Number(stroke.size) > 0 ? Number(stroke.size) : DEFAULT_THICKNESS;
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < minLength) continue;
    segments.push({
      id: `${stroke.id ?? "stroke"}-${i}`,
      a: [a[0], a[1]],
      b: [b[0], b[1]],
      thickness,
      strokeId: stroke.id,
    });
  }
  return segments;
}

export function wallSegmentsFromStrokes(strokes, { hidden, teams } = {}) {
  const hide = hidden ?? new Set();
  const out = [];
  for (const stroke of strokes ?? []) {
    if (hide.has(stroke.team)) continue;
    if (!isWallStroke(stroke, teams)) continue;
    out.push(...strokeToWallSegments(stroke));
  }
  return out;
}

/** One cover polygon per named haunt region — the corridor, not the open gym. */
export function hauntCoverPolygons(floorplan) {
  return (floorplan?.regions ?? []).map((region) => ({
    id: `cover-${region.id}`,
    points: (region.points ?? []).map(([x, y]) => [x, y]),
  }));
}

export function combineCollisionWalls(floorplan, extraWalls = []) {
  const base = floorplan?.collisionWalls ?? floorplan?.walls ?? [];
  return extraWalls.length ? [...base, ...extraWalls] : [...base];
}
