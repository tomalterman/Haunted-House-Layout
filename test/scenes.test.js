import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/layout.js';
import { SCENES, DEFAULT_SCENE_ID, sceneById } from '../src/scenes/index.js';
import { validateScene } from '../src/scenes/validate.js';
import { createPhysics } from '../src/physics.js';

const good = () => ({
  id: 'good',
  name: 'Good',
  lights: [{ type: 'point', color: '#ffffff', intensity: 50, position: { x: 40, height: 7, y: 30 } }],
  props: [
    {
      id: 'crate',
      label: 'Crate',
      shape: 'box',
      size: { width: 3, height: 3, depth: 3 },
      mass: 10,
      bounce: 0.2,
      friction: 0.6,
      drag: 1.05,
      look: { color: '#a07a4a' },
      start: { x: 40, height: 1.5, y: 30 },
    },
  ],
});

test('every registered scene is valid and ids are unique', () => {
  for (const s of SCENES) assert.doesNotThrow(() => validateScene(s, layout), s.id);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length);
  assert.ok(sceneById(DEFAULT_SCENE_ID));
});

test('the default scene drops a 6.5 ft inflatable ball into the group 4 lane', () => {
  const scene = sceneById(DEFAULT_SCENE_ID);
  const ball = scene.props.find((p) => p.shape === 'sphere' && p.size.diameter === 6.5);
  assert.ok(ball, 'has a 6.5 ft ball');
  const lane = layout.groups.find((g) => g.n === 4);
  const xs = lane.points.map((p) => p.x);
  assert.ok(ball.start.x > Math.min(...xs) && ball.start.x < Math.max(...xs), 'starts over the group 4 lane');
  assert.ok(ball.start.height > layout.wallHeight, 'starts above the walls');
  assert.ok(ball.dropDelay > 0, 'drops in after a moment');
  assert.ok(scene.props.length >= 3, 'has a couple of other props');
  assert.ok(scene.lights.some((l) => l.color.toLowerCase() !== '#ffffff'), 'has a colored light');
});

test('every scene settles in the physics world', () => {
  for (const s of SCENES) {
    const physics = createPhysics(layout, s);
    for (let i = 0; i < 60 * 30 && physics.isActive(); i++) physics.step(1 / 60);
    assert.equal(physics.isActive(), false, `${s.id} still moving after 30 s`);
  }
});

test('the empty scene has no props or lights', () => {
  const empty = sceneById('empty');
  assert.deepEqual([empty.props.length, empty.lights.length], [0, 0]);
});

test('a well-formed scene passes', () => {
  assert.doesNotThrow(() => validateScene(good(), layout));
});

test('bad props are rejected with a message naming the prop', () => {
  const cases = [
    [(s) => (s.props[0].shape = 'cone'), /crate.*shape/],
    [(s) => (s.props[0].size.width = -1), /crate.*size/],
    [(s) => (s.props[0].mass = 0), /crate.*mass/],
    [(s) => (s.props[0].bounce = 1.5), /crate.*bounce/],
    [(s) => (s.props[0].start = { x: 200, height: 1, y: 30 }), /crate.*start/],
    [(s) => (s.props[0].start.height = 60), /crate.*start/],
    [(s) => (s.props[0].dropDelay = -1), /crate.*dropDelay/],
    [(s) => s.props.push({ ...s.props[0] }), /crate.*duplicate/],
  ];
  for (const [mutate, message] of cases) {
    const s = good();
    mutate(s);
    assert.throws(() => validateScene(s, layout), message);
  }
});

test('bad lights are rejected', () => {
  const cases = [
    [(s) => (s.lights[0].type = 'laser'), /light 1.*type/],
    [(s) => (s.lights[0].intensity = -5), /light 1.*intensity/],
    [(s) => (s.lights[0] = { type: 'spot', color: '#f00', intensity: 100, position: { x: 1, height: 9, y: 1 } }), /light 1.*target/],
  ];
  for (const [mutate, message] of cases) {
    const s = good();
    mutate(s);
    assert.throws(() => validateScene(s, layout), message);
  }
});
