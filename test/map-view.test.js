import { describe, it, expect, vi } from "vitest";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import * as Y from "yjs";
import { createStore } from "../src/store.js";
import { FLOORPLAN } from "../src/floorplan.js";
import { TEAMS } from "../src/teams.js";
import { createViewTransform, buildDrawList, createMapView } from "../src/map/map-view.js";

const GYM = FLOORPLAN.bounds;

// In-progress strokes are store-shaped: flat integer twentieths of a foot.
function feetToStored(x, y) {
  return [Math.round(x * 20), Math.round(y * 20)];
}

// store.addStroke takes feet pairs and quantizes them itself.
function horizontalStrokeFeet(y) {
  const points = [];
  for (let x = 20; x <= 65; x += 1) points.push([x, y]);
  return points;
}

function newStore() {
  return createStore({ doc: new Y.Doc() });
}

// A requestAnimationFrame stand-in that records callbacks until flushed.
function fakeRaf() {
  const queue = [];
  const raf = vi.fn((cb) => {
    queue.push(cb);
    return queue.length;
  });
  raf.flush = () => {
    const pending = queue.splice(0);
    for (const cb of pending) cb(performance.now());
  };
  raf.pending = () => queue.length;
  return raf;
}

describe("createViewTransform", () => {
  it.each([2, 8, 40])("toPx(toFeet(p)) round-trips within a pixel at scale %d", (scale) => {
    const t = createViewTransform({ scale, offset: [3.5, -2.25] });
    for (const p of [[0, 0], [123.4, 56.7], [-40, 900]]) {
      const back = t.toPx(t.toFeet(p));
      expect(Math.abs(back[0] - p[0])).toBeLessThan(1);
      expect(Math.abs(back[1] - p[1])).toBeLessThan(1);
    }
  });

  it("toPx follows drawOutline's (x + ox) * scale convention", () => {
    const t = createViewTransform({ scale: 10, offset: [2, 3] });
    expect(t.toPx([1, 1])).toEqual([30, 40]);
    expect(t.toFeet([30, 40])).toEqual([1, 1]);
  });

  it("fitToBounds fits 85 by 60 feet into 400 by 300 with a margin, centered", () => {
    const t = createViewTransform();
    t.fitToBounds({ width: 400, height: 300 }, GYM, 20);
    const [x0, y0] = t.toPx([0, 0]);
    const [x1, y1] = t.toPx([GYM.w, GYM.h]);
    expect(x0).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(y0).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(x1).toBeLessThanOrEqual(380 + 1e-6);
    expect(y1).toBeLessThanOrEqual(280 + 1e-6);
    // The gym is as large as the margin allows on at least one axis.
    const fitsWidth = Math.abs(x1 - x0 - 360) < 1e-6;
    const fitsHeight = Math.abs(y1 - y0 - 260) < 1e-6;
    expect(fitsWidth || fitsHeight).toBe(true);
    const [cx, cy] = t.toPx([GYM.w / 2, GYM.h / 2]);
    expect(Math.abs(cx - 200)).toBeLessThan(1);
    expect(Math.abs(cy - 150)).toBeLessThan(1);
  });

  it("panBy shifts the view by pixels", () => {
    const t = createViewTransform({ scale: 8, offset: [0, 0] });
    t.panBy([16, -8]);
    expect(t.toPx([0, 0])).toEqual([16, -8]);
  });

  it("zoomAt keeps the anchor under the same feet coordinate", () => {
    const t = createViewTransform({ scale: 8, offset: [1, 2] });
    const anchorPx = [123, 77];
    const before = t.toFeet(anchorPx);
    t.zoomAt(anchorPx, 1.75);
    expect(t.scale).toBeCloseTo(14, 6);
    const after = t.toFeet(anchorPx);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("zoomAt clamps scale to [2, 60] px per foot", () => {
    const t = createViewTransform({ scale: 8 });
    t.zoomAt([0, 0], 1000);
    expect(t.scale).toBe(60);
    t.zoomAt([0, 0], 0.0001);
    expect(t.scale).toBe(2);
  });
});

describe("buildDrawList", () => {
  it("draws the floor plan in order and skips both strokes and labels of a hidden team", () => {
    const store = newStore();
    store.addStroke({ team: "poison-breakfast", size: 0.6, points: [[5, 5], [10, 5]], pointerType: "touch" });
    store.addStroke({ team: "garden", size: 0.6, points: [[5, 8], [10, 8]], pointerType: "touch" });
    store.addLabel({ team: "poison-breakfast", x: 5, y: 12, text: "hidden" });
    store.addLabel({ team: "garden", x: 5, y: 14, text: "shown" });
    store.setTeamVisible("poison-breakfast", false);

    const items = buildDrawList(store.getState(), FLOORPLAN);
    const kinds = items.map((i) => i.kind);

    expect(kinds[0]).toBe("floor");
    expect(kinds.indexOf("wall")).toBeGreaterThan(kinds.indexOf("floor"));
    expect(kinds.filter((k) => k === "wall")).toHaveLength(FLOORPLAN.walls.length);
    expect(kinds.filter((k) => k === "tent")).toHaveLength(FLOORPLAN.tents.length);
    expect(kinds.filter((k) => k === "stage")).toHaveLength(1);
    expect(kinds.filter((k) => k === "path")).toHaveLength(1);
    expect(kinds.lastIndexOf("path")).toBeLessThan(kinds.indexOf("stroke"));

    const strokes = items.filter((i) => i.kind === "stroke");
    const labels = items.filter((i) => i.kind === "label");
    expect(strokes.map((s) => s.stroke.team)).toEqual(["garden"]);
    expect(labels.map((l) => l.label.team)).toEqual(["garden"]);
  });

  it("puts zones after the floor and before walls, with a centroid label position", () => {
    const store = newStore();
    store.setZone({ name: "Snack zone", team: "garden", points: [[10, 10], [20, 10], [20, 20], [10, 20]] });
    const items = buildDrawList(store.getState(), FLOORPLAN);
    const kinds = items.map((i) => i.kind);
    expect(kinds.indexOf("zone")).toBe(1);
    expect(kinds.indexOf("zone")).toBeLessThan(kinds.indexOf("wall"));
    const zoneItem = items[kinds.indexOf("zone")];
    expect(zoneItem.zone.name).toBe("Snack zone");
    expect(zoneItem.centroid[0]).toBeCloseTo(15, 6);
    expect(zoneItem.centroid[1]).toBeCloseTo(15, 6);
  });
});

describe("createMapView", () => {
  function makeView({ store = newStore(), width = 400, height = 300, dpr = 1 } = {}) {
    const canvas = createCanvas(width, height);
    const raf = fakeRaf();
    const view = createMapView({
      canvas,
      store,
      floorplan: FLOORPLAN,
      teams: TEAMS,
      raf,
      dpr,
      Path2DCtor: Path2D,
    });
    view.resize({ width, height });
    return { canvas, raf, view, store };
  }

  it("coalesces two requestRedraw calls within one frame into one draw", () => {
    const { view, raf } = makeView();
    const draw = vi.spyOn(view, "draw");
    // resize() may have queued a frame; clear it so the count below is clean.
    raf.flush();
    draw.mockClear();

    view.requestRedraw();
    view.requestRedraw();
    expect(raf.pending()).toBe(1);
    raf.flush();
    expect(draw).toHaveBeenCalledTimes(1);

    // A later frame draws again.
    view.requestRedraw();
    raf.flush();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("requests a redraw when the store changes", () => {
    const { view, raf, store } = makeView();
    raf.flush();
    const draw = vi.spyOn(view, "draw");
    expect(raf.pending()).toBe(0);
    store.addLabel({ team: "garden", x: 1, y: 1, text: "hi" });
    expect(raf.pending()).toBe(1);
    raf.flush();
    expect(draw).toHaveBeenCalledTimes(1);
    view.destroy();
    store.addLabel({ team: "garden", x: 2, y: 2, text: "bye" });
    expect(raf.pending()).toBe(0);
  });

  it("resize sizes the backing store by dpr and fits the gym on the first call", () => {
    const { canvas, view } = makeView({ width: 200, height: 100, dpr: 2 });
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    const [x0] = view.transform.toPx([0, 0]);
    const [x1] = view.transform.toPx([GYM.w, GYM.h]);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(200);
  });

  it("paints a green stroke over a tan floor", () => {
    const store = newStore();
    // A thick horizontal stroke across the middle of the gym.
    store.addStroke({ team: "poison-breakfast", size: 3, points: horizontalStrokeFeet(30), pointerType: "touch" });
    const { canvas, view } = makeView({ store });
    view.draw();
    const ctx = canvas.getContext("2d");

    const [sx, sy] = view.transform.toPx([42, 30]);
    const onStroke = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    // Team green #3A9D4F: green channel dominates.
    expect(onStroke[1]).toBeGreaterThan(onStroke[0] + 30);
    expect(onStroke[1]).toBeGreaterThan(onStroke[2] + 30);

    // Open floor away from every wall, tent, path, and stage: Ram Board tan #C9A86C.
    const [fx, fy] = view.transform.toPx([12.5, 12.5]);
    const onFloor = ctx.getImageData(Math.round(fx), Math.round(fy), 1, 1).data;
    expect(Math.abs(onFloor[0] - 0xc9)).toBeLessThan(12);
    expect(Math.abs(onFloor[1] - 0xa8)).toBeLessThan(12);
    expect(Math.abs(onFloor[2] - 0x6c)).toBeLessThan(12);
  });

  it("draws the in-progress stroke when set", () => {
    const { canvas, view } = makeView();
    const points = [];
    for (let x = 20; x <= 65; x += 1) points.push(...feetToStored(x, 30));
    view.setInProgressStroke({ team: "schoolyard", size: 3, points });
    view.draw();
    const ctx = canvas.getContext("2d");
    const [sx, sy] = view.transform.toPx([42, 30]);
    const px = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    // Team red #D8402C at 70 percent over tan: red still dominates.
    expect(px[0]).toBeGreaterThan(px[1] + 30);
    expect(px[0]).toBeGreaterThan(px[2] + 30);
    view.setInProgressStroke(null);
    view.draw();
    const after = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    expect(Math.abs(after[0] - 0xc9)).toBeLessThan(12);
  });
});

describe("fitToBounds insets", () => {
  it("keeps the gym clear of a bottom overlay such as the toolbar", () => {
    const t = createViewTransform();
    t.fitToBounds({ width: 400, height: 300 }, GYM, 20, { bottom: 100 });
    const [, topY] = t.toPx([0, 0]);
    const [, bottomY] = t.toPx([0, GYM.h]);
    expect(topY, "gym top is on canvas").toBeGreaterThanOrEqual(0);
    expect(bottomY, "gym bottom clears the toolbar").toBeLessThanOrEqual(200);
    const midY = (topY + bottomY) / 2;
    expect(Math.abs(midY - 100), "centered in the area above the toolbar").toBeLessThan(1);
  });

  it("with no insets behaves as before", () => {
    const a = createViewTransform().fitToBounds({ width: 400, height: 300 }, GYM, 20);
    const b = createViewTransform().fitToBounds({ width: 400, height: 300 }, GYM, 20, {});
    expect(b.scale).toBeCloseTo(a.scale, 10);
    expect(b.offset).toEqual(a.offset);
  });
});
