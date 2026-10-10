// The hidden ball drop rig for group 4: hidden before release, lands in the front of the
// third lane, stays in the lane, and the tether keeps the exit clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/layout.js';
import { createPhysics } from '../src/physics.js';
import { reachableFrom } from '../src/barriers.js';
import rig, { at, TETHER_ANCHOR, TETHER_LENGTH, OPENING_WIDTH } from '../src/scenes/ball-drop-rig.js';
import free from '../src/scenes/ball-drop-free.js';

const R = 3.25;
const lane = layout.groups.find((g) => g.n === 4);
const exitGap = layout.openings.find((o) => o.id === 'g4-g5');

function inPolygon(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function crossesWall(p, q) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return layout.walls.find((w) => {
    if (Math.max(p.height, q.height) > w.height + R) return false;
    return d(w.a, w.b, p) * d(w.a, w.b, q) < 0 && d(p, q, w.a) * d(p, q, w.b) < 0;
  });
}

// Run a release and summarize what the ball did.
function drop(scene, over = {}) {
  const physics = createPhysics(layout, { ...scene, props: scene.props.map((p) => ({ ...p, ...over })) });
  physics.release();
  let prev = physics.poses()[0];
  const s = { landing: null, crossed: [], maxRope: 0, path: [prev] };
  for (let t = 1 / 60; t < 30 && physics.isActive(); t += 1 / 60) {
    physics.step(1 / 60);
    const p = physics.poses()[0];
    const w = crossesWall(prev, p);
    if (w) s.crossed.push(w.id);
    if (!s.landing && p.height < R + 0.15) s.landing = { t, x: p.x, y: p.y };
    const a = TETHER_ANCHOR;
    s.maxRope = Math.max(s.maxRope, Math.hypot(p.x - a.x, p.height - a.height, p.y - a.y));
    s.path.push(p);
    prev = p;
  }
  s.end = physics.poses()[0];
  return s;
}

// Where the ball's center sits relative to the wall frame of the rig: `along` the wall from the
// drop point, `out` into the lane.
const origin = at(0, 0, 0);
const ua = at(1, 0, 0);
const na = at(0, 1, 0);
const local = (p) => ({
  along: (p.x - origin.x) * (ua.x - origin.x) + (p.y - origin.y) * (ua.y - origin.y),
  out: (p.x - origin.x) * (na.x - origin.x) + (p.y - origin.y) * (na.y - origin.y),
});
// Worst sideways clearance between the ball and the opening's jambs while it passes the wall.
function jambClearance(path) {
  let worst = Infinity;
  for (const p of path) {
    const l = local(p);
    if (l.out > -R && l.out < R && p.height > 8) worst = Math.min(worst, OPENING_WIDTH / 2 - R - Math.abs(l.along));
  }
  return worst;
}

// Every place a visitor can stand along the route, at kid, adult, and tall-adult eye heights.
function eyePoints() {
  const reach = reachableFrom(layout.barriers, layout.room, { x: 5, y: 51 }, { doors: [layout.doors.entrance, layout.doors.exit] });
  const pts = [];
  const route = layout.route;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let s = 0; s <= len; s += 1) {
      for (const off of [-3, -1.5, 0, 1.5, 3]) {
        const p = { x: a.x + ((b.x - a.x) * s) / len + nx * off, y: a.y + ((b.y - a.y) * s) / len + ny * off };
        if (p.x < 0.5 || p.x > layout.room.width - 0.5 || !reach(p)) continue;
        for (const height of [3.5, 5.5, 6.5]) pts.push({ ...p, height });
      }
    }
  }
  return pts;
}

// The ball's center plus points on its surface all round.
function ballPoints(c) {
  const k = R * 0.98;
  return [
    { ...c },
    { ...c, height: c.height + k },
    { ...c, x: c.x + k }, { ...c, x: c.x - k },
    { ...c, y: c.y + k }, { ...c, y: c.y - k },
  ];
}

