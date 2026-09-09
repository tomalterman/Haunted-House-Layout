// Map input (KTD14 Layer 2): the pointer-count state machine behind drawing,
// tapping, and two-finger pan/zoom on the map canvas (KTD10).
//
// createInputMachine and hitTestMark are pure: they never touch the DOM, so
// tests drive them with synthetic pointer events. bindPointerEvents is the
// thin browser layer that turns PointerEvents into the normalized shape
// `{ type, id, x, y, pressure?, pointerType? }` with x, y in canvas CSS px.
//
// States (KTD10):
//   Idle     no pointers
//   Drawing  one pointer, draw tool; points accumulate into a stroke
//   Placing  one pointer, any other tool; a short tap becomes onTap
//   Panning  two pointers (a third is ignored); midpoint drag pans, distance
//            ratio zooms; ends when every tracked pointer lifts
import { distancePointToSegment } from "../geometry.js";
import { decodeStrokePoints } from "../store.js";

export const TOOLS = ["draw", "label", "erase", "zone", "walk-from-here"];
export const TAP_SLOP_PX = 8;
const MAX_PAN_POINTERS = 2;

const noop = () => {};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];

const HANDLER_NAMES = [
  "onStrokeStart",
  "onStrokePoint",
  "onStrokeEnd",
  "onStrokeCancel",
  "onPan",
  "onZoom",
  "onTap",
];

export function createInputMachine({ minStrokePoints = 4, ...options } = {}) {
  // Handlers may be given up front or installed later with setHandlers, so
  // the toolbar can wire an already-created machine.
  const handlers = Object.fromEntries(HANDLER_NAMES.map((n) => [n, noop]));
  const setHandlers = (partial = {}) => {
    for (const name of HANDLER_NAMES) {
      if (typeof partial[name] === "function") handlers[name] = partial[name];
    }
  };
  setHandlers(options);

  let state = "Idle";
  let tool = "draw";
  // Pointers we act on, in down order; capped at two while panning.
  const pointers = new Map();
  // Drawing: accumulated stroke points; Placing: origin and slop tracking.
  let stroke = null;
  let strokePointerType = null;
  let origin = null;
  let moved = false;

  const samplePoint = (e) => ({ x: e.x, y: e.y, pressure: e.pressure ?? 0.5 });

  function reset() {
    state = "Idle";
    pointers.clear();
    stroke = null;
    strokePointerType = null;
    origin = null;
    moved = false;
  }

  function cancelGesture() {
    const wasDrawing = state === "Drawing";
    reset();
    if (wasDrawing) handlers.onStrokeCancel();
  }

  function startPanning() {
    if (state === "Drawing") {
      stroke = null;
      strokePointerType = null;
      handlers.onStrokeCancel();
    }
    origin = null;
    moved = false;
    state = "Panning";
  }

  function handleDown(e) {
    if (state === "Idle") {
      pointers.set(e.id, samplePoint(e));
      if (tool === "draw") {
        state = "Drawing";
        stroke = [samplePoint(e)];
        strokePointerType = e.pointerType ?? null;
        handlers.onStrokeStart(stroke[0], strokePointerType);
      } else {
        state = "Placing";
        origin = { x: e.x, y: e.y };
        moved = false;
      }
      return;
    }
    if (pointers.has(e.id)) return;
    if (pointers.size >= MAX_PAN_POINTERS) return; // third pointer ignored
    pointers.set(e.id, samplePoint(e));
    startPanning();
  }

  function handleMove(e) {
    const prev = pointers.get(e.id);
    if (!prev) return;
    const next = samplePoint(e);

    if (state === "Drawing") {
      pointers.set(e.id, next);
      stroke.push(next);
      handlers.onStrokePoint(next);
      return;
    }
    if (state === "Placing") {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      pointers.set(e.id, next);
      if (!moved && Math.hypot(e.x - origin.x, e.y - origin.y) >= TAP_SLOP_PX) moved = true;
      // One finger / mouse drag pans in every non-draw tool so a laptop can
      // move the map without a second pointer (R7, R15).
      if (moved) handlers.onPan([dx, dy]);
      return;
    }
    if (state === "Panning") {
      const others = [...pointers.values()].filter((p) => p !== prev);
      if (others.length === 0) {
        pointers.set(e.id, next);
        handlers.onPan([next.x - prev.x, next.y - prev.y]);
        return;
      }
      const other = others[0];
      const before = midpoint(prev, other);
      const after = midpoint(next, other);
      const beforeDist = dist(prev, other);
      const afterDist = dist(next, other);
      pointers.set(e.id, next);
      handlers.onPan([after[0] - before[0], after[1] - before[1]]);
      if (beforeDist > 0 && afterDist > 0) {
        handlers.onZoom({ center: after, factor: afterDist / beforeDist });
      }
    }
  }

  function handleWheel(e) {
    // Trackpad pinch arrives as ctrl+wheel; a plain wheel or two-finger
    // scroll pans. Prevents the desktop map from being stuck at fit-zoom.
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-(e.deltaY ?? 0) * 0.01);
      if (factor > 0 && Number.isFinite(factor)) {
        handlers.onZoom({ center: [e.x, e.y], factor });
      }
      return;
    }
    handlers.onPan([-(e.deltaX ?? 0), -(e.deltaY ?? 0)]);
  }

  function handleUp(e) {
    if (!pointers.has(e.id)) return;
    pointers.delete(e.id);

    if (state === "Drawing") {
      const points = stroke;
      const pointerType = strokePointerType;
      reset();
      if (points.length >= minStrokePoints) handlers.onStrokeEnd(points, pointerType);
      else handlers.onStrokeCancel();
      return;
    }
    if (state === "Placing") {
      const tapped = !moved && Math.hypot(e.x - origin.x, e.y - origin.y) < TAP_SLOP_PX;
      const currentTool = tool;
      reset();
      if (tapped) handlers.onTap({ x: e.x, y: e.y, tool: currentTool });
      return;
    }
    if (state === "Panning" && pointers.size === 0) reset();
  }

  return {
    get state() {
      return state;
    },
    get tool() {
      return tool;
    },
    get activePointers() {
      return pointers.size;
    },

    /** Install or replace callbacks after creation. */
    setHandlers,

    setTool(name) {
      if (!TOOLS.includes(name)) throw new Error(`Unknown map tool: ${name}`);
      if (state !== "Idle") cancelGesture();
      tool = name;
    },

    /** Feed one normalized pointer event. */
    handle(e) {
      switch (e.type) {
        case "down":
          return handleDown(e);
        case "move":
          return handleMove(e);
        case "up":
          return handleUp(e);
        case "cancel":
          if (pointers.has(e.id)) cancelGesture();
          return undefined;
        case "wheel":
          return handleWheel(e);
        default:
          return undefined;
      }
    },

    /** Drop every pointer and any in-progress gesture (e.g. on blur). */
    cancel: cancelGesture,
  };
}

