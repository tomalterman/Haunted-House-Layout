// Map view renderer (KTD14 Layer 2): draws the locked floor plan, team zones,
// freehand strokes, and labels on a 2D canvas with pan and zoom in feet.
//
// Coordinates are feet in floor space, origin top-left, y down (KTD6). The
// view transform converts feet to CSS pixels; `devicePixelRatio` only scales
// the canvas backing store. Every mark is drawn through stroke-outline.js so
// the map and the walk view's floor texture stay identical (KTD6).
//
// Imports Layers 0 and 1 only. Never imports walk/. The only DOM object it
// touches is the canvas handed in, so tests can pass a @napi-rs/canvas canvas.
import { strokeOutline, drawOutline, drawLabel, fontForCapHeight } from "../stroke-outline.js";

export const MIN_SCALE = 2; // px per foot
export const MAX_SCALE = 60;

export const COLORS = {
  background: "#1b1b1f",
  floor: "#C9A86C", // Ram Board tan
  grid: "rgba(0, 0, 0, 0.08)",
  wall: "#111",
  tentFill: "#F4EFE4",
  tentLine: "#555",
  stage: "#1F3A6B",
  stageText: "#F4EFE4",
  path: "#666",
  fallbackTeam: "#888",
};

const GRID_FEET = 5;
const ZONE_FILL_ALPHA = 0.25;
const ZONE_LABEL_CAP_FEET = 2;
const IN_PROGRESS_ALPHA = 0.7;
// Typical sans-serif cap height as a fraction of the font's pixel size.

const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Pan/zoom state in feet. `offset` is in feet and `toPx` is
 * `(x + ox) * scale`, the same convention as drawOutline/drawLabel so the
 * transform can be passed straight through to them.
 */
export function createViewTransform({ scale = 8, offset = [0, 0] } = {}) {
  const t = {
    scale,
    offset: [offset[0], offset[1]],

    toPx([x, y]) {
      return [(x + t.offset[0]) * t.scale, (y + t.offset[1]) * t.scale];
    },

    toFeet([px, py]) {
      return [px / t.scale - t.offset[0], py / t.scale - t.offset[1]];
    },

    /**
     * Fit `bounds` ({ w, h } feet) inside width by height CSS px, centered in
     * the area left over after `insets` ({ top, right, bottom, left } CSS px),
     * so overlays like the toolbar never cover part of the gym.
     */
    fitToBounds({ width, height }, bounds, margin = 20, insets = {}) {
      const top = insets.top ?? 0;
      const right = insets.right ?? 0;
      const bottom = insets.bottom ?? 0;
      const left = insets.left ?? 0;
      const usableW = Math.max(1, width - left - right - 2 * margin);
      const usableH = Math.max(1, height - top - bottom - 2 * margin);
      const fit = Math.min(usableW / bounds.w, usableH / bounds.h);
      t.scale = clampScale(fit > 0 ? fit : MIN_SCALE);
      const centerX = left + (width - left - right) / 2;
      const centerY = top + (height - top - bottom) / 2;
      t.offset = [centerX / t.scale - bounds.w / 2, centerY / t.scale - bounds.h / 2];
      return t;
    },

    panBy([dxPx, dyPx]) {
      t.offset = [t.offset[0] + dxPx / t.scale, t.offset[1] + dyPx / t.scale];
      return t;
    },

    /** Zoom by `factor` keeping the feet point under [px, py] fixed. */
    zoomAt([px, py], factor) {
      const [fx, fy] = t.toFeet([px, py]);
      t.scale = clampScale(t.scale * factor);
      t.offset = [px / t.scale - fx, py / t.scale - fy];
      return t;
    },
  };
  return t;
}

