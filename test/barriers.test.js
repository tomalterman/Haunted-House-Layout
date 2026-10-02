import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEASUREMENTS, buildLayout, layout } from '../src/layout.js';
import { reachableFrom } from '../src/barriers.js';

const ENTRANCE = { x: 0.5, y: 51 };
const EXIT = { x: 84.6, y: 8 };
const OFF_ROUTE = {
  'above the diagonal': { x: 5, y: 20 },
  'right of the corridor wall': { x: 75, y: 40 },
  'on the stage': { x: 45, y: 58 },
  'above the right tents': { x: 80, y: 1 },
  'beside the entrance tents': { x: 5, y: 40 },
};

test('the entrance reaches the exit', () => {
  const reach = reachableFrom(layout.barriers, layout.room, ENTRANCE);
  assert.ok(reach(EXIT));
});

test('no off-route area is reachable', () => {
  const reach = reachableFrom(layout.barriers, layout.room, ENTRANCE);
  for (const [name, p] of Object.entries(OFF_ROUTE)) {
    assert.equal(reach(p), false, `${name} should be sealed off`);
  }
});

test('every route waypoint inside the room is reachable', () => {
  const reach = reachableFrom(layout.barriers, layout.room, ENTRANCE);
  for (const p of layout.route) {
    if (p.x <= 0 || p.x >= 85) continue;
    assert.ok(reach(p), `waypoint ${p.x},${p.y}`);
  }
});

test('removing the corridor wall opens a leak the check detects', () => {
  const leaky = layout.barriers.filter((s) => s.id !== 'corridor');
  const reach = reachableFrom(leaky, layout.room, ENTRANCE);
  assert.ok(reach(OFF_ROUTE['right of the corridor wall']));
});

test('removing a closed tent side opens a leak the check detects', () => {
  const leaky = layout.barriers.filter((s) => s.id !== 'tent-L1-top');
  const reach = reachableFrom(leaky, layout.room, ENTRANCE);
  assert.ok(reach(OFF_ROUTE['beside the entrance tents']));
});

test('corrected measurements stay leak-free', () => {
  for (const m of [{ stageDepth: 3 }, { diagonalDropOnR1: 8 }, { rightTopGap: 3 }]) {
    const l = buildLayout({ ...MEASUREMENTS, ...m });
    const reach = reachableFrom(l.barriers, l.room, ENTRANCE);
    assert.ok(reach({ x: 84.6, y: l.doors.exit.y0 + 2 }), JSON.stringify(m));
    assert.equal(reach({ x: 5, y: 20 }), false, JSON.stringify(m));
    assert.equal(reach({ x: 75, y: 40 }), false, JSON.stringify(m));
  }
});
