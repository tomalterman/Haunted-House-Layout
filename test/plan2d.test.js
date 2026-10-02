import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEASUREMENTS, buildLayout, layout } from '../src/layout.js';
import { renderPlan2D, planLabels, PLAN_STYLE } from '../src/plan2d.js';

const count = (s, re) => (s.match(re) || []).length;

test('draws one wall element per wall segment', () => {
  const svg = renderPlan2D(layout);
  assert.equal(count(svg, /class="wall"/g), layout.walls.length);
});

test('draws a tent for every tent and a side for every closed tent side', () => {
  const svg = renderPlan2D(layout);
  assert.equal(count(svg, /class="tent"/g), layout.tents.length);
  assert.equal(count(svg, /class="tent-side"/g), layout.tentSides.length);
});

test('walls are heavier than tents and the route', () => {
  assert.ok(PLAN_STYLE.wall > PLAN_STYLE.tentSide);
  assert.ok(PLAN_STYLE.wall > PLAN_STYLE.route);
});

test('route sits in its own group with a stable id and direction markers', () => {
  const svg = renderPlan2D(layout);
  assert.match(svg, /<g id="route"/);
  assert.ok(count(svg, /class="route-arrow"/g) >= 3);
});

test('labels read their numbers from the layout', () => {
  const texts = planLabels(layout).map((l) => l.text);
  assert.ok(texts.includes('85 ft'));
  assert.ok(texts.includes('60 ft'));
  assert.ok(texts.some((t) => t.startsWith('Diagonal 52.5 ft')));
  assert.ok(texts.some((t) => t.startsWith('32 ft')));
  assert.ok(texts.some((t) => t.includes('pony wall 50 ft')));
  assert.ok(texts.includes('10×10'));
});

test('a changed diagonal shows its new length', () => {
  const l = buildLayout({ ...MEASUREMENTS, diagonalDropOnR1: 9 });
  const label = planLabels(l).find((x) => x.text.startsWith('Diagonal'));
  assert.equal(label.text, `Diagonal ${l.diagonal.length.toFixed(1)} ft · ${l.diagonal.panels} panels`);
  assert.notEqual(l.diagonal.length, layout.diagonal.length);
});

test('entrance, exit, and stage are named', () => {
  const texts = planLabels(layout).map((l) => l.text);
  assert.ok(texts.includes('Entrance'));
  assert.ok(texts.includes('Exit'));
  assert.ok(texts.some((t) => t.startsWith('Stage')));
});

test('labels are readable at 390 px and do not overlap', () => {
  const vbWidth = PLAN_STYLE.viewBox[2];
  assert.ok(PLAN_STYLE.label * (390 / vbWidth) >= 10, 'label renders at 10 px or more');
  const boxes = planLabels(layout).map((l) => ({ text: l.text, ...l.box }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
      assert.ok(apart, `"${a.text}" overlaps "${b.text}"`);
    }
  }
});

test('labels stay inside the drawing', () => {
  const [vx, vy, vw, vh] = PLAN_STYLE.viewBox;
  for (const l of planLabels(layout)) {
    assert.ok(l.box.x0 >= vx && l.box.x1 <= vx + vw, `${l.text} x`);
    assert.ok(l.box.y0 >= vy && l.box.y1 <= vy + vh, `${l.text} y`);
  }
});

test('the SVG has an accessible title and description', () => {
  const svg = renderPlan2D(layout);
  assert.match(svg, /<title id="plan-title">/);
  assert.match(svg, /<desc>/);
  assert.match(svg, /role="img"/);
});
