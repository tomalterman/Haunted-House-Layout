import { describe, it, expect } from "vitest";
import { FLOORPLAN } from "../src/floorplan.js";
import { TEAMS, teamById } from "../src/teams.js";
import { pointInPolygon, distancePointToSegment } from "../src/geometry.js";

const inBounds = ([x, y]) =>
  x >= 0 && x <= FLOORPLAN.bounds.w && y >= 0 && y <= FLOORPLAN.bounds.h;

describe("teams", () => {
  it("exports six teams in walk order with ids, names, and colors", () => {
    expect(TEAMS).toHaveLength(6);
    expect(TEAMS.map((t) => t.id)).toEqual([
      "poison-breakfast",
      "hallway-library",
      "lost-found",
      "schoolyard",
      "garden",
      "exit",
    ]);
    for (const team of TEAMS) {
      expect(team.name).toMatch(/\S/);
      expect(team.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("looks a team up by id and returns undefined for unknown ids", () => {
    expect(teamById("garden")).toMatchObject({ name: "Garden", color: "#D99A12" });
    expect(teamById("nope")).toBeUndefined();
  });
});

describe("floor plan", () => {
  it("is an 85 by 60 foot gym with 8 foot walls under a 24 foot ceiling", () => {
    expect(FLOORPLAN.bounds).toEqual({ w: 85, h: 60 });
    expect(FLOORPLAN.wallHeight).toBe(8);
    expect(FLOORPLAN.ceiling).toBe(24);
  });

  it("has at least 9 wall segments, each 0.3 feet thick and inside the gym", () => {
    expect(FLOORPLAN.walls.length).toBeGreaterThanOrEqual(9);
    for (const wall of FLOORPLAN.walls) {
      expect(wall.id).toMatch(/\S/);
      expect(wall.thickness).toBe(0.3);
      expect(inBounds(wall.a)).toBe(true);
      expect(inBounds(wall.b)).toBe(true);
    }
    const ids = FLOORPLAN.walls.map((w) => w.id);
    expect(ids).toContain("diagonal");
    expect(FLOORPLAN.walls.find((w) => w.id === "diagonal")).toMatchObject({
      a: [20, 36],
      b: [60, 12],
    });
  });

  it("has six 10 foot tents in an entrance block and an exit block, not in the wall list", () => {
    expect(FLOORPLAN.tents).toHaveLength(6);
    const blocks = new Set(FLOORPLAN.tents.map((t) => t.block));
    expect(blocks).toEqual(new Set(["entrance", "exit"]));
    expect(FLOORPLAN.tents.filter((t) => t.block === "entrance")).toHaveLength(3);
    expect(FLOORPLAN.tents.filter((t) => t.block === "exit")).toHaveLength(3);
    for (const tent of FLOORPLAN.tents) {
      expect(tent.size).toBe(10);
      expect(inBounds([tent.x, tent.y])).toBe(true);
      expect(inBounds([tent.x + tent.size, tent.y + tent.size])).toBe(true);
    }
    const wallIds = FLOORPLAN.walls.map((w) => w.id);
    for (const tent of FLOORPLAN.tents) expect(wallIds).not.toContain(tent.id);
  });

  it("has a stage behind the pony wall, an entrance on the left, and an exit at top right", () => {
    expect(FLOORPLAN.stage).toEqual({ x: 20, y: 56, w: 50, h: 4 });
    expect(FLOORPLAN.entrance.x).toBe(0);
    expect(FLOORPLAN.exit.x + FLOORPLAN.exit.w).toBe(FLOORPLAN.bounds.w);
    expect(FLOORPLAN.exit.y).toBeLessThan(FLOORPLAN.bounds.h / 2);
  });

  it("has a visitor path from the entrance to the exit", () => {
    const { path, entrance, exit } = FLOORPLAN;
    expect(path.length).toBeGreaterThanOrEqual(2);
    const [sx, sy] = path[0];
    expect(sx).toBe(entrance.x);
    expect(sy).toBeGreaterThanOrEqual(entrance.y);
    expect(sy).toBeLessThanOrEqual(entrance.y + entrance.h);
    const [ex, ey] = path[path.length - 1];
    expect(ex).toBe(exit.x);
    expect(ey).toBeGreaterThanOrEqual(exit.y);
    expect(ey).toBeLessThanOrEqual(exit.y + exit.h);
    for (const p of path) expect(inBounds(p)).toBe(true);
  });

  it("names five regions in walk order with every point inside the gym", () => {
    expect(FLOORPLAN.regions.map((r) => r.id)).toEqual([
      "entrance-tents",
      "diagonal-corridor",
      "serpentine",
      "right-corridor",
      "exit-tents",
    ]);
    for (const region of FLOORPLAN.regions) {
      expect(region.name).toMatch(/\S/);
      expect(region.points.length).toBeGreaterThanOrEqual(3);
      for (const p of region.points) expect(inBounds(p)).toBe(true);
    }
  });

  it("keeps the regions from overlapping each other", () => {
    // Regions may share edges but no region's interior sample may fall in another.
    const samples = [];
    for (let x = 0.5; x < FLOORPLAN.bounds.w; x += 1) {
      for (let y = 0.5; y < FLOORPLAN.bounds.h; y += 1) samples.push([x, y]);
    }
    for (const p of samples) {
      const owners = FLOORPLAN.regions.filter((r) => pointInPolygon(p, r.points));
      expect(owners.length, `point ${p} is in ${owners.map((r) => r.id)}`).toBeLessThanOrEqual(1);
    }
  });

  it("places the entrance tent block inside a rectangle over it and the stage outside", () => {
    const entranceTents = FLOORPLAN.tents.filter((t) => t.block === "entrance");
    const minX = Math.min(...entranceTents.map((t) => t.x));
    const minY = Math.min(...entranceTents.map((t) => t.y));
    const maxX = Math.max(...entranceTents.map((t) => t.x + t.size));
    const maxY = Math.max(...entranceTents.map((t) => t.y + t.size));
    const rect = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
    const tent = entranceTents[0];
    const insideTent = [tent.x + tent.size / 2, tent.y + tent.size / 2];
    const onStage = [FLOORPLAN.stage.x + 25, FLOORPLAN.stage.y + 2];
    expect(pointInPolygon(insideTent, rect)).toBe(true);
    expect(pointInPolygon(onStage, rect)).toBe(false);
  });
});

describe("visitor path clearance", () => {
  it("clears every wall by at least half a foot along its whole length", () => {
    const { path, walls } = FLOORPLAN;
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const pt = [ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps];
        // Outer walls carry the door openings the path passes through.
        for (const wall of walls.filter((w) => !w.id.startsWith("outer-"))) {
          const d = distancePointToSegment(pt, wall.a, wall.b);
          expect(d, `path segment ${i} at ${pt} vs ${wall.id}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });
});

