import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { createStore, decodeStrokePoints, STROKE_QUANTUM } from "../src/store.js";

// Two docs standing in for two phones. sync() pushes every pending change
// both ways by exchanging full state updates.
function pair() {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const a = createStore({ doc: docA });
  const b = createStore({ doc: docB });
  const sync = () => {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  };
  return { docA, docB, a, b, sync };
}

const squiggle = [
  [1, 1, 0.5],
  [2.03, 1.51, 0.6],
  [3.14159, 2.71828, 0.7],
];

describe("strokes across two docs", () => {
  it("addStroke on A appears on B with identical quantized points and team", () => {
    const { a, b, sync } = pair();
    const id = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    expect(typeof id).toBe("string");
    sync();
    const onA = a.getState().strokes.find((s) => s.id === id);
    const onB = b.getState().strokes.find((s) => s.id === id);
    expect(onB).toBeDefined();
    expect(onB.team).toBe("garden");
    expect(onB.size).toBe(3);
    expect(onB.points).toEqual(onA.points);
    // flat integers in twentieths of a foot, pressure dropped for touch
    expect(onB.points).toEqual([20, 20, 41, 30, 63, 54]);
    expect(onB.pressure).toBeUndefined();
    expect(STROKE_QUANTUM).toBe(20);
  });

  it("keeps pressure only for pen input and decodes back to feet", () => {
    const { a } = pair();
    const id = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "pen" });
    const stroke = a.getState().strokes.find((s) => s.id === id);
    expect(stroke.pressure).toEqual([0.5, 0.6, 0.7]);
    const decoded = decodeStrokePoints(stroke);
    expect(decoded).toEqual([
      [1, 1, 0.5],
      [2.05, 1.5, 0.6],
      [3.15, 2.7, 0.7],
    ]);
    const touchId = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const touch = a.getState().strokes.find((s) => s.id === touchId);
    expect(decodeStrokePoints(touch)[0]).toEqual([1, 1, 0.5]);
  });

  it("concurrent addStroke on A and B both survive after merge", () => {
    const { a, b, sync } = pair();
    const idA = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const idB = b.addStroke({ team: "lab", size: 5, points: squiggle, pointerType: "touch" });
    sync();
    const idsA = a.getState().strokes.map((s) => s.id).sort();
    const idsB = b.getState().strokes.map((s) => s.id).sort();
    expect(idsA).toEqual([idA, idB].sort());
    expect(idsB).toEqual(idsA);
  });

  it("erase on B removes a stroke A drew, on both docs, and the same for a label", () => {
    const { a, b, sync } = pair();
    const strokeId = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const labelId = a.addLabel({ team: "garden", x: 4, y: 5, text: "Fog here" });
    sync();
    expect(b.erase(strokeId)).toBe(true);
    expect(b.erase(labelId)).toBe(true);
    expect(b.erase("nope")).toBe(false);
    sync();
    for (const s of [a, b]) {
      expect(s.getState().strokes).toHaveLength(0);
      expect(s.getState().labels).toHaveLength(0);
    }
  });

  it("a 200-point stroke encodes as a Yjs update under 1500 bytes", () => {
    const { docA, a } = pair();
    const points = Array.from({ length: 200 }, (_, i) => [
      10 + Math.sin(i / 7) * 8,
      10 + Math.cos(i / 5) * 8,
      0.5 + (i % 10) / 20,
    ]);
    let size = 0;
    docA.on("update", (update) => {
      size = update.byteLength;
    });
    a.addStroke({ team: "garden", size: 4, points, pointerType: "touch" });
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1500);
  });
});

