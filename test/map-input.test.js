import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { createStore } from "../src/store.js";
import { createInputMachine, hitTestMark } from "../src/map/map-input.js";

function machineWithSpies(options = {}) {
  const spies = {
    onStrokeStart: vi.fn(),
    onStrokePoint: vi.fn(),
    onStrokeEnd: vi.fn(),
    onStrokeCancel: vi.fn(),
    onPan: vi.fn(),
    onZoom: vi.fn(),
    onTap: vi.fn(),
  };
  const machine = createInputMachine({ ...spies, ...options });
  return { machine, spies };
}

const down = (id, x, y, extra = {}) => ({ type: "down", id, x, y, ...extra });
const move = (id, x, y, extra = {}) => ({ type: "move", id, x, y, ...extra });
const up = (id, x, y) => ({ type: "up", id, x, y });
const cancel = (id) => ({ type: "cancel", id });

describe("createInputMachine: draw tool", () => {
  it("starts Idle with the draw tool and no active pointers", () => {
    const { machine } = machineWithSpies();
    expect(machine.state).toBe("Idle");
    expect(machine.tool).toBe("draw");
    expect(machine.activePointers).toBe(0);
  });

  it("down, three moves, up emits start, points, and end with 4 points", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 10, 10, { pressure: 0.5, pointerType: "pen" }));
    expect(machine.state).toBe("Drawing");
    expect(spies.onStrokeStart).toHaveBeenCalledTimes(1);
    machine.handle(move(1, 20, 10));
    machine.handle(move(1, 30, 10));
    machine.handle(move(1, 40, 10));
    expect(spies.onStrokePoint).toHaveBeenCalledTimes(3);
    machine.handle(up(1, 40, 10));
    expect(machine.state).toBe("Idle");
    expect(spies.onStrokeEnd).toHaveBeenCalledTimes(1);
    const [points] = spies.onStrokeEnd.mock.calls[0];
    expect(points).toHaveLength(4);
    expect(points[0]).toMatchObject({ x: 10, y: 10, pressure: 0.5 });
    expect(points[3]).toMatchObject({ x: 40, y: 10 });
    expect(spies.onStrokeEnd.mock.calls[0][1]).toBe("pen");
    expect(spies.onStrokeCancel).not.toHaveBeenCalled();
  });

  it("a stroke with fewer than 4 points on up is cancelled, not committed", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 10, 10));
    machine.handle(move(1, 12, 10));
    machine.handle(up(1, 12, 10));
    expect(machine.state).toBe("Idle");
    expect(spies.onStrokeEnd).not.toHaveBeenCalled();
    expect(spies.onStrokeCancel).toHaveBeenCalledTimes(1);
  });

  it("cancel mid-stroke discards the stroke and returns to Idle", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 10, 10));
    machine.handle(move(1, 20, 10));
    machine.handle(move(1, 30, 10));
    machine.handle(move(1, 40, 10));
    machine.handle(cancel(1));
    expect(machine.state).toBe("Idle");
    expect(machine.activePointers).toBe(0);
    expect(spies.onStrokeCancel).toHaveBeenCalledTimes(1);
    expect(spies.onStrokeEnd).not.toHaveBeenCalled();
  });

  it("setHandlers installs callbacks after creation, as the toolbar wires them", () => {
    const machine = createInputMachine();
    const onStrokeEnd = vi.fn();
    machine.setHandlers({ onStrokeEnd, onTap: "not a function" });
    machine.handle(down(1, 0, 0));
    machine.handle(move(1, 1, 0));
    machine.handle(move(1, 2, 0));
    machine.handle(move(1, 3, 0));
    machine.handle(up(1, 3, 0));
    expect(onStrokeEnd).toHaveBeenCalledTimes(1);
  });

  it("ignores moves and ups from pointers it never saw go down", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(move(9, 10, 10));
    machine.handle(up(9, 10, 10));
    expect(machine.state).toBe("Idle");
    expect(spies.onStrokeStart).not.toHaveBeenCalled();
    expect(spies.onStrokeCancel).not.toHaveBeenCalled();
  });
});

