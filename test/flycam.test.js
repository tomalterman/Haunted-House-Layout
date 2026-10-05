import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepFly, emptyInput, FLY_DEFAULTS } from '../src/flycam.js';

const bounds = { min: { x: -50, y: 0.5, z: -40 }, max: { x: 50, y: 60, z: 40 } };
const start = { x: 0, y: 5, z: 0, yaw: 0, pitch: 0 };
const input = (over) => ({ ...emptyInput(), ...over });
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('forward input for one second moves base speed along the look direction', () => {
  const { state, moved } = stepFly(start, input({ forward: 1 }), 1, { bounds });
  assert.equal(moved, true);
  close(state.z, -FLY_DEFAULTS.speed, 'z'); // yaw 0 looks toward -z
  close(state.x, 0, 'x');
  close(state.y, 5, 'height');
});

test('forward follows yaw and pitch', () => {
  const looking = { ...start, yaw: Math.PI / 2, pitch: 0.3 };
  const { state } = stepFly(looking, input({ forward: 1 }), 1, { bounds });
  const s = FLY_DEFAULTS.speed;
  close(state.x, -s * Math.cos(0.3), 'x');
  close(state.y, 5 + s * Math.sin(0.3), 'height');
  close(state.z, 0, 'z');
});

test('up input raises height only; strafe moves sideways only', () => {
  const up = stepFly(start, input({ up: 1 }), 0.5, { bounds }).state;
  close(up.y, 5 + FLY_DEFAULTS.speed * 0.5, 'height');
  close(up.x, 0, 'x');
  close(up.z, 0, 'z');
  const right = stepFly(start, input({ right: 1 }), 1, { bounds }).state;
  close(right.x, FLY_DEFAULTS.speed, 'x');
  close(right.z, 0, 'z');
});

test('fast mode multiplies speed', () => {
  const { state } = stepFly(start, input({ forward: 1, fast: true }), 0.5, { bounds });
  close(state.z, -FLY_DEFAULTS.speed * FLY_DEFAULTS.fastMultiplier * 0.5, 'z');
});

test('dragging turns the view and dolly moves along it', () => {
  const turned = stepFly(start, input({ lookX: 100, lookY: 50 }), 0.016, { bounds }).state;
  assert.ok(turned.yaw < 0, 'drag right turns right');
  assert.ok(turned.pitch < 0, 'drag down looks down');
  const dollied = stepFly(start, input({ dolly: 3 }), 0.016, { bounds }).state;
  close(dollied.z, -3, 'dolly');
});

test('arrow turning changes yaw at the turn rate', () => {
  const { state } = stepFly(start, input({ turn: 1 }), 1, { bounds });
  close(state.yaw, -FLY_DEFAULTS.turnRate, 'yaw');
});

test('pitch is clamped short of straight up or down', () => {
  const up = stepFly(start, input({ lookY: -1e6 }), 0.016, { bounds }).state;
  const down = stepFly(start, input({ lookY: 1e6 }), 0.016, { bounds }).state;
  assert.ok(up.pitch <= FLY_DEFAULTS.maxPitch && up.pitch > 1.3);
  assert.ok(down.pitch >= -FLY_DEFAULTS.maxPitch && down.pitch < -1.3);
});

test('position stays inside the box and above the floor', () => {
  const low = stepFly(start, input({ up: -1 }), 10, { bounds }).state;
  assert.equal(low.y, bounds.min.y);
  const far = stepFly(start, input({ forward: 1, fast: true }), 100, { bounds }).state;
  assert.equal(far.z, bounds.min.z);
});

test('no input means no movement', () => {
  const { state, moved } = stepFly(start, emptyInput(), 0.5, { bounds });
  assert.equal(moved, false);
  assert.deepEqual(state, start);
});

test('two-finger slide and lift move by their distance, independent of speed and frame time', () => {
  const { state } = stepFly(start, input({ slide: 2, lift: 1.5 }), 0, { bounds, speed: 99 });
  close(state.x, 2, 'x');
  close(state.y, 6.5, 'height');
  close(state.z, 0, 'z');
});
