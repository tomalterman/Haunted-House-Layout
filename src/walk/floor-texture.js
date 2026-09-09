// Floor texture for the walk view (KTD14 Layer 2, walk/). Rasterizes the shared
// store's zone tints, strokes, and labels onto an offscreen canvas at 20 pixels
// per foot (KTD6): 1700 by 1200 for the 85 by 60 foot gym. Walls and tents are
// 3D geometry in walk-view.js, not part of the texture.
//
// Owns no frame loop (KTD13): a store change only sets a dirty flag, and the
// walk loop calls drawIfDirty() so the map can draw all day while the walk is
// hidden without rasterizing a single texture frame.
//
// The canvas factory is injected: the browser passes a factory around
// document.createElement("canvas"), Node tests pass @napi-rs/canvas's
// createCanvas. Path2D is injected for the same reason.
import { strokeOutline, drawOutline, drawLabel } from "../stroke-outline.js";

export const PX_PER_FOOT = 20;

// Ram Board tan, as in the build photos.
export const FLOOR_BASE_COLOR = "#C9A86C";
const GRID_FEET = 5;
// Premixed 7 percent darker tan, opaque, so line crossings do not stack darker.
const GRID_COLOR = "#BB9C64";
const ZONE_ALPHA = 0.35;
const UNKNOWN_TEAM_COLOR = "#888888";

export function createFloorTexture({
  store,
  floorplan,
  teams,
  createCanvas,
  Path2DCtor = globalThis.Path2D,
}) {
  const width = floorplan.bounds.w * PX_PER_FOOT;
  const height = floorplan.bounds.h * PX_PER_FOOT;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const colorByTeam = new Map(teams.map((team) => [team.id, team.color]));
  const teamColor = (id) => colorByTeam.get(id) ?? UNKNOWN_TEAM_COLOR;

  let dirty = true;
  let unsubscribe = store.subscribe(() => {
    dirty = true;
  });

  function markDirty() {
    dirty = true;
  }

  function drawBase() {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = FLOOR_BASE_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Faint 5 foot grid so the floor reads as a scale, not a flat wash.
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= floorplan.bounds.w; x += GRID_FEET) {
      const px = x * PX_PER_FOOT + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = 0; y <= floorplan.bounds.h; y += GRID_FEET) {
      const py = y * PX_PER_FOOT + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawZones(zones) {
    for (const zone of zones) {
      if (!zone.points || zone.points.length < 3) continue;
      ctx.save();
      ctx.globalAlpha = ZONE_ALPHA;
      ctx.fillStyle = teamColor(zone.team);
      ctx.beginPath();
      zone.points.forEach(([x, y], i) => {
        const px = x * PX_PER_FOOT;
        const py = y * PX_PER_FOOT;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStrokes(strokes, hidden) {
    for (const stroke of strokes) {
      if (hidden.has(stroke.team)) continue;
      const outline = strokeOutline(stroke.points, stroke.size);
      drawOutline(ctx, outline, {
        scale: PX_PER_FOOT,
        color: teamColor(stroke.team),
        Path2DCtor,
      });
    }
  }

  function drawLabels(labels, hidden) {
    for (const label of labels) {
      if (hidden.has(label.team)) continue;
      drawLabel(ctx, label, { scale: PX_PER_FOOT, color: teamColor(label.team) });
    }
  }

  function draw() {
    const { zones, strokes, labels, hidden } = store.getState();
    drawBase();
    drawZones(zones);
    drawStrokes(strokes, hidden);
    drawLabels(labels, hidden);
    dirty = false;
  }

  function drawIfDirty() {
    if (!dirty) return false;
    draw();
    return true;
  }

  function destroy() {
    unsubscribe?.();
    unsubscribe = null;
    dirty = false;
  }

  return { canvas, width, height, markDirty, drawIfDirty, draw, destroy };
}