describe("undo", () => {
  it("removes only the last mark this store created, for labels as well as strokes", () => {
    const { a } = pair();
    const s1 = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const l1 = a.addLabel({ team: "garden", x: 1, y: 1, text: "one" });
    const s2 = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    expect(a.undo()).toBe(s2);
    expect(a.getState().strokes.map((s) => s.id)).toEqual([s1]);
    expect(a.getState().labels.map((l) => l.id)).toEqual([l1]);
    expect(a.undo()).toBe(l1);
    expect(a.getState().labels).toHaveLength(0);
    expect(a.getState().strokes.map((s) => s.id)).toEqual([s1]);
  });

  it("returns null when the stack is empty or the mark was already erased", () => {
    const { a, b, sync } = pair();
    expect(a.undo()).toBeNull();
    const id = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    sync();
    b.erase(id);
    sync();
    expect(a.undo()).toBeNull();
    expect(a.undo()).toBeNull();
  });

  it("skips an erased mark and undoes the one before it", () => {
    const { a } = pair();
    const s1 = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const s2 = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    a.erase(s2);
    expect(a.undo()).toBe(s1);
    expect(a.getState().strokes).toHaveLength(0);
  });

  it("after a mark created by the other doc leaves that mark alone", () => {
    const { a, b, sync } = pair();
    const mine = a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    const theirs = b.addStroke({ team: "lab", size: 3, points: squiggle, pointerType: "touch" });
    sync();
    expect(a.undo()).toBe(mine);
    expect(a.undo()).toBeNull();
    sync();
    expect(a.getState().strokes.map((s) => s.id)).toEqual([theirs]);
    expect(b.getState().strokes.map((s) => s.id)).toEqual([theirs]);
  });
});

describe("local state", () => {
  it("setTeamVisible changes only local visibility, notifies subscribers, emits no doc update", () => {
    const { docA, a, b, sync } = pair();
    let updates = 0;
    docA.on("update", () => {
      updates += 1;
    });
    let calls = 0;
    const off = a.subscribe(() => {
      calls += 1;
    });
    expect(a.isTeamVisible("garden")).toBe(true);
    a.setTeamVisible("garden", false);
    expect(a.isTeamVisible("garden")).toBe(false);
    expect(a.getState().hidden).toEqual(new Set(["garden"]));
    expect(calls).toBe(1);
    expect(updates).toBe(0);
    sync();
    expect(b.isTeamVisible("garden")).toBe(true);
    off();
    a.setTeamVisible("garden", true);
    expect(calls).toBe(1);
    expect(a.getState().hidden.size).toBe(0);
  });

  it("walk start is local only and notifies subscribers", () => {
    const { docA, a } = pair();
    let updates = 0;
    docA.on("update", () => {
      updates += 1;
    });
    let calls = 0;
    a.subscribe(() => {
      calls += 1;
    });
    expect(a.getWalkStart()).toBeNull();
    a.setWalkStart([12, 8]);
    expect(a.getWalkStart()).toEqual([12, 8]);
    expect(a.getState().walkStart).toEqual([12, 8]);
    expect(calls).toBe(1);
    expect(updates).toBe(0);
  });

  it("status is local without a provider and saveError mirrors meta", () => {
    const { docA, a } = pair();
    expect(a.status).toBe("local");
    expect(a.saveError).toBeNull();
    docA.getMap("meta").set("lastSaveError", "disk full");
    expect(a.saveError).toBe("disk full");
  });

  it("status follows provider status and sync events", () => {
    const listeners = new Map();
    const provider = {
      on(name, fn) {
        listeners.set(name, fn);
      },
      off() {},
    };
    const a = createStore({ doc: new Y.Doc(), provider });
    const seen = [];
    a.subscribe(() => seen.push(a.status));
    expect(a.status).toBe("connecting");
    listeners.get("status")({ status: "connected" });
    expect(a.status).toBe("live");
    listeners.get("status")({ status: "disconnected" });
    expect(a.status).toBe("offline");
    listeners.get("status")({ status: "connecting" });
    expect(a.status).toBe("connecting");
    listeners.get("sync")(true);
    expect(a.status).toBe("live");
    expect(seen).toEqual(["live", "offline", "connecting", "live"]);
  });
});

