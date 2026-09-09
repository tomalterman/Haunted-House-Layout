import { describe, it, expect } from "vitest";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import * as Y from "yjs";
import { createStore } from "../src/store.js";
import { FLOORPLAN } from "../src/floorplan.js";
import { TEAMS } from "../src/teams.js";
import { createFloorTexture, PX_PER_FOOT } from "../src/walk/floor-texture.js";

// Ram Board tan base of the texture.
const TAN = [0xc9, 0xa8, 0x6c];

function setup() {
  const store = createStore({ doc: new Y.Doc() });
  const texture = createFloorTexture({
    store,
    floorplan: FLOORPLAN,
    teams: TEAMS,
    createCanvas,
    Path2DCtor: Path2D,
  });
  const ctx = texture.canvas.getContext("2d");
  return { store, texture, ctx };
}

function pixel(ctx, x, y) {
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

function maxChannelDiff(rgba) {
  return Math.max(Math.abs(rgba[0] - TAN[0]), Math.abs(rgba[1] - TAN[1]), Math.abs(rgba[2] - TAN[2]));
}

// "Tan" allows the faint 5 foot grid lines, which darken the base only slightly.
const isTan = (rgba) => rgba[3] === 255 && maxChannelDiff(rgba) <= 20;
const isMarked = (rgba) => maxChannelDiff(rgba) > 30;

// Every pixel in a (2r+1)^2 window around (x, y).
function window(ctx, x, y, r = 2) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push(pixel(ctx, x + dx, y + dy));
  return out;
}

// A short horizontal stroke centered on feet (x, y), 2 feet long.
function strokeAt(store, team, x, y) {
  return store.addStroke({
    team,
    size: 0.6,
    points: [
      [x - 1, y],
      [x - 0.5, y],
      [x, y],
      [x + 0.5, y],
      [x + 1, y],
    ],
    pointerType: "touch",
  });
}

