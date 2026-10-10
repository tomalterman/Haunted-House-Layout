import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/layout.js';
import { createPhysics, DRAPE_PILE } from '../src/physics.js';

const ball = (over = {}) => ({
  id: 'ball',
  label: 'Inflatable ball',
  shape: 'sphere',
  size: { diameter: 6.5 },
  mass: 6,
  bounce: 0.6,
  friction: 0.5,
  drag: 0.47,
  rollingResistance: 0.1,
  look: { color: '#d33' },
  start: { x: 49, height: 20, y: 37 },
  ...over,
});
const sceneOf = (...props) => ({ id: 't', name: 'Test', lights: [], props });

// Step in 60 Hz frames, recording every prop's pose after each frame.
function run(physics, seconds, onFrame = () => {}) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    physics.step(1 / 60);
    onFrame(physics.poses());
  }
}

const pose = (poses, id) => poses.find((p) => p.id === id);

// Does the move from p to q pass through wall segment w (plan view) while below its top?
function crosses(w, p, q) {
  if (Math.max(p.height, q.height) > w.height) return false;
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const P = { x: p.x, y: p.y };
  const Q = { x: q.x, y: q.y };
  return d(w.a, w.b, P) * d(w.a, w.b, Q) < 0 && d(P, Q, w.a) * d(P, Q, w.b) < 0;
}

test('a 6.5 ft ball dropped into the group 4 lane comes to rest on the floor without crossing a wall', () => {
  const physics = createPhysics(layout, sceneOf(ball()));
  let prev = pose(physics.poses(), 'ball');
  const crossed = [];
  run(physics, 20, (poses) => {
    const p = pose(poses, 'ball');
    for (const w of layout.walls) if (crosses(w, prev, p)) crossed.push(w.id);
    prev = p;
  });
  const end = pose(physics.poses(), 'ball');
  assert.deepEqual(crossed, []);
  assert.ok(Math.abs(end.height - 3.25) < 0.05, `rest height ${end.height}`);
});

test('the ball bounces lower each time', () => {
  const physics = createPhysics(layout, sceneOf(ball()));
  const peaks = [];
  let last = 20;
  let rising = false;
  run(physics, 6, (poses) => {
    const h = pose(poses, 'ball').height;
    if (h > last) rising = true;
    else if (rising && h < last) {
      peaks.push(last);
      rising = false;
    }
    last = h;
  });
  assert.ok(peaks.length >= 2, `peaks ${peaks}`);
  assert.ok(peaks[0] < 20);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], `peaks ${peaks}`);
});

test('a ball thrown hard at a partition stays on its own side', () => {
  // P3 runs down x = 55. Start in lane 4 and throw level toward it.
  const physics = createPhysics(layout, sceneOf(ball({ start: { x: 49, height: 3.25, y: 35 }, velocity: { x: 60, height: 0, y: 0 } })));
  run(physics, 4);
  assert.ok(pose(physics.poses(), 'ball').x < 55);
});

test('a ball thrown hard at a closed tent side stays outside the tent', () => {
  // R3's left side (x = 65) is closed below y = 22. Throw from the last lane toward it.
  const physics = createPhysics(
    layout,
    sceneOf(ball({ size: { diameter: 3 }, start: { x: 60, height: 1.5, y: 23 }, velocity: { x: 50, height: 0, y: 0 } })),
  );
  run(physics, 4);
  assert.ok(pose(physics.poses(), 'ball').x < 65);
});

test('a prop with a drop delay holds still until its delay, then falls', () => {
  const physics = createPhysics(layout, sceneOf(ball({ dropDelay: 1 })));
  run(physics, 0.9);
  assert.equal(pose(physics.poses(), 'ball').height, 20);
  run(physics, 0.4);
  assert.ok(pose(physics.poses(), 'ball').height < 20);
});

test('a delayed prop still falls after every other body has gone to sleep', () => {
  const resting = ball({ id: 'resting', size: { diameter: 2 }, start: { x: 49, height: 1, y: 50 } });
  const physics = createPhysics(layout, sceneOf(resting, ball({ dropDelay: 6 })));
  run(physics, 5);
  assert.equal(pose(physics.poses(), 'resting').sleeping, true);
  assert.equal(physics.isActive(), true, 'a pending drop keeps the world active');
  run(physics, 2);
  assert.ok(pose(physics.poses(), 'ball').height < 20);
});

