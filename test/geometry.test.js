import { describe, it, expect } from "vitest";
import {
  pointInPolygon,
  distancePointToSegment,
  snapPoint,
  slideCircleAlongWalls,
  zoneAt,
  wallEndpoints,
} from "../src/geometry.js";
import { FLOORPLAN } from "../src/floorplan.js";

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const diagonal = FLOORPLAN.walls.filter((w) => w.id === "diagonal");
const RADIUS = 0.75;
// The circle rests where its edge meets the wall's face: radius plus half the thickness.
const CLEARANCE = RADIUS + 0.3 / 2;

const distToDiagonal = (p) => distancePointToSegment(p, diagonal[0].a, diagonal[0].b);
// Sign of the cross product tells which side of the diagonal line a point is on.
const sideOfDiagonal = ([x, y]) => {
  const [ax, ay] = diagonal[0].a;
  const [bx, by] = diagonal[0].b;
  return Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
};
// Unit vectors along and across the diagonal wall (20,36) -> (60,12).
const len = Math.hypot(40, -24);
const along = [40 / len, -24 / len];
const normal = [24 / len, 40 / len];

describe("pointInPolygon", () => {
  it("tells inside from outside", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
    expect(pointInPolygon([5, -1], square)).toBe(false);
  });

  it("returns a boolean on a vertex and on an edge without throwing", () => {
    // Boundary points follow the half-open ray-casting rule: the left edge of
    // an axis-aligned square counts as inside, the right edge as outside.
    expect(typeof pointInPolygon([0, 0], square)).toBe("boolean");
    expect(typeof pointInPolygon([10, 10], square)).toBe("boolean");
    expect(pointInPolygon([0, 5], square)).toBe(true);
    expect(pointInPolygon([10, 5], square)).toBe(false);
    expect(pointInPolygon([0, 5], square)).toBe(pointInPolygon([0, 5], square));
  });

  it("handles concave polygons", () => {
    const lShape = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(pointInPolygon([2, 8], lShape)).toBe(true);
    expect(pointInPolygon([8, 8], lShape)).toBe(false);
  });
});

