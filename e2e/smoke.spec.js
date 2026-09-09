// Browser smoke tests (U10). These run against `vite preview` with no Worker,
// so sync is unavailable and the app must still work offline from IndexedDB.
// The production bundle drops main.js's exports, so every check drives the real
// UI and reads pixels off the canvas rather than reaching into app state.
import { test, expect } from "@playwright/test";

const TEAM_GREEN = [0x3a, 0x9d, 0x4f]; // Poison Breakfast, the first chip.

/** Fail the test on any uncaught page error; ignore the expected sync failure. */
function watchForErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() !== "error") return;
    if (/websocket|ws:|wss:|failed to fetch|parties/i.test(text)) return; // no Worker in preview
    errors.push(text);
  });
  return errors;
}

/** Count pixels close to `rgb` inside the map canvas. */
async function countTeamPixels(page, rgb) {
  return page.evaluate((target) => {
    const canvas = document.getElementById("map-canvas");
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.abs(data[i] - target[0]) < 26 &&
        Math.abs(data[i + 1] - target[1]) < 26 &&
        Math.abs(data[i + 2] - target[2]) < 26 &&
        data[i + 3] > 200
      ) n++;
    }
    return n;
  }, rgb);
}

/**
 * Drag one finger across the map. Playwright's touchscreen has only tap, so
 * touch gestures go through the DevTools protocol.
 */
async function touchDrag(page, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const at = (i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...at(0), id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...at(i), id: 1 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * A realistic pinch: one finger lands and moves a little (which is where a
 * stroke would start), then the second finger arrives and the two spread apart.
 */
async function touchPinch(page, centre, fromGap, toGap, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const left = (gap) => ({ x: centre.x - gap / 2, y: centre.y, id: 1 });
  const right = (gap) => ({ x: centre.x + gap / 2, y: centre.y, id: 2 });

  // One finger down and dragging: this is the state a ghost stroke comes from.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left(fromGap)] });
  for (let i = 1; i <= 3; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: centre.x - fromGap / 2 + i * 4, y: centre.y, id: 1 }],
    });
  }
  // Second finger arrives; the gesture becomes a pinch.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [left(fromGap), right(fromGap)],
  });
  for (let i = 1; i <= steps; i++) {
    const gap = fromGap + ((toGap - fromGap) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [left(gap), right(gap)],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Drag with whichever input the project has: touch on mobile, mouse on desktop. */
async function drawStroke(page, isMobile, from, to) {
  if (isMobile) return touchDrag(page, from, to);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  }
  await page.mouse.up();
}

/** Painted width of the gym floor along its middle row, a proxy for zoom. */
async function measureFloorWidth(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("map-canvas");
    const row = Math.round(canvas.height * 0.4);
    const { data } = canvas.getContext("2d").getImageData(0, row, canvas.width, 1);
    // The gym floor is Ram Board tan; the surround is the dark page background.
    let first = -1;
    let last = -1;
    for (let x = 0; x < canvas.width; x++) {
      const i = x * 4;
      const light = data[i] > 90 && data[i + 1] > 70;
      if (light) {
        if (first < 0) first = x;
        last = x;
      }
    }
    return last - first;
  });
}

/** A point inside the map canvas, well clear of the toolbar. */
async function mapPoint(page, fx = 0.5, fy = 0.4) {
  const box = await page.locator("#map-canvas").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe("first open", () => {
  test("shows the gym, the six teams, and works without a sync server", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");

    await expect(page.locator("#map-canvas")).toBeVisible();
    await expect(page.locator("#toolbar .chip"), "one chip per team").toHaveCount(6);
    await expect(page.locator("#toolbar .chip").first()).toContainText("Poison Breakfast");

    const walkBox = await page.locator("#toolbar .walk").boundingBox();
    const view = page.viewportSize();
    expect(walkBox, "Walk is laid out").not.toBeNull();
    expect(walkBox.x + walkBox.width, "Walk is on screen without scrolling the toolbar").toBeLessThanOrEqual(
      view.width + 1,
    );

    // The floor plan is drawn, so the canvas is not blank.
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById("map-canvas");
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const first = [data[0], data[1], data[2]];
      for (let i = 4; i < data.length; i += 4) {
        if (data[i] !== first[0] || data[i + 1] !== first[1] || data[i + 2] !== first[2]) return true;
      }
      return false;
    });
    expect(painted, "the floor plan is drawn on the canvas").toBe(true);

    // With no Worker reachable the board is usable from local state.
    await expect(page.locator("#toolbar .status-word")).not.toHaveText("live", { timeout: 5000 });
    expect(errors, `unexpected page errors: ${errors.join(" | ")}`).toEqual([]);
  });
});

