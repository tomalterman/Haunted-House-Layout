// Walk view scene and renderer (KTD14 Layer 2, walk/). Imports Layers 0 and 1
// only; never map/. buildScene is a pure function of the floor plan so tests
// check object placement in Node with the real three module and no renderer.
//
// Frame: feet everywhere (KTD6). Map x -> world x, map y -> world z, y up, so
// a stroke at feet (10, 10) lands at world (10, 0, 10). The floor is a
// PlaneGeometry rotated -90 degrees about X and positioned at the gym's
// center, which puts the texture's top-left pixel at world (0, 0, 0).
//
// Look: 8 foot black-sheeted panels on tan Ram Board, off-white pop-up
// canopies on thin legs, a raised stage with a dark blue curtain. The haunt
// path is covered — a low dark ceiling over the named regions — so looking
// up is black sheeting, not an empty gym box. Fixed floor-plan walls and
// freehand Walls strokes both extrude as the same black panels.
import * as THREE_MODULE from "three";
import { hauntCoverPolygons } from "../stroke-walls.js";

// A third grader's eye height, shared with the walker so the camera and the
// collision body can never disagree.
import { DEFAULT_EYE_HEIGHT_FEET } from "./walk-controls.js";
export const EYE_HEIGHT_FEET = DEFAULT_EYE_HEIGHT_FEET;
export const TENT_HEIGHT_FEET = 7;
export const TENT_LEG_SIZE_FEET = 0.2;
export const STAGE_HEIGHT_FEET = 4;
const CURTAIN_HEIGHT_FEET = 20;
const ROOF_HEIGHT_FEET = 2.5;
const CONTEXT_RESTORE_GRACE_MS = 2000;

const COLORS = {
  floorBase: 0xc9a86c,
  wall: 0x0b0b0c,
  cover: 0x161412,
  tentRoof: 0xf1ede4,
  tentLeg: 0x5b5b5e,
  stage: 0x2b2420,
  curtain: 0x1a2a5c,
  gym: 0x6b665c,
  sky: 0x4a453c,
  ground: 0x3a3228,
  fog: 0x1c1914,
};
const COVER_LIFT_FEET = 0.08;
const FOG_NEAR = 12;
const FOG_FAR = 46;

/** Map feet [x, y] to world [x, 0, z]. */
export function mapToWorld([x, y]) {
  return [x, 0, y];
}

function buildFloor(THREE, floorplan, floorCanvas) {
  const { w, h } = floorplan.bounds;
  const texture = new THREE.CanvasTexture(floorCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // anisotropy is set by createWalkView from the renderer's maximum.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    roughness: 0.95,
    metalness: 0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  floor.name = "floor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  return { floor, texture };
}

function wallMaterial(THREE) {
  return new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.45,
    metalness: 0.05,
  });
}

function wallMesh(THREE, wall, height, material) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const dx = bx - ax;
  const dz = by - ay;
  const length = Math.hypot(dx, dz) || 0.01;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, wall.thickness), material);
  mesh.name = wall.id;
  mesh.userData.wallId = wall.id;
  if (wall.strokeId != null) mesh.userData.strokeId = wall.strokeId;
  mesh.position.set((ax + bx) / 2, height / 2, (ay + by) / 2);
  // Rotation about Y by theta sends local +x to (cos theta, 0, -sin theta),
  // so the segment direction (dx, dz) needs theta = -atan2(dz, dx).
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

function buildWalls(THREE, floorplan) {
  const material = wallMaterial(THREE);
  return floorplan.walls.map((wall) => wallMesh(THREE, wall, floorplan.wallHeight, material));
}

function buildStrokeWalls(THREE, floorplan, strokeWalls) {
  const group = new THREE.Group();
  group.name = "stroke-walls";
  const material = wallMaterial(THREE);
  const meshes = (strokeWalls ?? []).map((wall) => {
    const mesh = wallMesh(THREE, wall, floorplan.wallHeight, material);
    group.add(mesh);
    return mesh;
  });
  return { group, meshes };
}

function buildCovers(THREE, floorplan) {
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.cover,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const y = floorplan.wallHeight + COVER_LIFT_FEET;
  return hauntCoverPolygons(floorplan).map(({ id, points }) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.name = id;
    mesh.userData.coverId = id;
    // +90 about X sends shape (x, y) to world (x, 0, y), matching map y -> z.
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  });
}