test('the inflatable ball keeps rolling for a while on the floor', () => {
  const physics = createPhysics(layout, sceneOf(ball({ start: { x: 49, height: 3.25, y: 26 }, velocity: { x: 0, height: 0, y: 10 } })));
  run(physics, 8);
  assert.ok(pose(physics.poses(), 'ball').y - 26 >= 8);
});

test('reset puts every prop back at its start and restarts the drop clock', () => {
  const physics = createPhysics(layout, sceneOf(ball({ dropDelay: 0.5 })));
  run(physics, 3);
  physics.reset();
  const p = pose(physics.poses(), 'ball');
  assert.deepEqual([p.x, p.height, p.y], [49, 20, 37]);
  assert.equal(physics.time, 0);
  assert.equal(physics.isActive(), true);
  run(physics, 0.3);
  assert.equal(pose(physics.poses(), 'ball').height, 20);
});

test('everything is asleep after 20 s of simulated time', () => {
  const box = ball({ id: 'box', shape: 'box', size: { width: 4, height: 4, depth: 4 }, mass: 10, drag: 1.05, start: { x: 49, height: 2, y: 45 } });
  const physics = createPhysics(layout, sceneOf(ball(), box));
  run(physics, 20);
  assert.equal(physics.isActive(), false);
  assert.ok(physics.poses().every((p) => p.sleeping));
});

test('an empty scene has no props and is never active', () => {
  const physics = createPhysics(layout, sceneOf());
  assert.deepEqual(physics.poses(), []);
  assert.equal(physics.isActive(), false);
});

test('replay repeats the first run exactly', async () => {
  const { sceneById, DEFAULT_SCENE_ID } = await import('../src/scenes/index.js');
  const trace = (physics) => {
    const out = [];
    run(physics, 12, (poses) => out.push(poses.map((p) => [p.x, p.height, p.y])));
    return out;
  };
  // A timed scene, and the default rig scene released by hand (its stop bar and drape come back
  // on reset).
  const timed = createPhysics(layout, sceneById('schoolyard-demo'));
  const first = trace(timed);
  assert.ok(first.at(-1)[0][1] < 10, 'the timed ball actually dropped');
  timed.reset();
  assert.deepEqual(trace(timed), first);
  const rig = createPhysics(layout, sceneById(DEFAULT_SCENE_ID));
  rig.release();
  const rigFirst = trace(rig);
  const restHeights = (physics) => physics.fixtures().map((f) => f.height);
  const before = createPhysics(layout, sceneById(DEFAULT_SCENE_ID));
  rig.reset();
  assert.deepEqual(rig.fixtures().map((f) => f.angle), before.fixtures().map((f) => f.angle));
  assert.deepEqual(restHeights(rig), restHeights(before));
  rig.release();
  assert.deepEqual(trace(rig), rigFirst);
});

// A flat test bed in the open part of the gym, north of the diagonal (off-route area).
const shelf = (over = {}) => ({ id: 'shelf', label: 'Shelf', size: { width: 8, height: 0.25, depth: 8 }, at: { x: 40, height: 5, y: 10 }, look: { color: '#888' }, ...over });

test('a ball rests on a solid fixture', () => {
  const physics = createPhysics(layout, { ...sceneOf(ball({ size: { diameter: 2 }, start: { x: 40, height: 7, y: 10 } })), fixtures: [shelf()] });
  run(physics, 4);
  assert.ok(Math.abs(pose(physics.poses(), 'ball').height - (5.125 + 1)) < 0.05);
});

test('a drape blocks the view, lets a ball through, and falls to the floor on release', () => {
  const drape = shelf({ id: 'drape', size: { width: 8, height: 8, depth: 0.05 }, at: { x: 40, height: 9, y: 10 }, dropsOnRelease: true });
  const physics = createPhysics(layout, { ...sceneOf(ball({ size: { diameter: 2 }, start: { x: 40, height: 9, y: 7 }, velocity: { x: 0, height: 0, y: 10 }, dropDelay: 'manual' })), fixtures: [drape] });
  assert.equal(physics.canSee({ x: 40, height: 9, y: 5 }, { x: 40, height: 9, y: 15 }), false, 'hanging drape blocks the view');
  physics.release();
  let drapeHeight = 9;
  let ballY = 0;
  run(physics, 1, () => {
    drapeHeight = physics.fixtures()[0].height;
    ballY = Math.max(ballY, pose(physics.poses(), 'ball').y);
  });
  assert.ok(ballY > 11, 'the ball passed through the drape');
  assert.ok(Math.abs(drapeHeight + 4 - DRAPE_PILE) < 1e-9, 'the drape lies heaped on the floor');
  assert.equal(physics.canSee({ x: 40, height: 9, y: 5 }, { x: 40, height: 9, y: 15 }), true, 'nothing blocks the view once it has dropped');
  physics.reset();
  assert.equal(physics.fixtures()[0].height, 9, 'reset re-hangs the drape');
});