describe("createInputMachine: two-finger pan and zoom (AE5)", () => {
  it("a second pointer down cancels the stroke and enters Panning; moving both pans and zooms; all up returns to Idle", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 100, 100));
    machine.handle(move(1, 110, 100));
    machine.handle(down(2, 200, 100));
    expect(machine.state).toBe("Panning");
    expect(machine.activePointers).toBe(2);
    expect(spies.onStrokeCancel).toHaveBeenCalledTimes(1);
    expect(spies.onStrokeEnd).not.toHaveBeenCalled();

    // Translate both by (+10, +5) and spread them apart: distance 90 -> 180.
    machine.handle(move(1, 75, 105));
    machine.handle(move(2, 255, 105));
    expect(spies.onPan).toHaveBeenCalled();
    expect(spies.onZoom).toHaveBeenCalled();
    const totalPan = spies.onPan.mock.calls.reduce(
      (acc, [[dx, dy]]) => [acc[0] + dx, acc[1] + dy],
      [0, 0],
    );
    expect(totalPan[0]).toBeCloseTo(10, 5);
    expect(totalPan[1]).toBeCloseTo(5, 5);
    const totalFactor = spies.onZoom.mock.calls.reduce((acc, [{ factor }]) => acc * factor, 1);
    expect(totalFactor).toBeCloseTo(2, 5);
    const last = spies.onZoom.mock.calls.at(-1)[0];
    expect(last.center).toEqual([165, 105]);

    machine.handle(up(1, 75, 105));
    expect(machine.state).toBe("Panning");
    machine.handle(up(2, 255, 105));
    expect(machine.state).toBe("Idle");
    expect(machine.activePointers).toBe(0);
    // Lifting fingers must not draw or tap.
    expect(spies.onStrokeStart).toHaveBeenCalledTimes(1);
    expect(spies.onTap).not.toHaveBeenCalled();
  });

  it("a third pointer is ignored while panning", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 100, 100));
    machine.handle(down(2, 200, 100));
    machine.handle(down(3, 300, 300));
    expect(machine.state).toBe("Panning");
    expect(machine.activePointers).toBe(2);
    machine.handle(move(3, 400, 400));
    expect(spies.onPan).not.toHaveBeenCalled();
    expect(spies.onZoom).not.toHaveBeenCalled();
    machine.handle(up(3, 400, 400));
    expect(machine.state).toBe("Panning");
    machine.handle(up(1, 100, 100));
    machine.handle(up(2, 200, 100));
    expect(machine.state).toBe("Idle");
  });

  it("a pointer that goes down straight from Idle then a second one pans without a stroke", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 0, 0));
    machine.handle(down(2, 100, 0));
    expect(machine.state).toBe("Panning");
    expect(spies.onStrokeStart).toHaveBeenCalledTimes(1);
    expect(spies.onStrokeCancel).toHaveBeenCalledTimes(1);
  });

  it("cancel while panning discards every pointer and returns to Idle", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 0, 0));
    machine.handle(down(2, 100, 0));
    machine.handle(cancel(1));
    expect(machine.state).toBe("Idle");
    expect(machine.activePointers).toBe(0);
    // The other pointer's late events are ignored.
    machine.handle(move(2, 120, 0));
    machine.handle(up(2, 120, 0));
    expect(machine.state).toBe("Idle");
    expect(spies.onPan).not.toHaveBeenCalled();
    expect(spies.onTap).not.toHaveBeenCalled();
  });
});