function buildTents(THREE, floorplan) {
  const legMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.tentLeg,
    roughness: 0.5,
    metalness: 0.4,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.tentRoof,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  return floorplan.tents.map((tent) => {
    const group = new THREE.Group();
    group.name = tent.id;
    group.userData.tentId = tent.id;
    group.position.set(tent.x + tent.size / 2, 0, tent.y + tent.size / 2);

    const legGeometry = new THREE.BoxGeometry(TENT_LEG_SIZE_FEET, TENT_HEIGHT_FEET, TENT_LEG_SIZE_FEET);
    const inset = tent.size / 2 - TENT_LEG_SIZE_FEET / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.userData.part = "leg";
        leg.position.set(sx * inset, TENT_HEIGHT_FEET / 2, sz * inset);
        group.add(leg);
      }
    }

    // A four-sided cone rotated 45 degrees is a square pyramid whose base
    // circumscribes the tent square: a low peaked canopy, open on every side.
    const radius = (tent.size / 2) * Math.SQRT2;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(radius, ROOF_HEIGHT_FEET, 4, 1, false),
      roofMaterial,
    );
    roof.userData.part = "roof";
    roof.rotation.y = Math.PI / 4;
    roof.position.y = TENT_HEIGHT_FEET + ROOF_HEIGHT_FEET / 2;
    group.add(roof);
    return group;
  });
}

function buildStage(THREE, floorplan) {
  const s = floorplan.stage;
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(s.w, STAGE_HEIGHT_FEET, s.h),
    new THREE.MeshStandardMaterial({ color: COLORS.stage, roughness: 0.8 }),
  );
  stage.name = "stage";
  stage.position.set(s.x + s.w / 2, STAGE_HEIGHT_FEET / 2, s.y + s.h / 2);

  // Curtain plane just inside the gym's bottom edge, facing the floor.
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(s.w, CURTAIN_HEIGHT_FEET),
    new THREE.MeshStandardMaterial({ color: COLORS.curtain, roughness: 1, side: THREE.DoubleSide }),
  );
  curtain.name = "curtain";
  curtain.position.set(s.x + s.w / 2, CURTAIN_HEIGHT_FEET / 2, floorplan.bounds.h - 0.2);
  curtain.rotation.y = Math.PI;
  return { stage, curtain };
}

function buildGym(THREE, floorplan) {
  const { w, h } = floorplan.bounds;
  const gym = new THREE.Mesh(
    new THREE.BoxGeometry(w, floorplan.ceiling, h),
    new THREE.MeshStandardMaterial({ color: COLORS.gym, roughness: 1, side: THREE.BackSide }),
  );
  gym.name = "gym";
  // Dropped a hair so the box's underside sits below the floor plane instead
  // of fighting it for the same pixels.
  gym.position.set(w / 2, floorplan.ceiling / 2 - 0.05, h / 2);
  return gym;
}

function buildLights(THREE, floorplan) {
  const hemisphere = new THREE.HemisphereLight(COLORS.sky, COLORS.ground, 0.75);
  hemisphere.position.set(0, floorplan.ceiling, 0);
  const sun = new THREE.DirectionalLight(0xe8d8b8, 0.7);
  sun.position.set(floorplan.bounds.w * 0.35, floorplan.wallHeight + 2, floorplan.bounds.h * 0.3);
  sun.target.position.set(floorplan.bounds.w / 2, 0, floorplan.bounds.h / 2);
  return { hemisphere, sun };
}

/**
 * Build the gym scene from the floor plan. Pure: same inputs, same objects.
 * `floorCanvas` becomes a CanvasTexture; in Node an object with width and
 * height is enough.
 */
export function buildScene(floorplan, teams, { THREE = THREE_MODULE, floorCanvas, strokeWalls = [] } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.fog);
  scene.fog = new THREE.Fog(COLORS.fog, FOG_NEAR, FOG_FAR);

  const { floor, texture } = buildFloor(THREE, floorplan, floorCanvas);
  const walls = buildWalls(THREE, floorplan);
  const stroke = buildStrokeWalls(THREE, floorplan, strokeWalls);
  const covers = buildCovers(THREE, floorplan);
  const tents = buildTents(THREE, floorplan);
  const { stage, curtain } = buildStage(THREE, floorplan);
  const gym = buildGym(THREE, floorplan);
  const { hemisphere, sun } = buildLights(THREE, floorplan);

  scene.add(
    floor,
    ...walls,
    stroke.group,
    ...covers,
    ...tents,
    stage,
    curtain,
    gym,
    hemisphere,
    sun,
    sun.target,
  );

  function dispose() {
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose?.();
    });
    texture.dispose();
  }

  return {
    scene,
    floor,
    texture,
    walls,
    strokeWalls: stroke.group,
    strokeWallMeshes: stroke.meshes,
    covers,
    tents,
    stage,
    curtain,
    gym,
    lights: { hemisphere, sun },
    dispose,
  };
}