test('a sloped fixture rolls a ball downhill toward +depth', () => {
  const ramp = shelf({ id: 'ramp', size: { width: 8, height: 0.25, depth: 20 }, slope: 10, yaw: 0 });
  const physics = createPhysics(layout, { ...sceneOf(ball({ size: { diameter: 2 }, start: { x: 40, height: 7.5, y: 10 } })), fixtures: [ramp] });
  run(physics, 1.5);
  assert.ok(pose(physics.poses(), 'ball').y > 10.5, 'moved toward +y (depth axis of a yaw-0 box)');
});

// A stop bar on the 10 deg test ramp: hinged at the deck, pinned upright until the release.
const testRamp = shelf({ id: 'ramp', size: { width: 8, height: 0.25, depth: 20 }, slope: 10, yaw: 0 });
const stopBar = (hinge) => shelf({ id: 'bar', size: { width: 6, height: 0.3, depth: 0.15 }, at: { x: 40, height: 5.27, y: 7 }, slope: 10, hinge: { edge: 'bottom', mass: 3, opens: 90, ...hinge } });

test('a pinned stop bar holds a ball until release, then the ball knocks it flat', () => {
  const held = ball({ size: { diameter: 2 }, start: { x: 40, height: 6.5, y: 6 }, dropDelay: 'manual' });
  const physics = createPhysics(layout, { ...sceneOf(held), fixtures: [testRamp, stopBar({ latched: true })] });
  assert.equal(physics.awaitingRelease(), true);
  assert.equal(physics.isActive(), false, 'nothing to simulate while waiting');
  physics.release();
  run(physics, 3);
  assert.ok(Math.abs(physics.fixtures()[1].angle - 90) < 0.5, `bar lies flat (${physics.fixtures()[1].angle.toFixed(1)} deg)`);
  assert.ok(pose(physics.poses(), 'ball').y > 12, 'the ball rolled on down the ramp');
  physics.reset();
  assert.equal(physics.fixtures()[1].angle, 0, 'reset stands the bar back up');
  assert.equal(physics.awaitingRelease(), true);
});

test('a hinged panel only swings forward, and stops at its limit', () => {
  // Unpinned, it rests against its stop; a ball rolling into its back face cannot open it.
  const backwards = createPhysics(layout, { ...sceneOf(ball({ size: { diameter: 2 }, start: { x: 40, height: 1, y: 12 }, velocity: { x: 0, height: 0, y: -12 } })), fixtures: [shelf({ id: 'flap', size: { width: 4, height: 4, depth: 0.1 }, at: { x: 40, height: 2.1, y: 9 }, hinge: { edge: 'top', mass: 2, opens: 60 } })] });
  run(backwards, 2);
  assert.equal(backwards.fixtures()[0].angle, 0);
  // From the front it swings up toward +depth, no further than 60 degrees.
  const forwards = createPhysics(layout, { ...sceneOf(ball({ size: { diameter: 2 }, start: { x: 40, height: 1, y: 6 }, velocity: { x: 0, height: 0, y: 30 } })), fixtures: [shelf({ id: 'flap', size: { width: 4, height: 4, depth: 0.1 }, at: { x: 40, height: 2.1, y: 9 }, hinge: { edge: 'top', mass: 2, opens: 60 } })] });
  let widest = 0;
  run(forwards, 2, () => (widest = Math.max(widest, forwards.fixtures()[0].angle)));
  assert.ok(widest > 30 && widest <= 60.01, `opened to ${widest.toFixed(1)} deg`);
});

test('sight lines are blocked by walls and fixtures, not by open air', () => {
  const physics = createPhysics(layout, { ...sceneOf(), fixtures: [shelf({ id: 'panel', size: { width: 8, height: 8, depth: 0.1 }, at: { x: 40, height: 4, y: 10 } })] });
  assert.equal(physics.canSee({ x: 49, height: 5, y: 30 }, { x: 49, height: 5, y: 40 }), true, 'open lane');
  assert.equal(physics.canSee({ x: 49, height: 5, y: 30 }, { x: 37, height: 5, y: 30 }), false, 'P2 is in the way');
  assert.equal(physics.canSee({ x: 40, height: 4, y: 5 }, { x: 40, height: 4, y: 15 }), false, 'the panel blocks the view');
});
