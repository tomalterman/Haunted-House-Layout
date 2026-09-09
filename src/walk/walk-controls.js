// Walk controls (KTD14 Layer 2, walk/): the pure walker that turns joystick
// input into a collision-resolved position, and the thin browser layer that
// turns touches, a mouse, and WASD into that input (KTD5). Imports Layer 0
// only; never map/ and never three.
//
// Frame: map feet, origin top-left, y down (KTD6). Position is [x, y] in map
// feet; walk-view.js maps it to world (x, 0, y).
//
// Yaw convention: it matches three's camera rotation.y so main.js can hand
// the walker's yaw to walkView.setCamera unchanged. Yaw 0 faces decreasing
// map y (up the sketch, world -z); a positive yaw turns left (counter-
// clockwise seen from above), so yaw -pi/2 faces +x (east on the map).
//   forward = (-sin yaw, -cos yaw)   right = (cos yaw, -sin yaw)
// Pitch is the camera's rotation.x: positive looks up, clamped to 80 degrees.
import { slideCircleAlongWalls, zoneAt, distancePointToSegment } from "../geometry.js";

/** Walls plus solid-volume edges; falls back to walls for a bare floor plan. */
function collisionWalls(floorplan) {
  return floorplan.collisionWalls ?? floorplan.walls;
}

export const DEFAULT_SPEED_FPS = 3;
export const DEFAULT_RADIUS_FEET = 0.75;
export const DEFAULT_EYE_HEIGHT_FEET = 4;
export const MAX_PITCH = (80 * Math.PI) / 180;
export const LOOK_RADIANS_PER_PX = 0.005;

const NUDGE_RING_STEP = 0.25;
const NUDGE_MAX_RADIUS = 8;
const NUDGE_RING_SAMPLES = 16;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function wallClearance(wall, radius) {
  return radius + (wall.thickness ?? 0) / 2;
}

function isFree(point, floorplan, radius) {
  const { w, h } = floorplan.bounds;
  if (point[0] < radius || point[1] < radius || point[0] > w - radius || point[1] > h - radius) return false;
  return collisionWalls(floorplan).every(
    (wall) => distancePointToSegment(point, wall.a, wall.b) >= wallClearance(wall, radius),
  );
}

/**
 * The nearest point to `point` that keeps a circle of `radius` feet clear of
 * every wall (wall thickness included) and inside the gym. A free point comes
 * back unchanged; otherwise rings of candidates at growing distance are tried
 * and the first free one wins, so a tap on a wall lands right beside it.
 */
export function nearestFreeSpot(point, floorplan, radius = DEFAULT_RADIUS_FEET) {
  const start = [point[0], point[1]];
  if (isFree(start, floorplan, radius)) return start;
  for (let r = NUDGE_RING_STEP; r <= NUDGE_MAX_RADIUS; r += NUDGE_RING_STEP) {
    for (let i = 0; i < NUDGE_RING_SAMPLES; i++) {
      const angle = (i / NUDGE_RING_SAMPLES) * Math.PI * 2;
      const candidate = [start[0] + r * Math.cos(angle), start[1] + r * Math.sin(angle)];
      if (isFree(candidate, floorplan, radius)) return candidate;
    }
  }
  // Nothing free nearby (should not happen on this plan): the gym centre.
  return [floorplan.bounds.w / 2, floorplan.bounds.h / 2];
}

/** Seconds -> "m:ss" for the HUD clock. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Yaw that faces along the map direction [dx, dy] (see the header). */
export function yawFacing([dx, dy]) {
  return Math.atan2(-dx, -dy);
}

/**
 * Pure walker: position, yaw, pitch, and elapsed time. `step(input, dt)`
 * applies the joystick vector at `speed` feet per second along the facing
 * direction, resolved against the walls with slideCircleAlongWalls, and
 * returns the zone under the walker via getZones() or null (KTD5, R11, R12).
 */
export function createWalker({
  floorplan,
  getZones = () => [],
  speed = DEFAULT_SPEED_FPS,
  radius = DEFAULT_RADIUS_FEET,
  eyeHeight = DEFAULT_EYE_HEIGHT_FEET,
  start,
  yaw: startYaw,
}) {
  const defaultStart = floorplan.path?.[0] ?? [floorplan.bounds.w / 2, floorplan.bounds.h / 2];
  // Yaw 0 (up the sketch) unless the caller picks one; main.js passes
  // yawFacing(first path leg) so the entrance start looks into the gym.
  const defaultYaw = startYaw ?? 0;

  let startPoint = nearestFreeSpot(start ?? defaultStart, floorplan, radius);
  let position = [startPoint[0], startPoint[1]];
  let yaw = defaultYaw;
  let pitch = 0;
  let elapsed = 0;

  function currentZone() {
    return zoneAt(position, getZones() ?? []) ?? null;
  }

  function snapshot() {
    return { position: [position[0], position[1]], yaw, pitch, zone: currentZone(), elapsed };
  }

  function step(input = {}, dt = 0) {
    if (!(dt > 0)) return snapshot();
    elapsed += dt;
    let forward = clamp(Number(input.forward) || 0, -1, 1);
    let strafe = clamp(Number(input.strafe) || 0, -1, 1);
    const magnitude = Math.hypot(forward, strafe);
    if (magnitude > 1) {
      forward /= magnitude;
      strafe /= magnitude;
    }
    if (magnitude > 0) {
      const fx = -Math.sin(yaw);
      const fy = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const ry = -Math.sin(yaw);
      const distance = speed * dt;
      const delta = [(fx * forward + rx * strafe) * distance, (fy * forward + ry * strafe) * distance];
      position = slideCircleAlongWalls(position, delta, radius, collisionWalls(floorplan));
    }
    return snapshot();
  }

  function look(dYaw = 0, dPitch = 0) {
    yaw += dYaw;
    pitch = clamp(pitch + dPitch, -MAX_PITCH, MAX_PITCH);
  }

  function setStart(point) {
    startPoint = nearestFreeSpot(point, floorplan, radius);
    position = [startPoint[0], startPoint[1]];
    elapsed = 0;
  }

  function reset() {
    position = [startPoint[0], startPoint[1]];
    yaw = defaultYaw;
    pitch = 0;
    elapsed = 0;
  }

  return {
    get position() {
      return [position[0], position[1]];
    },
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get elapsed() {
      return elapsed;
    },
    get zone() {
      return currentZone();
    },
    eyeHeight,
    radius,
    speed,
    step,
    look,
    setStart,
    reset,
  };
}

