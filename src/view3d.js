// Orbitable 3D model of the gym, built from the same layout as the 2D plan.
// Plan x maps to world x, plan y maps to world z, and world y is up. Units are feet.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const TENT_ROOF = 7;
const WALL_THICKNESS = 0.5;
const STAGE_HEIGHT = 3;

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

function textSprite(text, color, height = 2.6) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 64px system-ui, sans-serif';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 32;
  canvas.height = 96;
  ctx.font = font;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Center a mesh on segment a-b at height y and turn it to run along the segment.
function placeOnSegment(mesh, a, b, y) {
  mesh.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
  mesh.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
}

const segmentLength = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function buildScene(layout, colors) {
  const W = layout.room.width;
  const D = layout.room.depth;
  const scene = new THREE.Scene();
  scene.background = colors.background;

  // Center the room on the origin.
  const root = new THREE.Group();
  root.position.set(-W / 2, 0, -D / 2);
  scene.add(root);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-30, 80, 40);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  root.add(floor);

  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(layout.stage.width, STAGE_HEIGHT, layout.stage.depth),
    new THREE.MeshStandardMaterial({ color: colors.stage, roughness: 1 }),
  );
  stage.position.set(layout.stage.x + layout.stage.width / 2, STAGE_HEIGHT / 2, layout.stage.y + layout.stage.depth / 2);
  root.add(stage);

  const wallMat = new THREE.MeshStandardMaterial({ color: colors.wall, roughness: 0.9 });
  for (const w of layout.walls) {
    const len = segmentLength(w.a, w.b) + WALL_THICKNESS;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, w.height, WALL_THICKNESS), wallMat);
    placeOnSegment(mesh, w.a, w.b, w.height / 2);
    mesh.name = w.id;
    root.add(mesh);
  }

  // Tents: roof outline, legs, and faint panels on closed sides so walls stay dominant.
  const outlineMat = new THREE.LineBasicMaterial({ color: colors.tent });
  const roofMat = new THREE.MeshBasicMaterial({ color: colors.tent, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const sideMat = new THREE.MeshBasicMaterial({ color: colors.tent, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const legMat = new THREE.MeshStandardMaterial({ color: colors.tentLeg });
  const legGeo = new THREE.BoxGeometry(0.2, TENT_ROOF, 0.2);
  for (const t of layout.tents) {
    const s = t.size;
    const roofGeo = new THREE.PlaneGeometry(s, s);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(t.x + s / 2, TENT_ROOF, t.y + s / 2);
    root.add(roof);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(roofGeo), outlineMat);
    edges.rotation.x = -Math.PI / 2;
    edges.position.copy(roof.position);
    root.add(edges);
    for (const [lx, lz] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(t.x + lx, TENT_ROOF / 2, t.y + lz);
      root.add(leg);
    }
  }
  for (const side of layout.tentSides) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(segmentLength(side.a, side.b), TENT_ROOF), sideMat);
    placeOnSegment(panel, side.a, side.b, TENT_ROOF / 2);
    root.add(panel);
  }

  // Doors: green markers in the wall gaps, with labels.
  const doorMat = new THREE.MeshStandardMaterial({ color: colors.door });
  const doors = [
    ['Entrance', layout.doors.entrance, -1],
    ['Exit', layout.doors.exit, 1],
  ];
  for (const [name, door, dir] of doors) {
    const len = door.y1 - door.y0;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, len), doorMat);
    mark.position.set(door.x + dir * 0.4, 0.1, (door.y0 + door.y1) / 2);
    root.add(mark);
    const label = textSprite(name, `#${colors.door.getHexString()}`);
    label.position.set(door.x + dir * 3.5, 10, (door.y0 + door.y1) / 2);
    root.add(label);
  }

  // Visitor route: a thin tube just above the floor, with arrow cones.
  const routeGroup = new THREE.Group();
  const routeMat = new THREE.MeshBasicMaterial({ color: colors.route });
  const pts = layout.route.map((p) => new THREE.Vector3(p.x, 0.25, p.y));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.18, 6, false), routeMat));
  const coneGeo = new THREE.ConeGeometry(0.55, 1.4, 12);
  for (const u of [0.12, 0.3, 0.48, 0.66, 0.84]) {
    const cone = new THREE.Mesh(coneGeo, routeMat);
    cone.position.copy(curve.getPointAt(u));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(u).normalize());
    routeGroup.add(cone);
  }
  routeGroup.name = 'route';
  root.add(routeGroup);

  // Wall lengths: a tag floating just above the middle of each wall.
  const measureGroup = new THREE.Group();
  const measureColor = `#${colors.wall.getHexString()}`;
  // The bottom wall's midpoint lines up with the pony wall's from most angles, so its tag
  // sits toward the open stage corner instead.
  const along = { 'outer-bottom': 0.12 };
  for (const w of layout.walls) {
    const ft = Number.isInteger(w.length) ? w.length : w.length.toFixed(1);
    const tag = textSprite(`${ft} ft`, measureColor, 2);
    const t = along[w.id] ?? 0.5;
    tag.position.set(w.a.x + (w.b.x - w.a.x) * t, w.height + 1.6, w.a.y + (w.b.y - w.a.y) * t);
    tag.name = `length-${w.id}`;
    measureGroup.add(tag);
  }
  measureGroup.name = 'measurements';
  root.add(measureGroup);

  return { scene, routeGroup, measureGroup };
}