/**
 * Renderer, camera, and frame loop for the walk. Owns setAnimationLoop
 * (KTD13) and consumes the floor texture's dirty flag each frame. Rebuilds the
 * scene on WebGL context restore (KTD5); if restore does not arrive within
 * 2 seconds, onContextLost callbacks fire so the app can offer a reload.
 */
function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material?.dispose?.();
  });
  object.parent?.remove(object);
}

function strokeWallKey(walls) {
  if (!walls?.length) return "";
  return walls.map((wall) => `${wall.id}:${wall.a[0]},${wall.a[1]}-${wall.b[0]},${wall.b[1]}`).join("|");
}

export function createWalkView({
  canvas,
  floorplan,
  teams,
  floorTexture,
  THREE = THREE_MODULE,
  width,
  height,
  dpr = Math.min(globalThis.devicePixelRatio || 1, 2),
  getStrokeWalls = () => [],
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(dpr, 2));
  renderer.setSize(width, height, false);

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 200);
  camera.rotation.order = "YXZ";
  const [startX, , startZ] = mapToWorld(floorplan.path?.[0] ?? [floorplan.bounds.w / 2, floorplan.bounds.h / 2]);
  camera.position.set(startX, EYE_HEIGHT_FEET, startZ);

  let built = null;
  let running = false;
  let lastTime = 0;
  let restoreTimer = null;
  let lastStrokeKey = null;
  const frameCallbacks = new Set();
  const lostCallbacks = new Set();

  function applyStrokeWalls() {
    const walls = getStrokeWalls() ?? [];
    const key = strokeWallKey(walls);
    if (key === lastStrokeKey) return;
    lastStrokeKey = key;
    disposeObject3D(built.strokeWalls);
    const next = buildStrokeWalls(THREE, floorplan, walls);
    built.scene.add(next.group);
    built.strokeWalls = next.group;
    built.strokeWallMeshes = next.meshes;
  }

  function build() {
    const strokeWalls = getStrokeWalls() ?? [];
    built = buildScene(floorplan, teams, { THREE, floorCanvas: floorTexture.canvas, strokeWalls });
    lastStrokeKey = strokeWallKey(strokeWalls);
    built.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    floorTexture.markDirty();
  }
  build();

  function uploadFloorIfDirty() {
    if (floorTexture.drawIfDirty()) built.texture.needsUpdate = true;
  }

  function frame(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    for (const cb of frameCallbacks) cb(dt);
    applyStrokeWalls();
    uploadFloorIfDirty();
    renderer.render(built.scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    renderer.setAnimationLoop(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  }

  function render() {
    applyStrokeWalls();
    uploadFloorIfDirty();
    renderer.render(built.scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setCamera({ position, yaw, pitch } = {}) {
    if (position) camera.position.set(position[0], EYE_HEIGHT_FEET, position[1]);
    if (yaw != null) camera.rotation.y = yaw;
    if (pitch != null) camera.rotation.x = pitch;
  }

  const onFrame = (cb) => {
    frameCallbacks.add(cb);
    return () => frameCallbacks.delete(cb);
  };

  const onContextLost = (cb) => {
    lostCallbacks.add(cb);
    return () => lostCallbacks.delete(cb);
  };

  // Fires when the GPU context comes back, so a reload prompt shown during the
  // outage can be taken down instead of covering a working scene.
  const restoredCallbacks = new Set();
  const onContextRestored = (cb) => {
    restoredCallbacks.add(cb);
    return () => restoredCallbacks.delete(cb);
  };

  let wasRunning = false;
  function handleContextLost(event) {
    event.preventDefault();
    wasRunning = running;
    stop();
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      for (const cb of lostCallbacks) cb();
    }, CONTEXT_RESTORE_GRACE_MS);
  }

  function handleContextRestored() {
    clearTimeout(restoreTimer);
    restoreTimer = null;
    built?.dispose();
    build();
    if (wasRunning) start();
    else render();
    for (const cb of restoredCallbacks) cb();
  }

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  function dispose() {
    stop();
    clearTimeout(restoreTimer);
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    frameCallbacks.clear();
    lostCallbacks.clear();
    built?.dispose();
    built = null;
    renderer.dispose();
  }

  return {
    get scene() {
      return built?.scene;
    },
    camera,
    renderer,
    start,
    stop,
    resize,
    setCamera,
    render,
    onFrame,
    onContextLost,
    onContextRestored,
    dispose,
  };
}
