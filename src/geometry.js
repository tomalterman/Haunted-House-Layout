// Pure geometry shared by the map, the zone tool, and the walk.
// Points are [x, y] arrays in feet; nothing here touches the DOM.

const MAX_STEP = 0.2; // feet per collision substep

// Even-odd ray casting. Boundary points follow the half-open convention of
// the crossing test, so a point on the left edge of an axis-aligned square
// counts as inside and one on its right edge as outside. The answer is
// stable, but callers should not rely on it for points exactly on an edge.
export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Nearest point on segment a-b to p, as [x, y].
function closestPointOnSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return [ax, ay];
  // Parameter along the segment, clamped so the ends are respected.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return [ax + t * dx, ay + t * dy];
}

export function distancePointToSegment(point, a, b) {
  const [cx, cy] = closestPointOnSegment(point, a, b);
  return Math.hypot(point[0] - cx, point[1] - cy);
}

// Snap to the nearest anchor within radius, else to the grid.
export function snapPoint(point, { grid = 1, anchors = [], radius = 1.5 } = {}) {
  let best = null;
  let bestDistance = radius;
  for (const anchor of anchors) {
    const d = Math.hypot(point[0] - anchor[0], point[1] - anchor[1]);
    if (d <= bestDistance) {
      best = anchor;
      bestDistance = d;
    }
  }
  if (best) return [best[0], best[1]];
  return [Math.round(point[0] / grid) * grid, Math.round(point[1] / grid) * grid];
}

// Move a circle by delta, sliding along walls instead of passing through them.
// Each wall is a capsule of radius (thickness / 2 + circle radius) around its
// segment. The move is split into substeps no longer than MAX_STEP, which is
// well under that capsule radius, so the centre can never cross a wall line
// in a single step and there is no tunnelling.
export function slideCircleAlongWalls(position, delta, radius, walls) {
  let [x, y] = position;
  const length = Math.hypot(delta[0], delta[1]);
  if (length === 0) return [x, y];

  const steps = Math.ceil(length / MAX_STEP);
  const stepX = delta[0] / steps;
  const stepY = delta[1] / steps;

  for (let s = 0; s < steps; s++) {
    x += stepX;
    y += stepY;
    // A few passes so being pushed off one wall cannot leave us inside another.
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const wall of walls) {
        const clearance = radius + (wall.thickness ?? 0) / 2;
        const [cx, cy] = closestPointOnSegment([x, y], wall.a, wall.b);
        let nx = x - cx;
        let ny = y - cy;
        let d = Math.hypot(nx, ny);
        if (d >= clearance) continue;
        if (d === 0) {
          // Centre exactly on the wall line: push out along the wall's left normal.
          nx = -(wall.b[1] - wall.a[1]);
          ny = wall.b[0] - wall.a[0];
          d = Math.hypot(nx, ny) || 1;
        }
        x += (nx / d) * (clearance - d);
        y += (ny / d) * (clearance - d);
        moved = true;
      }
      if (!moved) break;
    }
  }
  return [x, y];
}

// The newest zone containing the point, or null. Zones are { points, createdAt }.
export function zoneAt(point, zones) {
  let newest = null;
  for (const zone of zones) {
    if (!pointInPolygon(point, zone.points)) continue;
    if (!newest || zone.createdAt > newest.createdAt) newest = zone;
  }
  return newest;
}

// Unique wall endpoints, for snapping zone corners to wall corners.
export function wallEndpoints(walls) {
  const seen = new Set();
  const points = [];
  for (const wall of walls) {
    for (const [px, py] of [wall.a, wall.b]) {
      const key = `${px},${py}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push([px, py]);
    }
  }
  return points;
}