/**
 * Pure: id of the nearest visible stroke or label within `radius` feet of
 * `pointFeet`, or null. Stroke distance is to the closest segment of its
 * decoded polyline; label distance is to its anchor. Hidden teams are
 * skipped so erase cannot remove a mark the user cannot see.
 */
export function hitTestMark(state, pointFeet, radius = 1) {
  const hidden = state.hidden ?? new Set();
  let best = null;
  let bestDist = radius;

  for (const stroke of state.strokes ?? []) {
    if (hidden.has(stroke.team)) continue;
    const pts = decodeStrokePoints(stroke);
    if (pts.length === 0) continue;
    let d;
    if (pts.length === 1) {
      d = Math.hypot(pointFeet[0] - pts[0][0], pointFeet[1] - pts[0][1]);
    } else {
      d = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const seg = distancePointToSegment(pointFeet, pts[i - 1], pts[i]);
        if (seg < d) d = seg;
        if (d === 0) break;
      }
    }
    if (d <= bestDist) {
      best = stroke.id;
      bestDist = d;
    }
  }

  for (const label of state.labels ?? []) {
    if (hidden.has(label.team)) continue;
    const d = Math.hypot(pointFeet[0] - label.x, pointFeet[1] - label.y);
    if (d <= bestDist) {
      best = label.id;
      bestDist = d;
    }
  }

  return best;
}

/**
 * Browser layer: forward the canvas's PointerEvents to `machine` as
 * normalized events. The canvas has `touch-action: none` from CSS; pointer
 * capture is best-effort so synthetic pointers without capture support do
 * not abort the handler (KTD10). Returns an unbind function.
 */
export function bindPointerEvents(canvas, machine, { toFeet } = {}) {
  // clientX/Y minus the canvas box, not offsetX/Y: pointer capture makes
  // offsetX wrong in some browsers once the pointer leaves the element.
  const pointOnCanvas = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const normalize = (type, e) => {
    const { x, y } = pointOnCanvas(e);
    const event = {
      type,
      id: e.pointerId,
      x,
      y,
      pressure: e.pressure,
      pointerType: e.pointerType,
    };
    if (toFeet) event.feet = toFeet([x, y]);
    return event;
  };

  const onDown = (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; drawing works without it.
    }
    machine.handle(normalize("down", e));
  };
  const onMove = (e) => machine.handle(normalize("move", e));
  const onUp = (e) => {
    machine.handle(normalize("up", e));
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or never captured.
    }
  };
  const onCancel = (e) => machine.handle(normalize("cancel", e));
  const onContextMenu = (e) => e.preventDefault();
  const onWheel = (e) => {
    e.preventDefault();
    const { x, y } = pointOnCanvas(e);
    machine.handle({
      type: "wheel",
      x,
      y,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("wheel", onWheel);
  };
}
