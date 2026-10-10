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

test('the default scene is the hidden ball drop, with nothing but the ball and its rig', () => {
  const scene = sceneById(DEFAULT_SCENE_ID);
  assert.equal(scene.id, 'ball-drop-rig');
  assert.deepEqual(scene.props.map((p) => p.size.diameter), [6.5]);
  assert.equal(scene.props[0].dropDelay, 'manual');
  assert.ok(scene.fixtures.length > 0);
});

test('the schoolyard demo drops a 6.5 ft inflatable ball into the group 4 lane', () => {
  const scene = sceneById('schoolyard-demo');
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
    [(s) => (s.props[0].dropDelay = 'later'), /crate.*dropDelay/],
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

test('bad fixtures are rejected with a message naming the fixture', () => {
  const fixture = () => ({ id: 'ramp', label: 'Ramp', size: { width: 8, height: 0.25, depth: 7 }, at: { x: 40, height: 9, y: 10 }, slope: 12, look: { color: '#a07a4a' } });
  const cases = [
    [(f) => (f.size.depth = 0), /ramp.*size/],
    [(f) => (f.at = { x: 40, height: 9, y: 99 }), /ramp.*at/],
    [(f) => (f.slope = 95), /ramp.*slope/],
    [(f) => delete f.look, /ramp.*look/],
    [(f) => (f.hinge = { edge: 'middle', mass: 2, opens: 90 }), /ramp.*hinge edge/],
    [(f) => (f.hinge = { edge: 'bottom', mass: 0, opens: 90 }), /ramp.*hinge mass/],
    [(f) => (f.hinge = { edge: 'bottom', mass: 2, opens: 200 }), /ramp.*hinge opens/],
    [(f) => (f.hinge = { edge: 'bottom', mass: 2, opens: 90, latched: 'yes' }), /ramp.*hinge latched/],
    [(f) => (f.dropsOnRelease = 'yes'), /ramp.*dropsOnRelease/],
    [(f) => Object.assign(f, { dropsOnRelease: true, hinge: { edge: 'bottom', mass: 2, opens: 90 } }), /ramp.*cannot also be hinged/],
  ];
  assert.doesNotThrow(() => validateScene({ ...good(), fixtures: [fixture()] }, layout));
  for (const [mutate, message] of cases) {
    const f = fixture();
    mutate(f);
    assert.throws(() => validateScene({ ...good(), fixtures: [f] }, layout), message);
  }
  assert.throws(() => validateScene({ ...good(), fixtures: [fixture(), fixture()] }, layout), /ramp.*duplicate/);
});
