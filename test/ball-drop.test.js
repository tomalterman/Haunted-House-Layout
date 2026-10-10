// The hidden ball drop rig for group 4: hidden before release, one pull drops the drape and the
// stop bar, the ball lands in the front of the third lane, and it stays in the lane on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/layout.js';
import { createPhysics, DRAPE_PILE } from '../src/physics.js';
import { reachableFrom } from '../src/barriers.js';
import rig, { at, OPENING_WIDTH } from '../src/scenes/ball-drop-rig.js';

const R = 3.25;
const lane = layout.groups.find((g) => g.n === 4);

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
  const s = { landing: null, crossed: [], path: [prev] };
  for (let t = 1 / 60; t < 120 && physics.isActive(); t += 1 / 60) {
    physics.step(1 / 60);
    const p = physics.poses()[0];
    const w = crossesWall(prev, p);
    if (w) s.crossed.push(w.id);
    if (!s.landing && p.height < R + 0.15) s.landing = { t, x: p.x, y: p.y, index: s.path.length };
    s.path.push(p);
    prev = p;
  }
  s.end = physics.poses()[0];
  s.afterLanding = s.path.slice(s.landing?.index ?? 0);
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

test('one pull drops the drape and frees the stop bar, and the drape is down before the ball arrives', () => {
  const physics = createPhysics(layout, rig);
  const fixture = (id) => physics.fixtures().find((f) => f.id === id);
  const drapeSpec = rig.fixtures.find((f) => f.id === 'kabuki-drape');
  physics.release();
  let drapeDownAt = null;
  let ballAtDrapeAt = null;
  const drapePlane = local(drapeSpec.at).out;
  for (let t = 1 / 60; t < 4; t += 1 / 60) {
    physics.step(1 / 60);
    if (drapeDownAt === null && Math.abs(fixture('kabuki-drape').height + drapeSpec.size.height / 2 - DRAPE_PILE) < 1e-9) drapeDownAt = t;
    if (ballAtDrapeAt === null && local(physics.poses()[0]).out + R > drapePlane) ballAtDrapeAt = t;
  }
  assert.ok(drapeDownAt < 1.1, `drape heaped on the floor ${drapeDownAt?.toFixed(2)} s after the pull`);
  assert.ok(ballAtDrapeAt > drapeDownAt + 0.5, `ball reaches the drape line at ${ballAtDrapeAt?.toFixed(2)} s`);
  assert.ok(Math.abs(fixture('stop-bar').angle - 90) < 0.5, 'the ball has knocked the stop bar flat');
});

test('the ball rolls over the wall and lands in the front of the lane', () => {
  const s = drop(rig);
  assert.deepEqual(s.crossed, []);
  assert.ok(s.landing, 'it lands');
  assert.ok(s.landing.t < 4, `lands ${s.landing.t.toFixed(2)} s after the pull`);
  assert.ok(inPolygon(lane.points, s.landing), `lands in group 4 at (${s.landing.x.toFixed(1)}, ${s.landing.y.toFixed(1)})`);
  assert.ok(s.landing.y < 30, 'lands in the front part of the lane, near the entrance');
});

test('with nothing tied to it, the ball rolls on down the lane and stays in group 4', () => {
  const s = drop(rig);
  assert.ok(s.afterLanding.every((p) => inPolygon(lane.points, p)), 'never leaves group 4 (not back out the entrance, not on into group 5)');
  assert.ok(s.end.y > s.landing.y + 10, `rolls down the lane after the group, to y ${s.end.y.toFixed(1)}`);
  assert.ok(s.end.sleeping, 'comes to rest');
});

test('the ball passes the opening without touching the jambs', () => {
  const s = drop(rig);
  assert.ok(jambClearance(s.path) > 0.25, `clearance ${jambClearance(s.path).toFixed(2)} ft`);
});

test('the drop works for a light or heavy ball, bouncier, on a slicker floor, or held a foot off center', () => {
  const along = at(1, 0, 0);
  const shift = (d) => ({ ...rig.props[0].start, x: rig.props[0].start.x + (along.x - origin.x) * d, y: rig.props[0].start.y + (along.y - origin.y) * d });
  for (const over of [{ mass: 6 }, { mass: 18 }, { bounce: 0.75 }, { rollingResistance: 0.02 }, { start: shift(1) }, { start: shift(-1) }]) {
    const s = drop(rig, over);
    const label = JSON.stringify(over);
    assert.deepEqual(s.crossed, [], label);
    assert.ok(s.landing && inPolygon(lane.points, s.landing) && s.landing.y < 30, `${label} lands in the front of the lane`);
    assert.ok(s.afterLanding.every((p) => inPolygon(lane.points, p)), `${label} stays in group 4`);
    assert.ok(jambClearance(s.path) > 0, `${label} clears the jambs (${jambClearance(s.path).toFixed(2)} ft)`);
  }
});
