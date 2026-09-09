import { describe, it, expect } from "vitest";
import { FLOORPLAN } from "../src/floorplan.js";
import { distancePointToSegment } from "../src/geometry.js";
import { createWalker, nearestFreeSpot, formatClock } from "../src/walk/walk-controls.js";

const RADIUS = 0.75;
const HALF_THICKNESS = 0.15;
const CLEARANCE = RADIUS + HALF_THICKNESS;
const EAST = -Math.PI / 2; // yaw facing +x on the map (see walk-controls.js)
const diagonal = FLOORPLAN.walls.find((w) => w.id === "diagonal");

const region = (id) => FLOORPLAN.regions.find((r) => r.id === id);
const zoneFrom = (id, createdAt) => ({ id, name: region(id).name, team: "garden", points: region(id).points, createdAt });

function minWallDistance(point) {
  return Math.min(...FLOORPLAN.walls.map((w) => distancePointToSegment(point, w.a, w.b)));
}

function walker(start, zones = []) {
  return createWalker({ floorplan: FLOORPLAN, getZones: () => zones, start });
}

describe("createWalker movement", () => {
  it("moves 3 feet along the facing direction after 1 second of full forward", () => {
    // Open floor: (40, 30) is more than 2 feet from every wall.
    const w = walker([40, 30]);
    const before = w.position;
    const { position } = w.step({ forward: 1, strafe: 0 }, 1);
    // yaw 0 faces decreasing map y (up the sketch), like three's camera at rotation.y = 0.
    expect(position[0]).toBeCloseTo(before[0], 6);
    expect(position[1]).toBeCloseTo(before[1] - 3, 6);
  });

  it("moves along +x when facing east and strafes to the right", () => {
    // (45, 30) has more than 4 feet of open floor on every side.
    const w = walker([45, 30]);
    w.look(EAST, 0);
    let out = w.step({ forward: 1, strafe: 0 }, 0.5);
    expect(out.position[0]).toBeCloseTo(46.5, 6);
    expect(out.position[1]).toBeCloseTo(30, 6);
    // Facing east, "right" is increasing map y (down the sketch).
    out = w.step({ forward: 0, strafe: 1 }, 0.5);
    expect(out.position[0]).toBeCloseTo(46.5, 6);
    expect(out.position[1]).toBeCloseTo(31.5, 6);
  });

  it("stops at the diagonal wall and keeps sliding along it", () => {
    // 2 feet below the diagonal at x = 40 (the wall passes through (40, 24)).
    const w = walker([40, 26]);
    const { position } = w.step({ forward: 1, strafe: 0 }, 1);
    // Unobstructed it would reach (40, 23), on the far side of the wall.
    expect(position[1]).toBeGreaterThan(23.5);
    expect(distancePointToSegment(position, diagonal.a, diagonal.b)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    // Pushing straight up into a wall that runs up-and-right slides us along it.
    expect(position[0]).toBeGreaterThan(40.5);
    // Keep pushing: still sliding, still clear of the wall.
    const next = w.step({ forward: 1, strafe: 0 }, 1).position;
    expect(next[0]).toBeGreaterThan(position[0]);
    expect(distancePointToSegment(next, diagonal.a, diagonal.b)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
  });

  it("uses a magnitude of at most 1 for the joystick vector", () => {
    const w = walker([40, 30]);
    const { position } = w.step({ forward: 1, strafe: 1 }, 1);
    const moved = Math.hypot(position[0] - 40, position[1] - 30);
    expect(moved).toBeLessThanOrEqual(3 + 1e-9);
    expect(moved).toBeGreaterThan(2.9);
  });
});

describe("createWalker zones and clock", () => {
  it("reports the zone change when crossing from the entrance tents into the diagonal corridor", () => {
    const zones = [zoneFrom("entrance-tents", 1), zoneFrom("diagonal-corridor", 2)];
    const w = walker([15, 41], zones);
    w.look(EAST, 0);
    const first = w.step({ forward: 0, strafe: 0 }, 0.1);
    expect(first.zone?.id).toBe("entrance-tents");
    let lastElapsed = first.elapsed;
    let out;
    for (let i = 0; i < 6; i++) {
      out = w.step({ forward: 1, strafe: 0 }, 0.5);
      expect(out.elapsed).toBeGreaterThan(lastElapsed);
      lastElapsed = out.elapsed;
    }
    expect(out.position[0]).toBeGreaterThan(20);
    expect(out.zone?.id).toBe("diagonal-corridor");
    expect(out.elapsed).toBeCloseTo(3.1, 6);
  });

  it("reports null outside every zone", () => {
    expect(walker([40, 30], []).step({ forward: 0, strafe: 0 }, 0.1).zone).toBeNull();
    const zones = [zoneFrom("exit-tents", 1)];
    expect(walker([40, 30], zones).step({ forward: 0, strafe: 0 }, 0.1).zone).toBeNull();
  });

  it("clamps pitch to plus or minus 80 degrees", () => {
    const w = walker([40, 30]);
    const limit = (80 * Math.PI) / 180;
    w.look(0, 10);
    expect(w.pitch).toBeCloseTo(limit, 9);
    w.look(0, -20);
    expect(w.pitch).toBeCloseTo(-limit, 9);
    expect(w.step({ forward: 0, strafe: 0 }, 0.1).pitch).toBeCloseTo(-limit, 9);
  });

  it("changes nothing for dt 0", () => {
    const w = walker([40, 30]);
    const out = w.step({ forward: 1, strafe: 1 }, 0);
    expect(out.position).toEqual([40, 30]);
    expect(out.elapsed).toBe(0);
    expect(w.elapsed).toBe(0);
  });

  it("resets to the start point and zero elapsed", () => {
    const w = walker([40, 30]);
    w.step({ forward: 1, strafe: 0 }, 1);
    w.look(1, 0.5);
    w.reset();
    expect(w.position).toEqual([40, 30]);
    expect(w.elapsed).toBe(0);
    expect(w.pitch).toBe(0);
    w.setStart([45, 30]);
    expect(w.position).toEqual([45, 30]);
  });
});

describe("nearestFreeSpot", () => {
  it("nudges a point on the diagonal wall to a free spot within 3 feet", () => {
    const onWall = [40, 24];
    const free = nearestFreeSpot(onWall, FLOORPLAN, RADIUS);
    expect(minWallDistance(free)).toBeGreaterThanOrEqual(RADIUS);
    expect(Math.hypot(free[0] - onWall[0], free[1] - onWall[1])).toBeLessThanOrEqual(3);
  });

  it("returns a free point unchanged", () => {
    expect(nearestFreeSpot([40, 30], FLOORPLAN, RADIUS)).toEqual([40, 30]);
  });

  it("nudges the entrance door point on the outer wall inside the gym", () => {
    const free = nearestFreeSpot(FLOORPLAN.path[0], FLOORPLAN, RADIUS);
    expect(free[0]).toBeGreaterThanOrEqual(RADIUS);
    expect(minWallDistance(free)).toBeGreaterThanOrEqual(RADIUS);
  });

  it("starts the walker at the nudged spot when the start is inside a wall", () => {
    const w = walker([40, 24]);
    expect(minWallDistance(w.position)).toBeGreaterThanOrEqual(RADIUS);
    w.setStart([30, 40]); // on partition-1
    expect(minWallDistance(w.position)).toBeGreaterThanOrEqual(RADIUS);
  });
});

describe("formatClock", () => {
  it("formats seconds as m:ss", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59.9)).toBe("0:59");
    expect(formatClock(600)).toBe("10:00");
  });
});

