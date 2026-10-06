// End-to-end browser check of the realistic 3D sandbox. Reads state only through
// window.__sandbox and saves screenshots. Not part of `npm test`: it needs Playwright with
// Chromium and the site served locally.
//
//   npm run serve                      # in one terminal (port 8000)
//   node scripts/sandbox-smoke.cjs [url] [screenshot-dir]
//
// Software rendering (headless SwiftShader) is slow, so the run waits on simulation time,
// not wall-clock time, and can take several minutes.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8000/';
const OUT = process.argv[3] || require('path').join(require('os').tmpdir(), 'sandbox-shots');
require('fs').mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' (' + extra + ')' : ''}`);
  console.log(results[results.length - 1]);
};
const snap = (page) => page.evaluate(() => window.__sandbox.snapshot());
const SENS = 0.004;

async function drag(page, dx, dy) {
  const box = await page.locator('#plan-3d canvas').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function wheelForward(page, feet) {
  const box = await page.locator('#plan-3d canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  while (Math.abs(feet) > 0.01) {
    const step = Math.max(-6, Math.min(6, feet));
    await page.mouse.wheel(0, -step / 0.02);
    feet -= step;
    await page.waitForTimeout(60);
  }
}

const settle = (page) => page.waitForTimeout(1200);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Turn toward a world point, fly to it with the wheel, then face the final direction.
async function flyTo(page, target, yaw, pitch) {
  for (let pass = 0; pass < 2; pass++) {
    const c = (await snap(page)).camera;
    const d = { x: target.x - c.x, y: target.y - c.y, z: target.z - c.z };
    const dist = Math.hypot(d.x, d.y, d.z);
    if (dist < 0.5) break;
    const needYaw = Math.atan2(-d.x, -d.z);
    const needPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    await drag(page, wrap(c.yaw - needYaw) / SENS, (c.pitch - needPitch) / SENS);
    await settle(page);
    await wheelForward(page, dist);
    await settle(page);
  }
  const c = (await snap(page)).camera;
  await drag(page, wrap(c.yaw - yaw) / SENS, (c.pitch - pitch) / SENS);
  await settle(page);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // Desktop, low quality for speed in software rendering.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));
    await page.goto(`${URL}?quality=low`);
    await page.waitForSelector('#plan-2d svg');
    ok('2D still renders 12 walls', (await page.locator('#plan-2d .wall').count()) === 12);
    ok('sandbox controls hidden in 2D', await page.isHidden('#sandbox-controls'));

    await page.click('#view-3d');
    await page.waitForFunction(() => window.__sandbox, null, { timeout: 30000 });
    let s = await snap(page);
    ok('opens in Work lights', s.lights === 'work');
    ok('opens the Schoolyard demo', s.scene === 'schoolyard-demo' && s.props.length === 5);
    ok('sandbox controls visible in 3D', await page.isVisible('#sandbox-controls'));
    ok('canvas has focus', await page.evaluate(() => document.activeElement?.classList.contains('view3d-canvas')));
    const ball = (snapshot) => snapshot.props.find((p) => p.id === 'inflatable-ball');
    ok('ball starts high above the walls', ball(s).height > 20, ball(s).height.toFixed(2));
    await page.screenshot({ path: `${OUT}/01-work-overview.png` });

    await page.waitForFunction(() => window.__sandbox.snapshot().time > 2.4, null, { timeout: 180000, polling: 250 });
    s = await snap(page);
    ok('ball is falling after its delay', ball(s).height < 20, ball(s).height.toFixed(2));
    await page.screenshot({ path: `${OUT}/02-mid-drop.png` });

    await page.waitForFunction(() => !window.__sandbox.snapshot().active, null, { timeout: 600000, polling: 1000 });
    s = await snap(page);
    ok('ball comes to rest on the floor', Math.abs(ball(s).height - 3.25) < 0.1, ball(s).height.toFixed(2));
    ok('everything is asleep once settled', s.props.every((p) => p.sleeping));
    await page.screenshot({ path: `${OUT}/03-settled.png` });

    await page.click('#replay');
    s = await snap(page);
    ok('Replay puts the ball back up', ball(s).height > 20 && s.time < 1, `${ball(s).height.toFixed(2)} at t=${s.time.toFixed(2)}`);
    ok('focus returns to the view after Replay', await page.evaluate(() => document.activeElement?.classList.contains('view3d-canvas')));

    // Scene switching, then the fly keys still work right after using the dropdown.
    await page.selectOption('#scene-select', 'empty');
    s = await snap(page);
    ok('Empty scene has no props', s.scene === 'empty' && s.props.length === 0);
    const before = s.camera;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    await settle(page);
    const after = (await snap(page)).camera;
    const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    ok('W flies forward after changing the scene', moved > 1, `${moved.toFixed(1)} ft`);
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyE');
    await settle(page);
    ok('E rises', (await snap(page)).camera.y > after.y);
    await page.selectOption('#scene-select', 'schoolyard-demo');
    ok('default scene comes back', (await snap(page)).props.length === 5);

    const yaw0 = (await snap(page)).camera.yaw;
    await drag(page, 120, 0);
    await settle(page);
    ok('dragging turns the view', (await snap(page)).camera.yaw < yaw0);

    // Overlays.
    await page.click('label[for="show-route"]');
    await page.click('label[for="show-measurements"]');
    await page.click('label[for="show-groups"]');
    s = await snap(page);
    ok('overlay toggles reach the 3D view', !s.overlays.route && !s.overlays.measurements && s.overlays.groups);
    await page.click('#reset-view');
    await settle(page);
    await page.screenshot({ path: `${OUT}/04-groups-overlay.png` });
    await page.click('label[for="show-route"]');
    await page.click('label[for="show-measurements"]');
    await page.click('label[for="show-groups"]');

    // Show lights, seen from the group 4 lane at eye height. World = plan minus half the room.
    await page.selectOption('#lights-select', 'show');
    s = await snap(page);
    ok('Lights switch to Show', s.lights === 'show');
    await page.click('#replay');
    await flyTo(page, { x: 6.5, y: 5.5, z: -9 }, Math.PI, -0.12); // plan (49, 21), looking down the lane
    s = await snap(page);
    ok('flew into the group 4 lane', Math.abs(s.camera.x - 6.5) < 2 && Math.abs(s.camera.z + 9) < 2, JSON.stringify(s.camera));
    await page.screenshot({ path: `${OUT}/05-show-lane-eye-level.png` });
    await page.waitForFunction(() => !window.__sandbox.snapshot().active, null, { timeout: 600000, polling: 1000 });
    await page.screenshot({ path: `${OUT}/06-show-lane-settled.png` });
    await page.selectOption('#lights-select', 'work');
    await settle(page);
    await page.screenshot({ path: `${OUT}/07-work-lane-eye-level.png` });

    // Back to 2D and again.
    await page.click('#view-2d');
    ok('2D hides the sandbox controls again', await page.isHidden('#sandbox-controls'));
    await page.click('#view-3d');
    ok('3D keeps the chosen scene', (await snap(page)).scene === 'schoolyard-demo');
    ok('no console errors or warnings (desktop)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // Desktop high quality, one overview frame with shadows.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${URL}?quality=high`);
    await page.click('#view-3d');
    await page.waitForFunction(() => window.__sandbox, null, { timeout: 30000 });
    ok('high quality reported', (await snap(page)).quality === 'high');
    await flyTo(page, { x: 2, y: 22, z: 32 }, 0.12, -0.55);
    await page.waitForFunction(() => window.__sandbox.snapshot().time > 3.2, null, { timeout: 300000, polling: 500 });
    await page.screenshot({ path: `${OUT}/08-high-quality-work.png` });
    ok('no page errors (high)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // Phone.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.click('#view-3d');
    await page.waitForFunction(() => window.__sandbox, null, { timeout: 30000 });
    ok('phone picks low quality automatically', (await snap(page)).quality === 'low');
    ok('phone hint shows touch controls', (await page.textContent('#fly-hint-text')).includes('pinch'));
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    ok('phone has no horizontal scroll', scrollW <= 390, `scrollWidth ${scrollW}`);
    await page.waitForFunction(() => window.__sandbox.snapshot().time > 2.6, null, { timeout: 180000, polling: 250 });
    await page.screenshot({ path: `${OUT}/09-phone.png` });
    await page.click('#fly-hint-close');
    ok('hint dismisses', await page.isHidden('#fly-hint'));
    ok('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