test('the held ball is hidden from everywhere visitors walk, at kid and adult eye height', () => {
  const physics = createPhysics(layout, rig);
  const eyes = eyePoints();
  assert.ok(eyes.length > 1000, `${eyes.length} eye points`);
  const ball = physics.poses()[0];
  const seen = [];
  for (const eye of eyes) for (const p of ballPoints(ball)) if (physics.canSee(eye, p)) seen.push(eye);
  assert.deepEqual(seen.slice(0, 3), [], `visible from ${seen.length} eye points`);
});

test('the same check sees the ball once it has dropped into the lane', () => {
  const physics = createPhysics(layout, rig);
  physics.release();
  for (let i = 0; i < 60 * 6; i++) physics.step(1 / 60);
  const ball = physics.poses()[0];
  assert.ok(eyePoints().some((eye) => physics.canSee(eye, ball)), 'visible after the drop');
});

test('the ball rolls through the curtain, over the wall, and lands in the front of the lane', () => {
  const s = drop(rig);
  assert.deepEqual(s.crossed, []);
  assert.ok(s.landing, 'it lands');
  assert.ok(s.landing.t < 3.5, `lands ${s.landing.t.toFixed(2)} s after release`);
  assert.ok(inPolygon(lane.points, s.landing), `lands in group 4 at (${s.landing.x.toFixed(1)}, ${s.landing.y.toFixed(1)})`);
  assert.ok(s.landing.y < 30, 'lands in the front part of the lane, near the entrance');
});

test('the tether stops the ball before the exit into group 5, inside group 4', () => {
  const s = drop(rig);
  assert.ok(s.maxRope <= TETHER_LENGTH + 0.05, `rope stretched to ${s.maxRope.toFixed(2)} ft`);
  assert.ok(s.path.slice(60 * 4).every((p) => inPolygon(lane.points, p)), 'stays in group 4 after landing');
  assert.ok(s.end.y + R < exitGap.y0, `stops at y ${s.end.y.toFixed(1)}, clear of the exit gap at y ${exitGap.y0}`);
});

test('without the tether the ball still stays in group 4 but rolls down to the stage end', () => {
  const s = drop(free);
  assert.deepEqual(s.crossed, []);
  assert.ok(s.path.slice(60 * 4).every((p) => inPolygon(lane.points, p)), 'stays in group 4');
  assert.ok(s.end.y > exitGap.y0, `runs on to y ${s.end.y.toFixed(1)}, into the approach to the exit`);
});

test('the ball passes the opening without touching the jambs', () => {
  const s = drop(rig);
  assert.ok(jambClearance(s.path) > 0.25, `clearance ${jambClearance(s.path).toFixed(2)} ft`);
});

test('the tether can never reach the exit gap, whatever the ball does', () => {
  const a = TETHER_ANCHOR;
  const reach = Math.sqrt(TETHER_LENGTH ** 2 - (a.height - R) ** 2); // rope taut, ball on the floor
  assert.ok(a.y + reach + R < exitGap.y0 - 1, `furthest ball edge y ${(a.y + reach + R).toFixed(1)}, exit gap starts at ${exitGap.y0}`);
});

test('the drop works for a light or heavy ball, more or less bouncy, held a foot off center', () => {
  const along = at(1, 0, 0);
  const shift = (d) => ({ ...rig.props[0].start, x: rig.props[0].start.x + (along.x - origin.x) * d, y: rig.props[0].start.y + (along.y - origin.y) * d });
  for (const over of [{ mass: 6 }, { mass: 18 }, { bounce: 0.75 }, { start: shift(1) }, { start: shift(-1) }]) {
    const s = drop(rig, over);
    const label = JSON.stringify(over);
    assert.deepEqual(s.crossed, [], label);
    assert.ok(s.landing && inPolygon(lane.points, s.landing) && s.landing.y < 30, `${label} lands in the front of the lane`);
    assert.ok(s.end.y + R < exitGap.y0, `${label} stops clear of the exit`);
    assert.ok(jambClearance(s.path) > 0, `${label} clears the jambs (${jambClearance(s.path).toFixed(2)} ft)`);
  }
});