const KEY_AXES = {
  KeyW: ["forward", 1],
  ArrowUp: ["forward", 1],
  KeyS: ["forward", -1],
  ArrowDown: ["forward", -1],
  KeyD: ["strafe", 1],
  ArrowRight: ["strafe", 1],
  KeyA: ["strafe", -1],
  ArrowLeft: ["strafe", -1],
};

/**
 * Browser layer (KTD5): a nipplejs static joystick in `joystickEl` for
 * movement, a pointer drag on `lookEl` for looking (touch or mouse), and
 * WASD / arrow keys for desktop. getInput() returns { forward, strafe } in
 * -1..1: the joystick while it is held, else the keyboard.
 */
export function createTouchControls({
  joystickEl,
  lookEl,
  nipplejs,
  onLook = () => {},
  radiansPerPx = LOOK_RADIANS_PER_PX,
  target = globalThis,
}) {
  let joystick = { forward: 0, strafe: 0, active: false };
  const keys = new Set();

  // ---- joystick ----
  const manager = nipplejs?.create
    ? nipplejs.create({
        zone: joystickEl,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "white",
        size: 110,
        restOpacity: 0.6,
      })
    : null;

  const onMove = (_event, data) => {
    // vector is a unit direction with y up on screen; force is 0..1 within the
    // outer ring and can exceed 1 when dragged past it.
    const force = clamp(data.force ?? 0, 0, 1);
    joystick = { forward: (data.vector?.y ?? 0) * force, strafe: (data.vector?.x ?? 0) * force, active: true };
  };
  const onEnd = () => {
    joystick = { forward: 0, strafe: 0, active: false };
  };
  manager?.on("move", onMove);
  manager?.on("end", onEnd);

  // ---- look drag (pointer events cover touch, pen, and mouse) ----
  let dragId = null;
  let last = null;
  const onPointerDown = (e) => {
    if (dragId !== null) return;
    dragId = e.pointerId;
    last = [e.clientX, e.clientY];
    try {
      lookEl.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety.
    }
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (e.pointerId !== dragId || !last) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    // Drag right looks right (yaw decreases); drag up looks up (pitch increases).
    onLook(-dx * radiansPerPx, -dy * radiansPerPx);
  };
  const onPointerUp = (e) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    last = null;
    try {
      lookEl.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  };
  lookEl.addEventListener("pointerdown", onPointerDown);
  lookEl.addEventListener("pointermove", onPointerMove);
  lookEl.addEventListener("pointerup", onPointerUp);
  lookEl.addEventListener("pointercancel", onPointerUp);

  // ---- keyboard ----
  const isTyping = (e) => {
    const tag = e.target?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
  };
  const onKeyDown = (e) => {
    if (!KEY_AXES[e.code] || isTyping(e)) return;
    keys.add(e.code);
    e.preventDefault();
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
  };
  const onBlur = () => keys.clear();
  target.addEventListener?.("keydown", onKeyDown);
  target.addEventListener?.("keyup", onKeyUp);
  target.addEventListener?.("blur", onBlur);

  function keyboardInput() {
    let forward = 0;
    let strafe = 0;
    for (const code of keys) {
      const [axis, sign] = KEY_AXES[code];
      if (axis === "forward") forward += sign;
      else strafe += sign;
    }
    return { forward: clamp(forward, -1, 1), strafe: clamp(strafe, -1, 1) };
  }

  function getInput() {
    if (joystick.active) return { forward: joystick.forward, strafe: joystick.strafe };
    return keyboardInput();
  }

  function destroy() {
    manager?.off?.("move", onMove);
    manager?.off?.("end", onEnd);
    manager?.destroy?.();
    lookEl.removeEventListener("pointerdown", onPointerDown);
    lookEl.removeEventListener("pointermove", onPointerMove);
    lookEl.removeEventListener("pointerup", onPointerUp);
    lookEl.removeEventListener("pointercancel", onPointerUp);
    target.removeEventListener?.("keydown", onKeyDown);
    target.removeEventListener?.("keyup", onKeyUp);
    target.removeEventListener?.("blur", onBlur);
    keys.clear();
    joystick = { forward: 0, strafe: 0, active: false };
  }

  return { getInput, destroy, manager };
}