describe("createFloorTexture", () => {
  it("makes a 1700 by 1200 canvas at 20 pixels per foot", () => {
    const { texture } = setup();
    expect(PX_PER_FOOT).toBe(20);
    expect(texture.width).toBe(1700);
    expect(texture.height).toBe(1200);
    expect(texture.canvas.width).toBe(1700);
    expect(texture.canvas.height).toBe(1200);
  });

  it("paints a stroke at feet (10, 10) near texture (200, 200) and only tan near (1000, 800)", () => {
    const { store, texture, ctx } = setup();
    strokeAt(store, "poison-breakfast", 10, 10);
    texture.draw();

    expect(window(ctx, 200, 200).some(isMarked)).toBe(true);
    expect(window(ctx, 1000, 800).every(isTan)).toBe(true);
    // The team color itself lands on the stroke, at full opacity.
    const center = pixel(ctx, 200, 200);
    expect(center.slice(0, 3)).toEqual([0x3a, 0x9d, 0x4f]);
  });

  it("tints pixels inside a zone over the entrance tents and not outside", () => {
    const { store, texture, ctx } = setup();
    store.setZone({
      name: "Entrance tents",
      team: "hallway-library",
      points: [
        [0, 36],
        [20, 36],
        [20, 56],
        [0, 56],
      ],
    });
    texture.draw();

    const inside = pixel(ctx, 10 * PX_PER_FOOT + 3, 46 * PX_PER_FOOT + 3);
    const outside = pixel(ctx, 40 * PX_PER_FOOT + 3, 10 * PX_PER_FOOT + 3);
    expect(isMarked(inside)).toBe(true);
    expect(isTan(outside)).toBe(true);
    // 35 percent alpha: the tint sits between tan and the team blue, not at either.
    expect(inside[2]).toBeGreaterThan(TAN[2]);
    expect(inside[2]).toBeLessThan(0xbf);
  });

  it("omits a hidden team's strokes and labels", () => {
    const { store, texture, ctx } = setup();
    strokeAt(store, "garden", 10, 10);
    store.addLabel({ team: "garden", x: 30, y: 30, text: "Garden" });
    strokeAt(store, "exit", 50, 10);
    store.setTeamVisible("garden", false);
    texture.draw();

    expect(window(ctx, 200, 200).every(isTan)).toBe(true);
    // Label band: 1.5 foot cap height around y = 30 feet, text starting at x = 30 feet.
    let labelMarked = false;
    for (let y = 585; y <= 615 && !labelMarked; y += 3) {
      for (let x = 600; x <= 800; x += 3) {
        if (isMarked(pixel(ctx, x, y))) {
          labelMarked = true;
          break;
        }
      }
    }
    expect(labelMarked).toBe(false);
    // The visible team's stroke still paints.
    expect(window(ctx, 1000, 200).some(isMarked)).toBe(true);

    store.setTeamVisible("garden", true);
    texture.draw();
    expect(window(ctx, 200, 200).some(isMarked)).toBe(true);
  });

  it("paints a label at feet (10, 10) within a 1.5 foot band around y = 10", () => {
    const { store, texture, ctx } = setup();
    store.addLabel({ team: "schoolyard", x: 10, y: 10, text: "Garden" });
    texture.draw();

    // Cap height 1.5 feet = 30 px, centered on y = 200 px (textBaseline middle).
    let inBand = 0;
    for (let y = 185; y <= 215; y += 2) {
      for (let x = 200; x <= 400; x += 2) {
        if (isMarked(pixel(ctx, x, y))) inBand += 1;
      }
    }
    expect(inBand).toBeGreaterThan(20);
    // Well above and below the band there is only floor.
    for (let x = 200; x <= 400; x += 4) {
      expect(isTan(pixel(ctx, x, 150))).toBe(true);
      expect(isTan(pixel(ctx, x, 250))).toBe(true);
    }
  });

  it("drawIfDirty draws once after two store changes and not again until the next change", () => {
    const { store, texture } = setup();
    // Fresh texture: nothing drawn yet, so the first call draws.
    expect(texture.drawIfDirty()).toBe(true);
    expect(texture.drawIfDirty()).toBe(false);

    strokeAt(store, "garden", 10, 10);
    store.addLabel({ team: "garden", x: 30, y: 30, text: "Garden" });
    expect(texture.drawIfDirty()).toBe(true);
    expect(texture.drawIfDirty()).toBe(false);
    expect(texture.drawIfDirty()).toBe(false);

    store.setTeamVisible("garden", false);
    expect(texture.drawIfDirty()).toBe(true);
    expect(texture.drawIfDirty()).toBe(false);

    texture.markDirty();
    expect(texture.drawIfDirty()).toBe(true);
  });

  it("stops listening after destroy", () => {
    const { store, texture } = setup();
    texture.drawIfDirty();
    texture.destroy();
    strokeAt(store, "garden", 10, 10);
    expect(texture.drawIfDirty()).toBe(false);
  });
});

describe("pen pressure parity with the map", () => {
  it("renders a pressure-varying stroke the same way the map does", async () => {
    const { strokeOutline } = await import("../src/stroke-outline.js");
    // A pen stroke: pressure rises along its length, so the outline is not
    // uniform. The texture must use the same outline the map draws.
    const stroke = {
      id: "p1",
      team: "garden",
      size: 0.6,
      points: [200, 200, 240, 200, 280, 200, 320, 200],
      pressure: [0.1, 0.4, 0.8, 1],
    };
    const withPressure = strokeOutline(stroke);
    const withoutPressure = strokeOutline(stroke.points, stroke.size);
    expect(withPressure, "pen stroke produces an outline").not.toBeNull();
    expect(
      JSON.stringify(withPressure),
      "honoring pressure differs from ignoring it, so the texture must pass the whole stroke",
    ).not.toEqual(JSON.stringify(withoutPressure));
  });
});