/** Area centroid of a polygon in feet; falls back to the vertex mean. */
export function polygonCentroid(points) {
  const n = points.length;
  if (n === 0) return [0, 0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of points) {
      sx += x;
      sy += y;
    }
    return [sx / n, sy / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/**
 * Pure: the ordered list of things to draw for a store state. Floor, zones,
 * walls, tents, stage, path, then strokes and labels of visible teams.
 */
export function buildDrawList(state, floorplan) {
  const hidden = state.hidden ?? new Set();
  const items = [{ kind: "floor" }];
  for (const zone of state.zones ?? []) {
    items.push({ kind: "zone", zone, centroid: polygonCentroid(zone.points) });
  }
  for (const wall of floorplan.walls) items.push({ kind: "wall", wall });
  for (const tent of floorplan.tents) items.push({ kind: "tent", tent });
  if (floorplan.stage) items.push({ kind: "stage" });
  if (floorplan.path?.length) items.push({ kind: "path" });
  for (const stroke of state.strokes ?? []) {
    if (!hidden.has(stroke.team)) items.push({ kind: "stroke", stroke });
  }
  for (const label of state.labels ?? []) {
    if (!hidden.has(label.team)) items.push({ kind: "label", label });
  }
  return items;
}

function tracePolygon(ctx, points, transform) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = transform.toPx(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function createMapView({
  canvas,
  store,
  floorplan,
  teams,
  transform = createViewTransform(),
  raf = globalThis.requestAnimationFrame,
  dpr = globalThis.devicePixelRatio || 1,
  Path2DCtor = globalThis.Path2D,
}) {
  const ctx = canvas.getContext("2d");
  const teamColor = new Map(teams.map((t) => [t.id, t.color]));
  const colorOf = (teamId) => teamColor.get(teamId) ?? COLORS.fallbackTeam;

  // CSS pixel size of the drawing surface; the backing store is this times dpr.
  let width = 0;
  let height = 0;
  let fitted = false;
  let frame = null;
  let inProgress = null;
  let destroyed = false;

  const view = {
    transform,

    /** Coalesce to one draw per animation frame (KTD13). */
    requestRedraw() {
      if (destroyed || frame !== null) return;
      frame = raf(() => {
        frame = null;
        if (!destroyed) view.draw();
      });
    },

    /**
     * Size the backing store by dpr. Pass { width, height } in CSS pixels when
     * the canvas has no layout (Node tests); otherwise clientWidth/Height are
     * used. The first call fits the whole gym into view.
     */
    resize(size) {
      width = Math.max(1, Math.round(size?.width ?? canvas.clientWidth ?? canvas.width));
      height = Math.max(1, Math.round(size?.height ?? canvas.clientHeight ?? canvas.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (!fitted) {
        transform.fitToBounds({ width, height }, floorplan.bounds, 20, size?.insets);
        fitted = true;
      }
      view.requestRedraw();
    },

    setInProgressStroke(stroke) {
      inProgress = stroke ?? null;
      view.requestRedraw();
    },

    draw() {
      if (width === 0 || height === 0) return;
      const { scale, offset } = transform;
      const items = buildDrawList(store.getState(), floorplan);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, width, height);

      for (const item of items) drawItem(item);

      if (inProgress) {
        ctx.globalAlpha = IN_PROGRESS_ALPHA;
        drawStroke(inProgress);
        ctx.globalAlpha = 1;
      }

      function drawItem(item) {
        switch (item.kind) {
          case "floor":
            return drawFloor();
          case "zone":
            return drawZone(item.zone, item.centroid);
          case "wall":
            return drawWall(item.wall);
          case "tent":
            return drawTent(item.tent);
          case "stage":
            return drawStage(floorplan.stage);
          case "path":
            return drawPath(floorplan.path);
          case "stroke":
            return drawStroke(item.stroke);
          case "label":
            return drawLabel(ctx, item.label, { scale, offset, color: colorOf(item.label.team) });
          default:
            return undefined;
        }
      }

      function drawFloor() {
        const { w, h } = floorplan.bounds;
        const [x0, y0] = transform.toPx([0, 0]);
        const [x1, y1] = transform.toPx([w, h]);
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = GRID_FEET; x < w; x += GRID_FEET) {
          const [gx] = transform.toPx([x, 0]);
          ctx.moveTo(gx, y0);
          ctx.lineTo(gx, y1);
        }
        for (let y = GRID_FEET; y < h; y += GRID_FEET) {
          const [, gy] = transform.toPx([0, y]);
          ctx.moveTo(x0, gy);
          ctx.lineTo(x1, gy);
        }
        ctx.stroke();
      }

      function drawZone(zone, centroid) {
        if (!zone.points || zone.points.length < 3) return;
        const color = colorOf(zone.team);
        tracePolygon(ctx, zone.points, transform);
        ctx.globalAlpha = ZONE_FILL_ALPHA;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, 0.15 * scale);
        ctx.stroke();

        if (zone.name) {
          const [cx, cy] = transform.toPx(centroid);
          ctx.font = fontForCapHeight(ZONE_LABEL_CAP_FEET, scale);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";
          ctx.lineWidth = 0.2 * scale;
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.strokeText(zone.name, cx, cy);
          ctx.fillStyle = color;
          ctx.fillText(zone.name, cx, cy);
        }
      }

      function drawWall(wall) {
        const [ax, ay] = transform.toPx(wall.a);
        const [bx, by] = transform.toPx(wall.b);
        ctx.strokeStyle = COLORS.wall;
        ctx.lineWidth = Math.max(1.5, wall.thickness * scale);
        ctx.lineCap = "square";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      function drawTent(tent) {
        const [x, y] = transform.toPx([tent.x, tent.y]);
        const size = tent.size * scale;
        ctx.fillStyle = COLORS.tentFill;
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = COLORS.tentLine;
        ctx.lineWidth = Math.max(1, 0.1 * scale);
        ctx.setLineDash([0.5 * scale, 0.5 * scale]);
        ctx.strokeRect(x, y, size, size);
        ctx.setLineDash([]);
      }

      function drawStage(stage) {
        const [x, y] = transform.toPx([stage.x, stage.y]);
        const w = stage.w * scale;
        const h = stage.h * scale;
        ctx.fillStyle = COLORS.stage;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = COLORS.stageText;
        ctx.font = `bold ${Math.min(h * 0.6, 1.5 * scale)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("STAGE", x + w / 2, y + h / 2);
      }

      function drawPath(path) {
        ctx.strokeStyle = COLORS.path;
        ctx.lineWidth = Math.max(1, 0.2 * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([0.8 * scale, 0.6 * scale]);
        ctx.beginPath();
        path.forEach((p, i) => {
          const [x, y] = transform.toPx(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      function drawStroke(stroke) {
        const outline = strokeOutline(stroke);
        if (!outline) return;
        drawOutline(ctx, outline, { scale, offset, color: colorOf(stroke.team), Path2DCtor });
      }
    },

    destroy() {
      destroyed = true;
      unsubscribe();
      frame = null;
    },
  };

  // Transform changes schedule a redraw too (KTD13), so input code can pan and
  // zoom without remembering to call requestRedraw.
  for (const name of ["fitToBounds", "panBy", "zoomAt"]) {
    const original = transform[name];
    transform[name] = (...args) => {
      const result = original.apply(transform, args);
      view.requestRedraw();
      return result;
    };
  }

  const unsubscribe = store.subscribe(view.requestRedraw);

  return view;
}
