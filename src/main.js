// App shell (KTD14 Layer 3): the shared document (U9), the map view and its
// tools (U4, U5), the walk view (U7, U8), and the switch between them (U8).
// The two views never import each other; this file mediates, and hands the
// walk start point from the map to the walk through store-local state.
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { createStore } from "./store.js";
import { FLOORPLAN } from "./floorplan.js";
import { TEAMS } from "./teams.js";
import { createViewTransform, createMapView } from "./map/map-view.js";
import { createInputMachine, bindPointerEvents } from "./map/map-input.js";
import { createToolbar } from "./map/toolbar.js";
import { createZoneTool } from "./map/zone-tool.js";
// Pure walk controls (Layer 2, no three/nipplejs): cheap enough to load with the map.
import { createWalker, createTouchControls, formatClock, yawFacing } from "./walk/walk-controls.js";
import { wallSegmentsFromStrokes } from "./stroke-walls.js";

const mapView = document.getElementById("map-view");
const walkView = document.getElementById("walk-view");

// ---- Shared document (KTD1, KTD3, KTD12) ----
// The room is the Durable Object name: `?room=rehearsal` opens a separate
// board. It is sanitized to [a-z0-9-] so the name is URL-safe and stable.
export const DEFAULT_ROOM = "gym";

export function sanitizeRoom(raw) {
  const cleaned = (raw ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return cleaned || DEFAULT_ROOM;
}

export const room = sanitizeRoom(new URLSearchParams(location.search).get("room"));

const doc = new Y.Doc();

// Local copy first (offline reads and the informal backup), then the server.
// Either may fail (private mode, blocked IndexedDB, Worker not running);
// the app still works and the store reports status "local".
let persistence = null;
try {
  persistence = new IndexeddbPersistence(`hh-${room}`, doc);
} catch (err) {
  console.warn("IndexedDB persistence unavailable, running without a local copy", err);
}

let provider = null;
try {
  // YProvider(host, room, doc, options): host is the page origin with the
  // scheme stripped, `party: "main"` matches the Durable Object binding, and
  // `protocol` is the bare WebSocket scheme ("ws" | "wss"). The URL becomes
  // <protocol>://<host>/parties/main/<room>; under `npm run dev` Vite proxies
  // /parties to the Worker on :8787.
  provider = new YProvider(location.host, room, doc, {
    party: "main",
    protocol: location.protocol === "https:" ? "wss" : "ws",
  });
} catch (err) {
  console.warn("Sync provider unavailable, running local only", err);
}

export const store = createStore({ doc, provider, persistence });
export { doc, provider, persistence };

// ---- Map view and tools (U4, U5; KTD10, KTD13) ----
// The map is created once and never destroyed, so its zoom and the strokes it
// draws from the store survive every switch to the walk and back (R14).
const mapCanvas = document.getElementById("map-canvas");
export const transform = createViewTransform();
export const map = createMapView({ canvas: mapCanvas, store, floorplan: FLOORPLAN, teams: TEAMS, transform });
export const machine = createInputMachine();
bindPointerEvents(mapCanvas, machine, { toFeet: (px) => transform.toFeet(px) });
window.addEventListener("blur", () => machine.cancel());

// The zone tool (U6) plugs in with `toolbar.setZoneHandler(...)`.
export const toolbar = createToolbar({
  root: document.getElementById("toolbar"),
  store,
  teams: TEAMS,
  mapView: map,
  machine,
  onWalk: () => openWalk(),
  onWalkFromHere: (feet) => openWalk(feet),
});

// Zone carving and team assignment (U6) hangs off the toolbar's zone tool.
export const zoneTool = createZoneTool({ store, floorplan: FLOORPLAN, teams: TEAMS, toolbar, mapView: map });

// ---- Walk view (U7, U8; KTD4, KTD5, KTD13) ----
// three, nipplejs, and the walk modules load on first use so the map is
// interactive before the 3D bundle arrives (KTD4). Everything the walk owns
// lives in `walk` and is created once; only its frame loop starts and stops.
const walkCanvas = document.getElementById("walk-canvas");
const hud = {
  clock: document.getElementById("hud-clock"),
  zone: document.getElementById("hud-zone"),
  map: document.getElementById("hud-map"),
};
const reloadOverlay = document.getElementById("reload-overlay");
const teamById = new Map(TEAMS.map((t) => [t.id, t]));

let walk = null;
let walkLoading = null;

function browserCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function walkSize() {
  return {
    width: Math.max(1, walkCanvas.clientWidth || walkView.clientWidth || window.innerWidth),
    height: Math.max(1, walkCanvas.clientHeight || walkView.clientHeight || window.innerHeight),
  };
}

// Zones are cached from the store so the walk loop never rebuilds the state
// object once per frame; the subscription keeps the cache fresh (KTD13).
function zoneCache() {
  let zones = store.getState().zones;
  const unsubscribe = store.subscribe(() => {
    zones = store.getState().zones;
  });
  return { getZones: () => zones, unsubscribe };
}

function strokeWallCache() {
  const fromState = (state) =>
    wallSegmentsFromStrokes(state.strokes, { hidden: state.hidden, teams: TEAMS });
  let segments = fromState(store.getState());
  const unsubscribe = store.subscribe(() => {
    segments = fromState(store.getState());
  });
  return { getStrokeWalls: () => segments, unsubscribe };
}

let lastClockText = null;
let lastZoneId;
// The HUD clock is wall time since the walk began (or the last "Walk here"),
// so pacing reads true seconds even when frames are slow.
let walkStartedAt = null;

function updateHud(out) {
  if (walkStartedAt === null) walkStartedAt = performance.now();
  const clock = formatClock((performance.now() - walkStartedAt) / 1000);
  if (clock !== lastClockText) {
    lastClockText = clock;
    hud.clock.textContent = clock;
  }
  // Key on the zone's identity AND its label, so a remote rename or team
  // reassignment updates the chip without the walker leaving the polygon (AE1).
  const zoneKey = out.zone ? `${out.zone.id}|${out.zone.team}|${out.zone.name}` : null;
  if (zoneKey === lastZoneId) return;
  lastZoneId = zoneKey;
  if (!out.zone) {
    hud.zone.textContent = "No zone";
    hud.zone.classList.add("is-none");
    hud.zone.style.removeProperty("--zone");
    return;
  }
  const team = teamById.get(out.zone.team);
  hud.zone.textContent = out.zone.name || team?.name || "Zone";
  hud.zone.classList.remove("is-none");
  hud.zone.style.setProperty("--zone", team?.color ?? "#888888");
}

async function loadWalkModules() {
  const [walkViewModule, textureModule, THREE, nipple] = await Promise.all([
    import("./walk/walk-view.js"),
    import("./walk/floor-texture.js"),
    import("three"),
    import("nipplejs"),
  ]);
  return {
    createWalkView: walkViewModule.createWalkView,
    createFloorTexture: textureModule.createFloorTexture,
    THREE,
    nipplejs: nipple.default ?? nipple,
  };
}

function buildWalk(mods) {
  const zones = zoneCache();
  const strokeWalls = strokeWallCache();
  const floorTexture = mods.createFloorTexture({
    store,
    floorplan: FLOORPLAN,
    teams: TEAMS,
    createCanvas: browserCanvas,
  });
  const { width, height } = walkSize();
  const view = mods.createWalkView({
    canvas: walkCanvas,
    floorplan: FLOORPLAN,
    teams: TEAMS,
    floorTexture,
    THREE: mods.THREE,
    width,
    height,
    getStrokeWalls: strokeWalls.getStrokeWalls,
  });

  // Start where the map's "Walk here" tap put us, else at the entrance door,
  // facing along the first leg of the visitor path. A point inside a wall is
  // nudged to the nearest free spot by the walker itself.
  const [p0, p1] = FLOORPLAN.path;
  const walker = createWalker({
    floorplan: FLOORPLAN,
    getZones: zones.getZones,
    getExtraWalls: strokeWalls.getStrokeWalls,
    start: store.getWalkStart() ?? p0,
    yaw: yawFacing([p1[0] - p0[0], p1[1] - p0[1]]),
  });

  const controls = createTouchControls({
    joystickEl: document.getElementById("joystick"),
    lookEl: document.getElementById("look"),
    nipplejs: mods.nipplejs,
    onLook: (dYaw, dPitch) => walker.look(dYaw, dPitch),
  });

  // One frame: joystick -> walker -> camera -> HUD. dt is seconds since the
  // last frame, so Low Power Mode's 30 fps moves at the same speed (KTD5).
  const unsubscribeFrame = view.onFrame((dt) => {
    const out = walker.step(controls.getInput(), dt);
    view.setCamera({ position: out.position, yaw: out.yaw, pitch: out.pitch });
    updateHud(out);
  });

  const unsubscribeLost = view.onContextLost(() => {
    reloadOverlay.hidden = false;
  });
  const unsubscribeRestored = view.onContextRestored(() => {
    reloadOverlay.hidden = true;
  });

  view.setCamera({ position: walker.position, yaw: walker.yaw, pitch: walker.pitch });
  updateHud(walker.step({ forward: 0, strafe: 0 }, 0));

  return {
    view,
    walker,
    controls,
    floorTexture,
    destroy() {
      unsubscribeFrame();
      unsubscribeLost();
      unsubscribeRestored();
      controls.destroy();
      view.dispose();
      floorTexture.destroy();
      zones.unsubscribe();
      strokeWalls.unsubscribe();
    },
  };
}

async function ensureWalk() {
  if (walk) return walk;
  if (!walkLoading) {
    walkLoading = loadWalkModules()
      .then((mods) => {
        walk = buildWalk(mods);
        return walk;
      })
      .finally(() => {
        walkLoading = null;
      });
  }
  return walkLoading;
}

/**
 * Switch to the walk. With `feet` (from the map's "Walk here" tool) the
 * walker restarts there; without it the walker keeps its position from the
 * last visit, so map -> walk -> map -> walk resumes where you stood (R14).
 */
async function openWalk(feet) {
  toolbar.closeLabel();
  showView("walk");
  try {
    const w = await ensureWalk();
    // buildWalk already read the store's start point; a fresh tap restarts there.
    if (feet) {
      w.walker.setStart(feet);
      walkStartedAt = performance.now();
    }
    if (!walkView.hidden) {
      layout();
      w.view.start();
    }
  } catch (err) {
    console.error("The walk view could not load", err);
    showView("map");
  }
}

hud.map.addEventListener("click", () => showView("map"));
document.getElementById("reload-button")?.addEventListener("click", () => location.reload());

// ---- View switching (U1, U8; KTD13) ----
// The walk loop runs only while the walk is on screen; the map redraws on its
// own coalesced frame whenever the store or transform changes.
export function showView(name) {
  const isWalk = name === "walk";
  mapView.hidden = isWalk;
  walkView.hidden = !isWalk;
  if (isWalk) {
    walk?.view.start();
  } else {
    walk?.view.stop();
  }
  layout();
}

function layout() {
  // The toolbar floats over the map, so fitting reserves its height (U4, U5).
  if (!mapView.hidden) {
    const bar = document.getElementById("toolbar");
    map.resize({
      width: mapCanvas.clientWidth,
      height: mapCanvas.clientHeight,
      insets: { bottom: bar?.offsetHeight ?? 0 },
    });
  }
  if (!walkView.hidden && walk) {
    const { width, height } = walkSize();
    walk.view.resize(width, height);
  }
}

window.addEventListener("resize", layout);
globalThis.visualViewport?.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => setTimeout(layout, 50));

// Backgrounding pauses the walk loop; returning resumes it if it is on screen.
document.addEventListener("visibilitychange", () => {
  if (!walk) return;
  if (document.hidden) walk.view.stop();
  else if (!walkView.hidden) walk.view.start();
});

showView("map");