describe("createInputMachine: placing tools", () => {
  it("walk-from-here tap routes through Placing and reports the point via onTap", () => {
    const { machine, spies } = machineWithSpies();
    machine.setTool("walk-from-here");
    expect(machine.tool).toBe("walk-from-here");
    machine.handle(down(1, 50, 60));
    expect(machine.state).toBe("Placing");
    machine.handle(move(1, 52, 61));
    machine.handle(up(1, 52, 61));
    expect(machine.state).toBe("Idle");
    expect(spies.onTap).toHaveBeenCalledTimes(1);
    expect(spies.onTap.mock.calls[0][0]).toEqual({ x: 52, y: 61, tool: "walk-from-here" });
    expect(spies.onStrokeStart).not.toHaveBeenCalled();
  });

  it("a Placing down that moves 20 px before up does not emit onTap", () => {
    const { machine, spies } = machineWithSpies();
    machine.setTool("erase");
    machine.handle(down(1, 50, 60));
    machine.handle(move(1, 70, 60));
    machine.handle(up(1, 70, 60));
    expect(machine.state).toBe("Idle");
    expect(spies.onTap).not.toHaveBeenCalled();
  });

  it("a Placing drag past tap slop pans the map so desktop can move without a second finger", () => {
    const { machine, spies } = machineWithSpies();
    machine.setTool("erase");
    machine.handle(down(1, 50, 60));
    machine.handle(move(1, 54, 60));
    expect(spies.onPan).not.toHaveBeenCalled();
    machine.handle(move(1, 70, 64));
    expect(spies.onPan).toHaveBeenCalled();
    const total = spies.onPan.mock.calls.reduce(
      (acc, [delta]) => [acc[0] + delta[0], acc[1] + delta[1]],
      [0, 0],
    );
    // Only motion after the tap slop is applied (50 → 54 was still a tap).
    expect(total[0]).toBe(16);
    expect(total[1]).toBe(4);
    machine.handle(up(1, 70, 64));
    expect(spies.onTap).not.toHaveBeenCalled();
  });

  it("wheel zooms when ctrl is held and pans otherwise", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle({ type: "wheel", x: 80, y: 40, deltaX: 10, deltaY: 20, ctrlKey: false });
    expect(spies.onPan).toHaveBeenCalledWith([-10, -20]);
    expect(spies.onZoom).not.toHaveBeenCalled();
    machine.handle({ type: "wheel", x: 80, y: 40, deltaX: 0, deltaY: -20, ctrlKey: true });
    expect(spies.onZoom).toHaveBeenCalledTimes(1);
    const zoom = spies.onZoom.mock.calls[0][0];
    expect(zoom.center).toEqual([80, 40]);
    expect(zoom.factor).toBeGreaterThan(1);
  });

  it("a second pointer during Placing switches to Panning without a tap", () => {
    const { machine, spies } = machineWithSpies();
    machine.setTool("label");
    machine.handle(down(1, 50, 60));
    machine.handle(down(2, 150, 60));
    expect(machine.state).toBe("Panning");
    machine.handle(up(1, 50, 60));
    machine.handle(up(2, 150, 60));
    expect(spies.onTap).not.toHaveBeenCalled();
    expect(spies.onStrokeCancel).not.toHaveBeenCalled();
  });

  it("rejects unknown tools and keeps the current one", () => {
    const { machine } = machineWithSpies();
    expect(() => machine.setTool("teleport")).toThrow();
    expect(machine.tool).toBe("draw");
  });

  it("switching tools mid-gesture cancels the gesture", () => {
    const { machine, spies } = machineWithSpies();
    machine.handle(down(1, 0, 0));
    machine.setTool("erase");
    expect(machine.state).toBe("Idle");
    expect(spies.onStrokeCancel).toHaveBeenCalledTimes(1);
  });
});

describe("hitTestMark", () => {
  function storeWithMarks() {
    const store = createStore({ doc: new Y.Doc() });
    const strokeId = store.addStroke({
      team: "garden",
      size: 0.6,
      points: [
        [10, 10],
        [20, 10],
        [30, 10],
        [40, 10],
      ],
    });
    const farStrokeId = store.addStroke({
      team: "exit",
      size: 0.6,
      points: [
        [10, 40],
        [20, 40],
        [30, 40],
        [40, 40],
      ],
    });
    const labelId = store.addLabel({ team: "garden", x: 60, y: 30, text: "Fog machine" });
    return { store, strokeId, farStrokeId, labelId };
  }

  it("returns the nearest stroke id within 1 foot of a segment", () => {
    const { store, strokeId } = storeWithMarks();
    // Between sample points, 0.8 ft below the segment.
    expect(hitTestMark(store.getState(), [25, 10.8])).toBe(strokeId);
  });

  it("returns null when nothing is within the radius", () => {
    const { store } = storeWithMarks();
    expect(hitTestMark(store.getState(), [25, 12])).toBeNull();
    expect(hitTestMark(store.getState(), [25, 25])).toBeNull();
  });

  it("prefers the closest mark when several are in range", () => {
    const { store, farStrokeId } = storeWithMarks();
    expect(hitTestMark(store.getState(), [25, 39.5])).toBe(farStrokeId);
    expect(hitTestMark(store.getState(), [25, 25], 20)).not.toBeNull();
  });

  it("finds a label by its position", () => {
    const { store, labelId } = storeWithMarks();
    expect(hitTestMark(store.getState(), [60.5, 30.5])).toBe(labelId);
    expect(hitTestMark(store.getState(), [62, 30])).toBeNull();
  });

  it("honors a custom radius", () => {
    const { store, strokeId } = storeWithMarks();
    expect(hitTestMark(store.getState(), [25, 12], 3)).toBe(strokeId);
  });
});