function disposeScene(scene) {
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

export function mountView3D(container, layout, { showRoute = true, showMeasurements = true } = {}) {

  const colors = {
    background: cssColor(container, '--scene-bg', '#e8e5de'),
    floor: cssColor(container, '--scene-floor', '#d8c6a0'),
    stage: cssColor(container, '--scene-stage', '#9c8f7c'),
    wall: cssColor(container, '--scene-wall', '#1c1c21'),
    tent: cssColor(container, '--scene-tent', '#f4efe2'),
    tentLeg: cssColor(container, '--scene-tent-leg', '#b9b2a2'),
    door: cssColor(container, '--scene-door', '#2f7d5b'),
    route: cssColor(container, '--scene-route', '#8a4fd1'),
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    throw new Error(`WebGL is not available: ${err.message}`);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'view3d-canvas';
  container.appendChild(renderer.domElement);

  const { scene, routeGroup, measureGroup } = buildScene(layout, colors);
  routeGroup.visible = showRoute;
  measureGroup.visible = showMeasurements;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
  let userMoved = false;
  let dirty = true;
  const requestRender = () => {
    dirty = true;
  };

  // Frame the whole room for the current screen shape. Landscape looks in from the
  // entrance corner; portrait looks in from the entrance wall so the long side runs away.
  const fitStart = (aspect) => {
    const portrait = aspect < 1;
    const dir = portrait ? new THREE.Vector3(-1, 0.95, 0.3) : new THREE.Vector3(-0.55, 0.62, 0.6);
    // Room extents as seen across and up the screen from that direction, with some margin.
    const across = portrait ? layout.room.depth * 0.72 : layout.room.width * 0.6;
    const up = portrait ? layout.room.width * 0.5 : layout.room.depth * 0.82;
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(across / (tanHalfV * aspect), up / tanHalfV);
    return { position: dir.normalize().multiplyScalar(distance), distance };
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.08; // stay above the floor
  controls.minDistance = 20;
  controls.addEventListener('start', () => {
    userMoved = true;
  });
  controls.addEventListener('change', requestRender);

  const applyStart = () => {
    const { position, distance } = fitStart(camera.aspect);
    controls.maxDistance = distance * 1.6;
    camera.position.copy(position);
    controls.target.set(0, 0, 0);
    controls.update();
    requestRender();
  };

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) applyStart();
    requestRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // The scene is static, so draw only when the camera moves or something changes.
  let running = false;
  const frame = () => {
    const moving = controls.update(); // keeps damping going after a drag ends
    if (moving || dirty) {
      dirty = false;
      renderer.render(scene, camera);
    }
  };
  const startLoop = () => {
    if (!running) {
      running = true;
      requestRender();
      renderer.setAnimationLoop(frame);
    }
  };
  const stopLoop = () => {
    running = false;
    renderer.setAnimationLoop(null);
  };

  const canvas = renderer.domElement;
  const onLost = (e) => {
    e.preventDefault();
    stopLoop();
  };
  const onRestored = () => startLoop();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  startLoop();

  return {
    setRouteVisible(v) {
      routeGroup.visible = v;
      requestRender();
    },
    setMeasurementsVisible(v) {
      measureGroup.visible = v;
      requestRender();
    },
    resetView() {
      userMoved = false;
      applyStart();
    },
    show() {
      resize();
      startLoop();
    },
    hide() {
      stopLoop();
    },
    dispose() {
      stopLoop();
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