describe("solid volumes block movement", () => {
  it("keeps the walker off the stage platform, including around the pony wall", () => {
    // The pony wall only fronts the stage to x=70, so a walker can round its
    // end. At 4 foot eye height the stage top is exactly underfoot, so walking
    // onto it reads as sliding through the platform.
    const stage = FLOORPLAN.stage;
    const inStage = ([x, y]) =>
      x >= stage.x && x <= stage.x + stage.w && y >= stage.y && y <= stage.y + stage.h;
    const walker = createWalker({ floorplan: FLOORPLAN, getZones: () => [], start: [75, 50] });
    for (let i = 0; i < 60; i++) walker.step({ forward: -1, strafe: 0 }, 1 / 15);
    walker.look(Math.PI / 2, 0);
    for (let i = 0; i < 200; i++) walker.step({ forward: 1, strafe: 0 }, 1 / 15);
    expect(inStage(walker.position), `walker ended at ${walker.position}`).toBe(false);
  });

  it("still reaches every point on the visitor path", () => {
    const walker = createWalker({ floorplan: FLOORPLAN, getZones: () => [], start: FLOORPLAN.path[0] });
    for (const point of FLOORPLAN.path) {
      walker.setStart(point);
      const [x, y] = walker.position;
      expect(Math.hypot(x - point[0], y - point[1]), `path point ${point} stays walkable`).toBeLessThan(2);
    }
  });
});
