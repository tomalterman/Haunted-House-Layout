import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEASUREMENTS, buildLayout, layout } from '../src/layout.js';
import { reachableFrom } from '../src/barriers.js';

// Probes sit just outside each door, so the fill must pass through the real door gaps.
const probes = (l) => ({
  entrance: { x: -0.5, y: (l.doors.entrance.y0 + l.doors.entrance.y1) / 2 },
  exit: { x: l.room.width + 0.5, y: (l.doors.exit.y0 + l.doors.exit.y1) / 2 },
});
const fill = (l, barriers = l.barriers) =>
  reachableFrom(barriers, l.room, probes(l).entrance, { doors: Object.values(l.doors) });

const offRoute = (l) => ({
  'above the diagonal': { x: 5, y: 20 },
  'right of the corridor wall': { x: 75, y: 40 },
  'on the stage': { x: 45, y: l.stage.y + l.stage.depth / 2 },
  'above the right tents': { x: 80, y: l.tents.find((t) => t.id === 'R2').y / 2 },
  'beside the entrance tents': { x: 5, y: 40 },
});

test('the entrance reaches the exit through the door gaps', () => {
  assert.ok(fill(layout)(probes(layout).exit));
});

test('no off-route area is reachable', () => {
  const reach = fill(layout);
  for (const [name, p] of Object.entries(offRoute(layout))) {
    assert.equal(reach(p), false, `${name} should be sealed off`);
  }
});

test('every route waypoint is reachable', () => {
  const reach = fill(layout);
  for (const p of layout.route) {
    const q = { x: Math.min(Math.max(p.x, -0.5), layout.room.width + 0.5), y: p.y };
    assert.ok(reach(q), `waypoint ${p.x},${p.y}`);
  }
});

test('closing either door gap makes the exit unreachable', () => {
  const { entrance, exit } = layout.doors;
  const closeEntrance = { id: 'test-close', a: { x: 0, y: entrance.y0 }, b: { x: 0, y: entrance.y1 } };
  const closeExit = { id: 'test-close', a: { x: 85, y: exit.y0 }, b: { x: 85, y: exit.y1 } };
  assert.equal(fill(layout, [...layout.barriers, closeEntrance])(probes(layout).exit), false);
  assert.equal(fill(layout, [...layout.barriers, closeExit])(probes(layout).exit), false);
});

test('removing the corridor wall or the diagonal opens a leak the check detects', () => {
  const pts = offRoute(layout);
  const noCorridor = layout.barriers.filter((s) => s.id !== 'corridor');
  assert.ok(fill(layout, noCorridor)(pts['right of the corridor wall']));
  const noDiagonal = layout.barriers.filter((s) => s.id !== 'diagonal');
  assert.ok(fill(layout, noDiagonal)(pts['above the diagonal']));
});

test('removing a closed tent side opens a leak the check detects', () => {
  const leaky = layout.barriers.filter((s) => s.id !== 'tent-L1-top');
  assert.ok(fill(layout, leaky)(offRoute(layout)['beside the entrance tents']));
});

test('each serpentine partition forces the S-route', () => {
  const full = fill(layout).distance(probes(layout).exit);
  for (const id of ['P1', 'P2', 'P3']) {
    const without = fill(layout, layout.barriers.filter((s) => s.id !== id)).distance(probes(layout).exit);
    assert.ok(full - without > 2, `removing ${id} should shorten the walk (was ${full} ft, now ${without} ft)`);
  }
});

test('corrected measurements stay leak-free', () => {
  for (const m of [{ stageDepth: 3 }, { diagonalDropOnR1: 8 }, { rightTopGap: 3 }]) {
    const l = buildLayout({ ...MEASUREMENTS, ...m });
    const reach = fill(l);
    assert.ok(reach(probes(l).exit), JSON.stringify(m));
    for (const [name, p] of Object.entries(offRoute(l))) {
      assert.equal(reach(p), false, `${name} with ${JSON.stringify(m)}`);
    }
  }
});

test('a door that runs past its tent side is rejected', () => {
  assert.throws(() => buildLayout({ ...MEASUREMENTS, stageDepth: 8 }), /Entrance door/);
  assert.throws(() => buildLayout({ ...MEASUREMENTS, exit: { y0: 12, y1: 16 } }), /Exit door/);
});