describe("distancePointToSegment", () => {
  it("measures to the nearest point on the segment, clamped to its ends", () => {
    expect(distancePointToSegment([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    expect(distancePointToSegment([-4, 3], [0, 0], [10, 0])).toBeCloseTo(5);
    expect(distancePointToSegment([13, 4], [0, 0], [10, 0])).toBeCloseTo(5);
    expect(distancePointToSegment([2, 2], [3, 3], [3, 3])).toBeCloseTo(Math.SQRT2);
  });
});

describe("snapPoint", () => {
  it("prefers an anchor within 1.5 feet over the grid", () => {
    expect(snapPoint([20.9, 35.4], { anchors: [[20, 36]] })).toEqual([20, 36]);
  });

  it("falls back to the 1 foot grid when no anchor is near", () => {
    expect(snapPoint([22.6, 39.4], { anchors: [[20, 36]] })).toEqual([23, 39]);
    expect(snapPoint([22.6, 39.4])).toEqual([23, 39]);
  });

  it("picks the nearest anchor when several are in range", () => {
    expect(snapPoint([1.2, 0], { anchors: [[0, 0], [2, 0]] })).toEqual([2, 0]);
  });

  it("honours a custom grid and radius", () => {
    expect(snapPoint([3.2, 3.9], { grid: 2, anchors: [[4, 3]], radius: 0.5 })).toEqual([4, 4]);
    expect(snapPoint([3.2, 3.9], { grid: 2, anchors: [[4, 3]], radius: 1.5 })).toEqual([4, 3]);
  });
});

describe("slideCircleAlongWalls", () => {
  const start = [40, 30]; // below the diagonal, clear of the other walls

  it("returns the same position for a zero delta", () => {
    expect(slideCircleAlongWalls(start, [0, 0], RADIUS, FLOORPLAN.walls)).toEqual(start);
  });

  it("stops short of the diagonal wall when moving straight into it", () => {
    const before = distToDiagonal(start);
    const delta = [-normal[0] * 10, -normal[1] * 10];
    const end = slideCircleAlongWalls(start, delta, RADIUS, diagonal);
    expect(distToDiagonal(end)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    expect(distToDiagonal(end)).toBeLessThan(CLEARANCE + 0.05);
    expect(distToDiagonal(end)).toBeLessThan(before);
    expect(sideOfDiagonal(end)).toBe(sideOfDiagonal(start));
  });

  it("passes freely when moving parallel to the wall", () => {
    const delta = [along[0] * 3, along[1] * 3];
    const end = slideCircleAlongWalls(start, delta, RADIUS, diagonal);
    expect(end[0]).toBeCloseTo(start[0] + delta[0], 6);
    expect(end[1]).toBeCloseTo(start[1] + delta[1], 6);
  });

  it("substeps a 3 foot delta in one call and still stops at the wall", () => {
    // Begin 2 feet from the wall so a single 3 foot step would tunnel through it.
    const near = [start[0] - normal[0] * (distToDiagonal(start) - 2), start[1] - normal[1] * (distToDiagonal(start) - 2)];
    expect(distToDiagonal(near)).toBeCloseTo(2, 6);
    const delta = [-normal[0] * 3, -normal[1] * 3];
    const end = slideCircleAlongWalls(near, delta, RADIUS, diagonal);
    expect(sideOfDiagonal(end)).toBe(sideOfDiagonal(near));
    expect(distToDiagonal(end)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    expect(distToDiagonal(end)).toBeLessThan(CLEARANCE + 0.05);
  });

  it("slides along the wall when moving at an angle into it", () => {
    // Push into the wall and along it at once: the along component survives.
    const delta = [along[0] * 2 - normal[0] * 10, along[1] * 2 - normal[1] * 10];
    const end = slideCircleAlongWalls(start, delta, RADIUS, diagonal);
    const travelled = (end[0] - start[0]) * along[0] + (end[1] - start[1]) * along[1];
    expect(travelled).toBeGreaterThan(1.5);
    expect(distToDiagonal(end)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
  });

  it("does not tunnel through a wall with a huge delta against the whole plan", () => {
    const end = slideCircleAlongWalls([25, 45], [40, 0], RADIUS, FLOORPLAN.walls);
    // Partition at x 30 runs y 30 to 50; the walker must stay on its left.
    expect(end[0]).toBeLessThan(30 - CLEARANCE + 1e-6);
    expect(end[0]).toBeGreaterThan(25);
  });
});

describe("zoneAt", () => {
  const older = { id: "a", points: [[0, 0], [10, 0], [10, 10], [0, 10]], createdAt: 1 };
  const newer = { id: "b", points: [[5, 5], [15, 5], [15, 15], [5, 15]], createdAt: 2 };

  it("returns the newest zone when two overlap", () => {
    expect(zoneAt([7, 7], [older, newer])).toBe(newer);
    expect(zoneAt([7, 7], [newer, older])).toBe(newer);
  });

  it("returns the only containing zone and null outside every zone", () => {
    expect(zoneAt([2, 2], [older, newer])).toBe(older);
    expect(zoneAt([20, 20], [older, newer])).toBeNull();
    expect(zoneAt([2, 2], [])).toBeNull();
  });
});

describe("wallEndpoints", () => {
  it("returns each endpoint once", () => {
    const walls = [
      { a: [0, 0], b: [10, 0] },
      { a: [10, 0], b: [10, 10] },
    ];
    expect(wallEndpoints(walls)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it("covers the floor plan's wall corners", () => {
    const points = wallEndpoints(FLOORPLAN.walls);
    expect(points).toContainEqual([20, 36]);
    expect(points).toContainEqual([60, 12]);
    expect(points).toContainEqual([0, 0]);
  });
});
