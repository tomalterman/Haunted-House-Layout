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

function textSprite(text, color) {
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
  sprite.scale.set((canvas.width / canvas.height) * 2.6, 2.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

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
    const dx = w.b.x - w.a.x;
    const dz = w.b.y - w.a.y;
    const len = Math.hypot(dx, dz) + WALL_THICKNESS;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, w.height, WALL_THICKNESS), wallMat);
    mesh.position.set((w.a.x + w.b.x) / 2, w.height / 2, (w.a.y + w.b.y) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.name = w.id;
    root.add(mesh);
  }

  // Tents: roof outline, legs, and faint panels on closed sides so walls stay dominant.
  const outlineMat = new THREE.LineBasicMaterial({ color: colors.tent });
  const roofMat = new THREE.MeshBasicMaterial({ color: colors.tent, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const sideMat = new THREE.MeshBasicMaterial({ color: colors.tent, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const legMat = new THREE.MeshStandardMaterial({ color: colors.tentLeg });
  for (const t of layout.tents) {
    const s = t.size;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(s, s), roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(t.x + s / 2, TENT_ROOF, t.y + s / 2);
    root.add(roof);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(s, s)), outlineMat);
    edges.rotation.x = -Math.PI / 2;
    edges.position.copy(roof.position);
    root.add(edges);
    for (const [lx, lz] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, TENT_ROOF, 0.2), legMat);
      leg.position.set(t.x + lx, TENT_ROOF / 2, t.y + lz);
      root.add(leg);
    }
  }
  for (const side of layout.tentSides) {
    const dx = side.b.x - side.a.x;
    const dz = side.b.y - side.a.y;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(dx, dz), TENT_ROOF), sideMat);
    panel.position.set((side.a.x + side.b.x) / 2, TENT_ROOF / 2, (side.a.y + side.b.y) / 2);
    panel.rotation.y = -Math.atan2(dz, dx);
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
  for (const u of [0.12, 0.3, 0.48, 0.66, 0.84]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 12), routeMat);
    cone.position.copy(curve.getPointAt(u));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(u).normalize());
    routeGroup.add(cone);
  }
  routeGroup.name = 'route';
  root.add(routeGroup);

  return { scene, routeGroup };
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function mountView3D(container, layout, { showRoute = true } = {}) {
  if (!hasWebGL()) throw new Error('WebGL is not available');

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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'view3d-canvas';
  container.appendChild(renderer.domElement);

  const { scene, routeGroup } = buildScene(layout, colors);
  routeGroup.visible = showRoute;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
  const start = new THREE.Vector3();
  let userMoved = false;

  // Frame the whole room for the current screen shape. Landscape looks in from the
  // entrance corner; portrait looks in from the entrance wall so the long side runs away.
  const fitStart = (aspect) => {
    const portrait = aspect < 1;
    const dir = portrait ? new THREE.Vector3(-1, 0.95, 0.3) : new THREE.Vector3(-0.55, 0.62, 0.6);
    const halfExtent = portrait ? layout.room.depth * 0.62 : layout.room.width * 0.6;
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
    const distance = Math.max(80, halfExtent / Math.tan(halfFov));
    start.copy(dir.normalize().multiplyScalar(distance));
    return distance;
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.08; // stay above the floor
  controls.minDistance = 20;
  controls.addEventListener('start', () => {
    userMoved = true;
  });

  const applyStart = () => {
    const distance = fitStart(camera.aspect);
    controls.maxDistance = distance * 1.6;
    camera.position.copy(start);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) applyStart();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let running = false;
  const frame = () => {
    controls.update();
    renderer.render(scene, camera);
  };
  const startLoop = () => {
    if (!running) {
      running = true;
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
    canvas,
    setRouteVisible(v) {
      routeGroup.visible = v;
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
      renderer.dispose();
      canvas.remove();
    },
  };
}
