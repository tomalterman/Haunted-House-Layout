// Free fly-through camera: a pure step function plus the browser input that drives it.
// No three.js here so the movement math runs under Node tests.
//
// World coordinates: y is up. Yaw 0 looks toward -z; positive yaw turns left.

export const FLY_DEFAULTS = {
  speed: 14, // ft/s
  fastMultiplier: 3,
  turnRate: 1.6, // rad/s for the arrow keys
  lookSensitivity: 0.004, // rad per pixel dragged
  maxPitch: 1.45,
};

// Axes are -1..1 at flying speed; lookX/lookY are pixels dragged; dolly, slide, and lift are
// one-off distances in feet from the wheel and two-finger gestures.
export const emptyInput = () => ({ forward: 0, right: 0, up: 0, turn: 0, lookX: 0, lookY: 0, dolly: 0, slide: 0, lift: 0, fast: false });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Returns the next camera state and whether it changed.
export function stepFly(state, input, dt, { bounds, ...opts } = {}) {
  const o = { ...FLY_DEFAULTS, ...opts };
  const yaw = state.yaw - input.lookX * o.lookSensitivity - input.turn * o.turnRate * dt;
  const pitch = clamp(state.pitch - input.lookY * o.lookSensitivity, -o.maxPitch, o.maxPitch);

  const speed = o.speed * (input.fast ? o.fastMultiplier : 1);
  const cp = Math.cos(pitch);
  const fwd = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const along = input.forward * speed * dt + input.dolly;
  const side = input.right * speed * dt + input.slide;

  let x = state.x + fwd.x * along + right.x * side;
  let y = state.y + fwd.y * along + input.up * speed * dt + input.lift;
  let z = state.z + fwd.z * along + right.z * side;
  if (bounds) {
    x = clamp(x, bounds.min.x, bounds.max.x);
    y = clamp(y, bounds.min.y, bounds.max.y);
    z = clamp(z, bounds.min.z, bounds.max.z);
  }
  const next = { x, y, z, yaw, pitch };
  const moved = x !== state.x || y !== state.y || z !== state.z || yaw !== state.yaw || pitch !== state.pitch;
  return { state: moved ? next : state, moved };
}

const KEYS = {
  KeyW: ['forward', 1], ArrowUp: ['forward', 1],
  KeyS: ['forward', -1], ArrowDown: ['forward', -1],
  KeyD: ['right', 1], KeyA: ['right', -1],
  ArrowRight: ['turn', 1], ArrowLeft: ['turn', -1],
  KeyE: ['up', 1], KeyQ: ['up', -1],
};

// Keyboard (needs the element focused), mouse drag, wheel, and touch gestures on `el`.
// `onChange` fires when new input arrives so the caller can wake its render loop.
export function attachFlyInput(el, onChange = () => {}) {
  const held = new Set();
  let fast = false;
  let lookX = 0;
  let lookY = 0;
  let dolly = 0;
  let slide = 0;
  let lift = 0;
  const pointers = new Map();
  let pair = null; // last two-finger centroid and spread

  const onKey = (down) => (e) => {
    if (e.key === 'Shift') fast = down;
    if (!KEYS[e.code] || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (down) held.add(e.code);
    else held.delete(e.code);
    onChange();
  };
  const keydown = onKey(true);
  const keyup = onKey(false);
  const blur = () => {
    held.clear();
    fast = false;
    pointers.clear();
    pair = null;
  };

  const twoFinger = () => {
    const [a, b] = [...pointers.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, spread: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const pointerdown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el.focus({ preventScroll: true });
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pair = pointers.size === 2 ? twoFinger() : null;
  };
  const pointermove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      lookX += dx;
      lookY += dy;
    } else if (pointers.size === 2 && pair) {
      // The strongest component of the gesture wins: pinch flies, drag slides or rises.
      const now = twoFinger();
      const d = { spread: now.spread - pair.spread, cx: now.cx - pair.cx, cy: now.cy - pair.cy };
      const big = Math.max(Math.abs(d.spread), Math.abs(d.cx), Math.abs(d.cy));
      if (big === Math.abs(d.spread)) dolly += d.spread * 0.08;
      else if (big === Math.abs(d.cx)) slide -= d.cx * 0.05;
      else lift += d.cy * 0.05;
      pair = now;
    }
    onChange();
  };
  const pointerup = (e) => {
    pointers.delete(e.pointerId);
    pair = pointers.size === 2 ? twoFinger() : null;
  };
  const wheel = (e) => {
    e.preventDefault();
    dolly += clamp(-e.deltaY * 0.02, -6, 6);
    onChange();
  };

  el.addEventListener('keydown', keydown);
  el.addEventListener('keyup', keyup);
  el.addEventListener('blur', blur);
  el.addEventListener('pointerdown', pointerdown);
  el.addEventListener('pointermove', pointermove);
  el.addEventListener('pointerup', pointerup);
  el.addEventListener('pointercancel', pointerup);
  el.addEventListener('wheel', wheel, { passive: false });

  return {
    // True while a movement key is held, so the caller keeps animating.
    active: () => held.size > 0,
    // Collects the input since the last call.
    take() {
      const input = emptyInput();
      for (const code of held) {
        const [axis, dir] = KEYS[code];
        input[axis] += dir;
      }
      input.fast = fast;
      input.lookX = lookX;
      input.lookY = lookY;
      input.dolly = dolly;
      input.slide = slide;
      input.lift = lift;
      lookX = lookY = dolly = slide = lift = 0;
      return input;
    },
    dispose() {
      el.removeEventListener('keydown', keydown);
      el.removeEventListener('keyup', keyup);
      el.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pointerdown);
      el.removeEventListener('pointermove', pointermove);
      el.removeEventListener('pointerup', pointerup);
      el.removeEventListener('pointercancel', pointerup);
      el.removeEventListener('wheel', wheel);
    },
  };
}