test.describe("zones", () => {
  test("picking Zone shows region presets without a map tap first", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tool", { hasText: /^Zone$/ }).click();
    await expect(page.locator(".zone-sheet"), "the zone sheet opens with the tool").toBeVisible();
    await expect(page.locator(".zone-preset"), "named regions are one-tap starts").toHaveCount(5);
    await expect(page.locator(".zone-preset").first()).toContainText("Entrance tents");
  });
});

test.describe("drawing", () => {
  test("one finger draws a stroke in the selected team colour", async ({ page, isMobile }) => {
    await page.goto("/");
    const before = await countTeamPixels(page, TEAM_GREEN);

    const start = await mapPoint(page, 0.35, 0.4);
    const end = await mapPoint(page, 0.65, 0.4);
    await drawStroke(page, isMobile, start, end);

    await expect
      .poll(() => countTeamPixels(page, TEAM_GREEN), {
        message: "the stroke is painted in the team colour",
        timeout: 5000,
      })
      .toBeGreaterThan(before + 50);
  });

  test("two fingers zoom and leave no stroke behind", async ({ page, isMobile }) => {
    test.skip(!isMobile, "pinch is a touch gesture; the desktop project has no touch input");
    await page.goto("/");
    await expect(page.locator("#map-canvas")).toBeVisible();

    // Nothing drawn yet, so any team-coloured pixel after the gesture is a
    // ghost stroke the pinch left behind (AE5).
    const before = await countTeamPixels(page, TEAM_GREEN);
    const spread = await measureFloorWidth(page);

    const centre = await mapPoint(page, 0.5, 0.4);
    await touchPinch(page, centre, 60, 240);
    await page.waitForTimeout(400);

    expect(
      await countTeamPixels(page, TEAM_GREEN),
      "pinching drew nothing",
    ).toBe(before);
    expect(
      await measureFloorWidth(page),
      "pinching apart zoomed the map in",
    ).toBeGreaterThan(spread);
  });
});

test.describe("walk", () => {
  test("opens at kid height, runs the clock, and returns to the map", async ({ page, isMobile }) => {
    await page.goto("/");

    // Leave a mark so the return trip can prove the map survived the round trip.
    const start = await mapPoint(page, 0.35, 0.4);
    const end = await mapPoint(page, 0.6, 0.4);
    await drawStroke(page, isMobile, start, end);
    await expect.poll(() => countTeamPixels(page, TEAM_GREEN), { timeout: 5000 }).toBeGreaterThan(50);
    const drawn = await countTeamPixels(page, TEAM_GREEN);

    await page.locator("#toolbar .walk").click();
    await expect(page.locator("#walk-canvas")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#hud-zone")).toBeVisible();

    await expect(page.locator("#hud-clock"), "the walk clock advances").not.toHaveText("0:00", {
      timeout: 10000,
    });

    const mapButton = page.locator("#hud-map");
    const size = await mapButton.boundingBox();
    expect(size.height, "the Map button is a comfortable tap target").toBeGreaterThanOrEqual(44);

    await mapButton.click();
    await expect(page.locator("#map-canvas")).toBeVisible();
    await expect
      .poll(() => countTeamPixels(page, TEAM_GREEN), { timeout: 5000 })
      .toBeGreaterThan(drawn / 2);
  });
});

test.describe("orientation", () => {
  test("keeps the toolbar and the gym reachable in landscape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "orientation only matters on the phone project");
    await page.goto("/");
    await expect(page.locator("#map-canvas")).toBeVisible();

    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.waitForTimeout(400);

    const toolbar = await page.locator("#toolbar").boundingBox();
    const view = page.viewportSize();
    expect(toolbar.y, "the toolbar stays on screen in landscape").toBeLessThan(view.height);
    await expect(page.locator("#toolbar .walk")).toBeVisible();

    const walk = page.locator("#toolbar .walk");
    const walkBox = await walk.boundingBox();
    expect(walkBox, "Walk stays in the viewport").not.toBeNull();
    expect(walkBox.x, "Walk is not scrolled off to the right").toBeGreaterThanOrEqual(-1);
    expect(walkBox.x + walkBox.width, "Walk fits on screen").toBeLessThanOrEqual(view.width + 1);

    // The gym is still drawn after the rotation, not scrolled off.
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById("map-canvas");
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const first = [data[0], data[1], data[2]];
      for (let i = 4; i < data.length; i += 4) {
        if (data[i] !== first[0] || data[i + 1] !== first[1] || data[i + 2] !== first[2]) return true;
      }
      return false;
    });
    expect(painted, "the floor plan is still drawn after rotating").toBe(true);
  });
});