describe("zones", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("assignZone overwrites the team of one zone and leaves strokes inside it untouched", () => {
    const { a, b, sync } = pair();
    const z1 = a.setZone({ name: "Entry", team: "garden", points: square });
    const z2 = a.setZone({ name: "Maze", team: "lab", points: square.map(([x, y]) => [x + 20, y]) });
    const strokeId = a.addStroke({ team: "garden", size: 3, points: [[2, 2], [5, 5]], pointerType: "touch" });
    sync();
    b.assignZone(z1, "crypt");
    sync();
    const zones = a.getState().zones;
    expect(zones.find((z) => z.id === z1).team).toBe("crypt");
    expect(zones.find((z) => z.id === z1).name).toBe("Entry");
    expect(zones.find((z) => z.id === z2).team).toBe("lab");
    const stroke = a.getState().strokes.find((s) => s.id === strokeId);
    expect(stroke.team).toBe("garden");
    expect(stroke.points).toEqual([40, 40, 100, 100]);
  });

  it("renameZone changes the name only", () => {
    const { a } = pair();
    const id = a.setZone({ name: "Entry", team: "garden", points: square });
    a.renameZone(id, "Foyer");
    const zone = a.getState().zones[0];
    expect(zone.name).toBe("Foyer");
    expect(zone.team).toBe("garden");
    expect(zone.points).toEqual(square);
  });

  it("deleteZone removes the zone and no marks", () => {
    const { a } = pair();
    const id = a.setZone({ name: "Entry", team: "garden", points: square });
    a.addStroke({ team: "garden", size: 3, points: [[2, 2], [5, 5]], pointerType: "touch" });
    a.addLabel({ team: "garden", x: 3, y: 3, text: "Boo" });
    expect(a.deleteZone(id)).toBe(true);
    expect(a.deleteZone(id)).toBe(false);
    expect(a.getState().zones).toHaveLength(0);
    expect(a.getState().strokes).toHaveLength(1);
    expect(a.getState().labels).toHaveLength(1);
  });

  it("setZone with an id replaces the zone and keeps createdAt; zones sort by createdAt", () => {
    const { a } = pair();
    const first = a.setZone({ name: "A", team: "garden", points: square });
    const second = a.setZone({ name: "B", team: "lab", points: square });
    const before = a.getState().zones.find((z) => z.id === first).createdAt;
    const back = a.setZone({ id: first, name: "A2", team: "garden", points: square.slice(0, 3) });
    expect(back).toBe(first);
    const zones = a.getState().zones;
    expect(zones.map((z) => z.id)).toEqual([first, second]);
    expect(zones[0].name).toBe("A2");
    expect(zones[0].createdAt).toBe(before);
    expect(zones[0].points).toHaveLength(3);
  });
});

describe("labels", () => {
  it("rejects empty or whitespace text and truncates to 40 characters", () => {
    const { a } = pair();
    expect(a.addLabel({ team: "garden", x: 1, y: 1, text: "" })).toBeNull();
    expect(a.addLabel({ team: "garden", x: 1, y: 1, text: "   \n" })).toBeNull();
    const long = "x".repeat(60);
    const id = a.addLabel({ team: "garden", x: 1.5, y: 2.5, text: `  ${long}  ` });
    const label = a.getState().labels.find((l) => l.id === id);
    expect(label.text).toBe("x".repeat(40));
    expect(label.x).toBe(1.5);
    expect(label.y).toBe(2.5);
    expect(label.team).toBe("garden");
    expect(a.getState().labels).toHaveLength(1);
  });
});

describe("subscribe", () => {
  it("fires once for a transaction that touches multiple types", () => {
    const { docA, a } = pair();
    let calls = 0;
    a.subscribe(() => {
      calls += 1;
    });
    docA.transact(() => {
      a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
      a.addLabel({ team: "garden", x: 1, y: 1, text: "hi" });
      a.setZone({ name: "Z", team: "garden", points: [[0, 0], [1, 0], [1, 1]] });
      docA.getMap("meta").set("lastSaveError", null);
    });
    expect(calls).toBe(1);
    a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    expect(calls).toBe(2);
  });

  it("fires when a remote update arrives", () => {
    const { a, b, sync } = pair();
    let calls = 0;
    b.subscribe(() => {
      calls += 1;
    });
    a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "touch" });
    sync();
    expect(calls).toBe(1);
  });
});

describe("persistence", () => {
  it("persisting A's full state into a fresh doc C reproduces every zone, stroke, and label", () => {
    const { docA, a } = pair();
    a.setZone({ name: "Entry", team: "garden", points: [[0, 0], [10, 0], [10, 10]] });
    a.setZone({ name: "Maze", team: "lab", points: [[20, 0], [30, 0], [30, 10]] });
    a.addStroke({ team: "garden", size: 3, points: squiggle, pointerType: "pen" });
    a.addStroke({ team: "lab", size: 6, points: squiggle, pointerType: "touch" });
    a.addLabel({ team: "garden", x: 2, y: 2, text: "Fog" });
    const docC = new Y.Doc();
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));
    const c = createStore({ doc: docC });
    const from = a.getState();
    const to = c.getState();
    expect(to.zones).toEqual(from.zones);
    expect(to.strokes).toEqual(from.strokes);
    expect(to.labels).toEqual(from.labels);
    expect(to.zones).toHaveLength(2);
    expect(to.strokes).toHaveLength(2);
    expect(to.labels).toHaveLength(1);
  });
});
