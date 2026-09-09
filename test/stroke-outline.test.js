import { describe, it, expect } from "vitest";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import {
  strokeOutline,
  drawOutline,
  drawLabel,
  strokeBounds,
  labelFont,
  LABEL_CAP_HEIGHT_FEET,
} from "../src/stroke-outline.js";

// Points are stored as integer twentieths of a foot, matching the shared store.
function feetToStored(x, y) {
  return [Math.round(x * 20), Math.round(y * 20)];
}

describe("strokeOutline", () => {
  it("returns a closed outline with more points than a 3 point input", () => {
    const points = [feetToStored(1, 1), feetToStored(3, 1), feetToStored(5, 1)];
    const outline = strokeOutline(points, 0.6);
    expect(outline).not.toBeNull();
    expect(outline.length).toBeGreaterThan(points.length);
    const [firstX, firstY] = outline[0];
    const [lastX, lastY] = outline[outline.length - 1];
    const dist = Math.hypot(firstX - lastX, firstY - lastY);
    // Either exactly closed, or close enough that ctx.closePath() bridges the gap.
    expect(dist).toBeLessThan(0.5);
  });

  it("returns null for fewer than 2 points", () => {
    expect(strokeOutline([feetToStored(1, 1)])).toBeNull();
    expect(strokeOutline([])).toBeNull();
  });

  it("returns an outline for exactly 2 points", () => {
    const points = [feetToStored(1, 1), feetToStored(5, 1)];
    const outline = strokeOutline(points);
    expect(outline).not.toBeNull();
    expect(outline.length).toBeGreaterThan(0);
  });

  it("accepts the object form with points, pressure, and size", () => {
    const points = [feetToStored(1, 1), feetToStored(3, 1), feetToStored(5, 1)];
    const pressure = [0.2, 0.6, 1];
    const outline = strokeOutline({ points, pressure, size: 0.8 });
    expect(outline).not.toBeNull();
    expect(outline.length).toBeGreaterThan(points.length);
  });

  it("decodes twentieths of a foot to feet", () => {
    // A stroke around (1,1)-(5,1) feet should stay within a small bound around those
    // coordinates, not the raw stored values (20,20)-(100,20).
    const points = [feetToStored(1, 1), feetToStored(5, 1)];
    const outline = strokeOutline(points, 0.6);
    const bounds = strokeBounds(outline);
    expect(bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxX).toBeLessThan(6);
    expect(bounds.maxY).toBeLessThan(2);
  });
});

describe("drawOutline", () => {
  it("fills pixels along the stroke and leaves distant pixels untouched", () => {
    const canvas = createCanvas(60, 60);
    const ctx = canvas.getContext("2d");
    const points = [feetToStored(1, 1), feetToStored(5, 1)];
    const outline = strokeOutline(points, 0.6);
    drawOutline(ctx, outline, { scale: 10, color: "red", Path2DCtor: Path2D });

    const near = ctx.getImageData(30, 10, 1, 1).data;
    const far = ctx.getImageData(30, 40, 1, 1).data;

    expect(near[3]).toBeGreaterThan(0); // painted near the stroke
    expect(far[3]).toBe(0); // untouched far from the stroke
  });

  it("returns without throwing when the outline is null", () => {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext("2d");
    expect(() => drawOutline(ctx, null, { Path2DCtor: Path2D })).not.toThrow();
  });
});

describe("labelFont", () => {
  it("sizes the font so the cap height is 1.5 feet times scale", () => {
    const scale = 20;
    const expectedPx = (LABEL_CAP_HEIGHT_FEET / 0.7) * scale;
    const font = labelFont(scale);
    expect(font).toContain(`${expectedPx}px`);
    expect(font).toMatch(/bold/);
  });
});

describe("drawLabel", () => {
  it("draws text with the labelFont sizing and paints pixels near label.y * scale", () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext("2d");
    const scale = 20;
    const label = { text: "Kitchen", x: 2, y: 5 };

    drawLabel(ctx, label, { scale, color: "white" });

    expect(ctx.font).toContain(labelFont(scale).match(/[\d.]+px/)[0]);

    const y = Math.round(label.y * scale);
    let painted = false;
    for (let x = 40; x < 190; x++) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] > 0) {
        painted = true;
        break;
      }
    }
    expect(painted).toBe(true);
  });
});

describe("strokeBounds", () => {
  it("returns the min and max of the outline", () => {
    const outline = [
      [0, 0],
      [4, 1],
      [2, -3],
      [10, 5],
    ];
    expect(strokeBounds(outline)).toEqual({
      minX: 0,
      minY: -3,
      maxX: 10,
      maxY: 5,
    });
  });
});

describe("flat point arrays", () => {
  it("accepts the store's flat [x0, y0, x1, y1, ...] shape", () => {
    const nested = strokeOutline([[20, 20], [60, 20], [100, 20]], 0.6);
    const flat = strokeOutline([20, 20, 60, 20, 100, 20], 0.6);
    expect(flat).not.toBeNull();
    expect(flat.length).toBe(nested.length);
  });
  it("returns null for a flat array with fewer than 2 points", () => {
    expect(strokeOutline([20, 20], 0.6)).toBeNull();
  });
});

