import { describe, it, expect } from "vitest";
import { FLOORPLAN } from "../src/floorplan.js";
import { TEAMS } from "../src/teams.js";
import { slideCircleAlongWalls, distancePointToSegment } from "../src/geometry.js";
import {
  WALL_TEAM,
  WALL_COLOR,
  WALL_SWATCH,
  isNearBlack,
  isWallTeam,
  isWallStroke,
  markColor,
  strokeToWallSegments,
  wallSegmentsFromStrokes,
  hauntCoverPolygons,
  combineCollisionWalls,
} from "../src/stroke-walls.js";

function storedStroke(id, team, feetPoints, size = 0.6) {
  const points = [];
  for (const [x, y] of feetPoints) {
    points.push(Math.round(x * 20), Math.round(y * 20));
  }
  return { id, team, size, points };
}

const straightWall = storedStroke(
  "w1",
  WALL_TEAM,
  [
    [10, 20],
    [12, 20],
    [14, 20],
    [16, 20],
    [18, 20],
    [20, 20],
  ],
  0.8,
);

describe("wall stroke identity", () => {
  it("treats the Walls swatch and near-black ink as walls, not team colors", () => {
    expect(WALL_SWATCH.id).toBe("walls");
    expect(isWallTeam(WALL_TEAM)).toBe(true);
    expect(isWallTeam("poison-breakfast")).toBe(false);
    expect(isNearBlack(WALL_COLOR)).toBe(true);
    expect(isNearBlack("#111")).toBe(true);
    expect(isNearBlack("#000000")).toBe(true);
    expect(isNearBlack("#3A9D4F")).toBe(false);
    expect(isNearBlack(TEAMS[0].color)).toBe(false);
  });

  it("classifies wall-team and black-hex strokes as walls; team marks stay paint", () => {
    expect(isWallStroke(straightWall, TEAMS)).toBe(true);
    expect(isWallStroke(storedStroke("hex", "#111111", [[0, 0], [1, 0]]), TEAMS)).toBe(true);
    expect(isWallStroke(storedStroke("g", "poison-breakfast", [[0, 0], [1, 0]]), TEAMS)).toBe(false);
    expect(isWallStroke(storedStroke("b", "hallway-library", [[0, 0], [1, 0]]), TEAMS)).toBe(false);
  });

  it("resolves Walls ink to black and team ids to their board colors", () => {
    expect(markColor(WALL_TEAM, TEAMS).toLowerCase()).toBe(WALL_COLOR.toLowerCase());
    expect(markColor("poison-breakfast", TEAMS)).toBe("#3A9D4F");
    expect(markColor("unknown-team", TEAMS)).toBe("#888888");
  });
});

describe("strokeToWallSegments", () => {
  it("turns a thick black polyline into centerline wall segments with that thickness", () => {
    const segments = strokeToWallSegments(straightWall);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    for (const s of segments) {
      expect(s.thickness).toBeCloseTo(0.8, 6);
      expect(s.strokeId).toBe("w1");
      expect(s.a).toHaveLength(2);
      expect(s.b).toHaveLength(2);
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    expect(first.a[0]).toBeCloseTo(10, 1);
    expect(first.a[1]).toBeCloseTo(20, 1);
    expect(last.b[0]).toBeCloseTo(20, 1);
    expect(last.b[1]).toBeCloseTo(20, 1);
    const total = segments.reduce((n, s) => n + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 0);
    expect(total).toBeGreaterThan(9);
    expect(total).toBeLessThan(11);
  });

  it("returns no segments for a one-point or empty stroke", () => {
    expect(strokeToWallSegments(storedStroke("short", WALL_TEAM, [[10, 10]]))).toEqual([]);
    expect(strokeToWallSegments({ id: "empty", team: WALL_TEAM, size: 0.6, points: [] })).toEqual([]);
  });

  it("accepts already-decoded feet pairs as well as stored twentieths", () => {
    const segments = strokeToWallSegments({
      id: "feet",
      team: WALL_TEAM,
      size: 0.6,
      points: [
        [5, 5],
        [8, 5],
      ],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].a[0]).toBeCloseTo(5, 6);
    expect(segments[0].b[0]).toBeCloseTo(8, 6);
  });
});

describe("wallSegmentsFromStrokes", () => {
  it("keeps only visible wall strokes", () => {
    const paint = storedStroke("p", "garden", [
      [30, 30],
      [40, 30],
    ]);
    const hidden = storedStroke("h", WALL_TEAM, [
      [1, 1],
      [8, 1],
    ]);
    const visible = straightWall;
    const segments = wallSegmentsFromStrokes([paint, hidden, visible], {
      hidden: new Set([WALL_TEAM]),
      teams: TEAMS,
    });
    expect(segments.every((s) => s.strokeId === "w1" || s.strokeId === "h")).toBe(true);
    // Hidden wall stroke is omitted; the visible one is too because Walls is hidden.
    expect(segments).toEqual([]);

    const shown = wallSegmentsFromStrokes([paint, visible], { hidden: new Set(), teams: TEAMS });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((s) => s.strokeId === "w1")).toBe(true);
  });
});

describe("hauntCoverPolygons", () => {
  it("covers every named haunt region so the corridor is not open gym", () => {
    const covers = hauntCoverPolygons(FLOORPLAN);
    expect(covers.length).toBe(FLOORPLAN.regions.length);
    const ids = covers.map((c) => c.id);
    for (const region of FLOORPLAN.regions) {
      expect(ids.some((id) => id.includes(region.id))).toBe(true);
    }
    for (const cover of covers) {
      expect(cover.points.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("combineCollisionWalls", () => {
  it("appends stroke walls to the floor plan collision set, including solids", () => {
    const extra = strokeToWallSegments(straightWall);
    const walls = combineCollisionWalls(FLOORPLAN, extra);
    expect(walls.length).toBe(FLOORPLAN.collisionWalls.length + extra.length);
    expect(walls).toEqual(expect.arrayContaining(extra));
    expect(walls.some((w) => w.id === "stage-edge-0")).toBe(true);
  });
});

describe("collision against stroke walls", () => {
  it("stops a 0.75 foot circle walking into a black stroke wall", () => {
    const segments = strokeToWallSegments(straightWall);
    const walls = combineCollisionWalls({ walls: [], collisionWalls: [] }, segments);
    const start = [15, 22];
    const resolved = slideCircleAlongWalls(start, [0, -4], 0.75, walls);
    expect(resolved[1]).toBeGreaterThan(20);
    expect(distancePointToSegment(resolved, [10, 20], [20, 20])).toBeGreaterThanOrEqual(0.75 + 0.4 - 1e-6);
    // Parallel to the wall still moves.
    const along = slideCircleAlongWalls([15, 23], [3, 0], 0.75, walls);
    expect(along[0]).toBeGreaterThan(17);
  });
});
