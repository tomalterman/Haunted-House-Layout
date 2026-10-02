import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEASUREMENTS, buildLayout, layout } from '../src/layout.js';

const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

function diagonalYAt(l, x) {
  const { a, b } = l.diagonal;
  return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
}

test('room, pony wall, and tents use the measured sizes', () => {
  assert.equal(layout.room.width, 85);
  assert.equal(layout.room.depth, 60);
  assert.equal(layout.pony.length, 50);
  assert.equal(layout.tents.length, 6);
  for (const t of layout.tents) {
    assert.equal(t.size, 10);
    assert.ok(t.x >= 0 && t.x + t.size <= 85, `${t.id} inside width`);
    assert.ok(t.y >= 0 && t.y + t.size <= 60, `${t.id} inside depth`);
  }
});

test('tent blocks sit where the sketch puts them', () => {
  const byId = Object.fromEntries(layout.tents.map((t) => [t.id, t]));
  assert.deepEqual([byId.L1.x, byId.L1.y], [0, 46]);
  assert.deepEqual([byId.L2.x, byId.L2.y], [10, 46]);
  assert.deepEqual([byId.L3.x, byId.L3.y], [10, 36]);
  assert.deepEqual([byId.R1.x, byId.R1.y], [65, 4]);
  assert.deepEqual([byId.R2.x, byId.R2.y], [75, 4]);
  assert.deepEqual([byId.R3.x, byId.R3.y], [65, 14]);
});

test('diagonal follows the drawing at about 52.5 ft', () => {
  assert.deepEqual(layout.diagonal.a, { x: 20, y: 36 });
  assert.deepEqual(layout.diagonal.b, { x: 65, y: 9 });
  assert.ok(layout.diagonal.length > 52 && layout.diagonal.length < 53);
  assert.equal(layout.diagonal.panels, 7);
});

test('corridor wall is 32 ft at the starting values and meets the pony wall', () => {
  assert.equal(layout.corridor.length, 32);
  assert.equal(layout.corridor.panels, 4);
  assert.equal(layout.corridor.b.y, layout.pony.y);
});

test('partitions attach to the diagonal or the pony wall', () => {
  const [p1, p2, p3] = layout.partitions;
  assert.ok(near(p1.a.y, diagonalYAt(layout, p1.a.x)), 'P1 top on diagonal');
  assert.ok(near(p3.a.y, diagonalYAt(layout, p3.a.x)), 'P3 top on diagonal');
  assert.equal(p2.a.y, layout.pony.y, 'P2 base on pony wall');
  assert.equal(p1.b.y, 51.25);
  assert.equal(p2.b.y, 29.85);
  assert.equal(p3.b.y, 47.75);
});

test('serpentine turn gaps are half their original width', () => {
  const [p1, p2, p3] = layout.partitions;
  assert.equal(layout.pony.y - p1.b.y, 9.5 / 2);
  assert.ok(Math.abs(p2.b.y - diagonalYAt(layout, p2.a.x) - 15.3 / 2) < 0.01);
  assert.equal(layout.pony.y - p3.b.y, 16.5 / 2);
});

test('a stage depth correction keeps the corridor wall attached', () => {
  const l = buildLayout({ ...MEASUREMENTS, stageDepth: 3 });
  assert.equal(l.pony.y, 57);
  assert.equal(l.corridor.b.y, 57);
  assert.equal(l.corridor.length, 33);
  assert.equal(l.partitions[1].a.y, 57);
});

test('a diagonal correction keeps partition tops on the diagonal', () => {
  const l = buildLayout({ ...MEASUREMENTS, diagonalDropOnR1: 8 });
  assert.deepEqual(l.diagonal.b, { x: 65, y: 12 });
  for (const p of [l.partitions[0], l.partitions[2]]) {
    assert.ok(near(p.a.y, diagonalYAt(l, p.a.x)));
  }
});

test('the route runs from the entrance door to the exit door', () => {
  const first = layout.route[0];
  const last = layout.route[layout.route.length - 1];
  assert.ok(first.x <= 0 && first.y >= 48 && first.y <= 54);
  assert.ok(last.x >= 85 && last.y >= 6 && last.y <= 10);
  assert.ok(layout.route.length >= 10);
});

test('every wall has a height, with a short pony wall', () => {
  for (const w of layout.walls) assert.ok(w.height > 0, w.id);
  assert.equal(layout.walls.find((w) => w.id === 'pony').height, 4);
  assert.equal(layout.walls.find((w) => w.id === 'diagonal').height, 8);
});

test('every wall carries its length in feet', () => {
  const byId = Object.fromEntries(layout.walls.map((w) => [w.id, w.length]));
  assert.equal(byId['outer-top'], 85);
  assert.equal(byId['outer-left-upper'], 48);
  assert.equal(byId['outer-left-lower'], 6);
  assert.equal(byId['outer-right-upper'], 6);
  assert.equal(byId['outer-right-lower'], 50);
  assert.equal(byId.pony, 50);
  assert.equal(byId.corridor, 32);
  assert.equal(byId.diagonal, layout.diagonal.length);
  assert.equal(byId.P1, 21.25);
  assert.equal(byId.P2, 26.15);
  assert.equal(byId.P3, 32.75);
});
