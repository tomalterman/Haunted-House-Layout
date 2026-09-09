import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { createStore } from "../src/store.js";
import { FLOORPLAN } from "../src/floorplan.js";
import { zoneAt } from "../src/geometry.js";
import { createZoneDraft, isSelfIntersecting, commitZone } from "../src/map/zone-tool.js";

const entranceTaps = [
  [0.3, 36.4],
  [19.6, 36.2],
  [20.3, 55.7],
  [0.2, 55.8],
];

describe("createZoneDraft", () => {
  it("closes a 4 corner polygon snapped to whole feet when the first corner is tapped again", () => {
    const draft = createZoneDraft({ floorplan: FLOORPLAN });
    for (const tap of entranceTaps) {
      expect(draft.addCorner(tap).status).toBe("added");
    }
    expect(draft.points).toHaveLength(4);
    const result = draft.addCorner([0.4, 36.3]);
    expect(result.status).toBe("closed");
    expect(result.points).toEqual([
      [0, 36],
      [20, 36],
      [20, 56],
      [0, 56],
    ]);
    for (const [x, y] of result.points) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
    // The draft resets after closing.
    expect(draft.points).toEqual([]);
  });

  it("fromRegion returns the named region's polygon", () => {
    const draft = createZoneDraft({ floorplan: FLOORPLAN });
    draft.addCorner([3, 3]);
    const region = FLOORPLAN.regions.find((r) => r.id === "serpentine");
    const points = draft.fromRegion("serpentine");
    expect(points).toEqual(region.points);
    expect(points).not.toBe(region.points);
    expect(draft.points).toEqual([]);
    expect(draft.fromRegion("nowhere")).toBeNull();
  });

  it("discards the draft when closed after only two corners", () => {
    const draft = createZoneDraft({ floorplan: FLOORPLAN });
    draft.addCorner([3.2, 3.1]);
    draft.addCorner([9.8, 3.4]);
    const result = draft.addCorner([3.1, 2.9]);
    expect(result.status).toBe("discarded");
    expect(result.points).toEqual([]);
    expect(draft.points).toEqual([]);
    // A fresh corner starts a new draft.
    expect(draft.addCorner([5.4, 5.6])).toEqual({ status: "added", points: [[5, 6]] });
  });

  it("snaps a corner within 1.5 feet of the diagonal wall's endpoint to that endpoint", () => {
    const draft = createZoneDraft({ floorplan: FLOORPLAN });
    const result = draft.addCorner([21.2, 36.8]);
    expect(result.points).toEqual([[20, 36]]);
    // Beyond the snap radius the grid wins.
    const far = createZoneDraft({ floorplan: FLOORPLAN }).addCorner([22.4, 37.6]);
    expect(far.points).toEqual([[22, 38]]);
  });

  it("cancel clears the corners", () => {
    const draft = createZoneDraft({ floorplan: FLOORPLAN });
    draft.addCorner([3, 3]);
    draft.addCorner([8, 3]);
    draft.cancel();
    expect(draft.points).toEqual([]);
  });
});

describe("isSelfIntersecting", () => {
  it("is false for a square and for polygons with fewer than four corners", () => {
    expect(
      isSelfIntersecting([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    ).toBe(false);
    expect(
      isSelfIntersecting([
        [0, 0],
        [4, 0],
        [2, 3],
      ]),
    ).toBe(false);
  });

  it("is true for a bowtie", () => {
    expect(
      isSelfIntersecting([
        [0, 0],
        [4, 4],
        [4, 0],
        [0, 4],
      ]),
    ).toBe(true);
  });
});

describe("zone flow against the store", () => {
  it("commits, reassigns without touching strokes, and deletes so zoneAt is null", () => {
    const store = createStore({ doc: new Y.Doc() });
    const inside = [10, 46];
    const strokeId = store.addStroke({
      team: "garden",
      size: 0.6,
      points: [
        [9, 45, 0.5],
        [11, 47, 0.5],
      ],
      pointerType: "touch",
    });
    const before = store.getState().strokes.find((s) => s.id === strokeId);

    const points = FLOORPLAN.regions.find((r) => r.id === "entrance-tents").points;
    const id = commitZone(store, { name: "Garden", team: "garden", points });
    expect(typeof id).toBe("string");
    expect(zoneAt(inside, store.getState().zones)?.team).toBe("garden");

    store.assignZone(id, "schoolyard");
    const zone = store.getState().zones.find((z) => z.id === id);
    expect(zone.team).toBe("schoolyard");
    expect(zone.name).toBe("Garden");
    const after = store.getState().strokes.find((s) => s.id === strokeId);
    expect(after).toEqual(before);

    store.deleteZone(id);
    expect(zoneAt(inside, store.getState().zones)).toBeNull();
    expect(store.getState().strokes.find((s) => s.id === strokeId)).toEqual(before);
  });

  it("refuses to commit fewer than three corners", () => {
    const store = createStore({ doc: new Y.Doc() });
    expect(commitZone(store, { name: "x", team: "garden", points: [[0, 0], [1, 1]] })).toBeNull();
    expect(store.getState().zones).toEqual([]);
  });
});
