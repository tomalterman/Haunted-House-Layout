// Realistic 3D sandbox of the gym: textured surfaces, real-time lights and shadows, a physics
// world for scene props, and a free fly-through camera. Built from the same layout as the
// 2D plan. Plan x maps to world x, plan y to world z, and world y is up. Units are feet.

import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { GROUP_COLORS } from './layout.js';
import { createPhysics } from './physics.js';
import { stepFly, attachFlyInput } from './flycam.js';
import { SCENES, DEFAULT_SCENE_ID, sceneById } from './scenes/index.js';
import { validateScene } from './scenes/validate.js';
import { gymFloor, blackSheeting, pine, fabric, propPattern } from './textures.js';

const RAIL = 0.3; // pine frame rail and post size

// Base lighting presets. Scene lights add on top of either.
const PRESETS = {
  work: { background: 0x34322f, hemi: 1.1, overhead: 2.4, moon: 0, env: 0.5, fog: 0 },
  show: { background: 0x040406, hemi: 0.07, overhead: 0, moon: 0.3, env: 0.05, fog: 0.012 },
};

function overlayMaterial(params) {
  return new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, ...params });
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false, fog: false }));
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// A round group-number badge: white disc, colored ring, dark number.
function badgeSprite(n, color) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#17171a';
  ctx.font = '700 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false, fog: false }));
  sprite.scale.set(4.5, 4.5, 1);
  sprite.renderOrder = 11;
  return sprite;
}

// Center an object on segment a-b at height y and turn it to run along the segment.
function placeOnSegment(obj, a, b, y) {
  obj.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
  obj.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
}

const segmentLength = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// A wall: black sheeting over a pine frame, with the rail on top and posts at the ends.
function buildWall(a, b, height, thickness, mats) {
  const group = new THREE.Group();
  const len = segmentLength(a, b) + thickness;
  const map = mats.sheet.map.clone();
  const bump = mats.sheet.bumpMap.clone();
  map.repeat.set(len / 8, height / 8);
  bump.repeat.copy(map.repeat);
  const sheet = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.5, roughness: 0.42, metalness: 0 });
  group.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, height - RAIL, thickness), sheet)));
  group.children[0].position.y = (height - RAIL) / 2;
  const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, RAIL, thickness + 0.1), mats.pine));
  rail.position.y = height - RAIL / 2;
  group.add(rail);
  for (const end of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RAIL, height - RAIL, thickness + 0.1), mats.pine));
    post.position.set((end * (len - RAIL)) / 2, (height - RAIL) / 2, 0);
    group.add(post);
  }
  placeOnSegment(group, a, b, 0);
  for (const s of [map, bump]) s.needsUpdate = true;
  return group;
}

function buildGym(layout, quality) {
  const W = layout.room.width;
  const D = layout.room.depth;
  const scene = new THREE.Scene();

  // Center the room on the origin; everything else is placed in plan feet under root.
  const root = new THREE.Group();
  root.position.set(-W / 2, 0, -D / 2);
  scene.add(root);

  const mats = {
    sheet: blackSheeting(),
    pine: new THREE.MeshStandardMaterial({ map: pine(), roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ map: fabric(), roughness: 0.9, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.85 }),
  };

  const floor = shadowed(
    new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: gymFloor(W, D, quality === 'high' ? 24 : 12), roughness: 0.32, metalness: 0 }),
    ),
    false,
    true,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  root.add(floor);

  // Darker surround so the gym edge reads when flying outside it.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, D + 400), new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(W / 2, -0.02, D / 2);
  apron.receiveShadow = true;
  root.add(apron);

  const st = layout.stage;
  const stage = shadowed(
    new THREE.Mesh(new THREE.BoxGeometry(st.width, st.height, st.depth), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 })),
  );
  stage.position.set(st.x + st.width / 2, st.height / 2, st.y + st.depth / 2);
  root.add(stage);

  const t = layout.wallThickness;
  for (const w of layout.walls) {
    const wall = buildWall(w.a, w.b, w.height, t, mats);
    wall.name = w.id;
    root.add(wall);
  }

  // Pop-up canopy tents: aluminum legs, peaked fabric roof, fabric sidewalls on closed sides.
  const TH = layout.tentHeight;
  const legGeo = new THREE.BoxGeometry(0.15, TH, 0.15);
  for (const tent of layout.tents) {
    const s = tent.size;
    const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(s / Math.SQRT2, 1.6, 4, 1, true), mats.fabric));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(tent.x + s / 2, TH + 0.8, tent.y + s / 2);
    root.add(roof);
    for (const [lx, lz] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      const leg = shadowed(new THREE.Mesh(legGeo, mats.metal));
      leg.position.set(tent.x + lx, TH / 2, tent.y + lz);
      root.add(leg);
    }
  }
  for (const side of layout.tentSides) {
    const panel = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(segmentLength(side.a, side.b), TH), mats.fabric));
    placeOnSegment(panel, side.a, side.b, TH / 2);
    root.add(panel);
  }

  return { scene, root };
}

function buildOverlays(layout, root) {
  const labelColor = '#1c1c21';
  const doorColor = '#2f7d5b';

  // Door markers and labels.
  const doors = new THREE.Group();
  for (const [name, door, dir] of [['Entrance', layout.doors.entrance, -1], ['Exit', layout.doors.exit, 1]]) {
    const len = door.y1 - door.y0;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, len), overlayMaterial({ color: doorColor }));
    mark.position.set(door.x + dir * 0.4, 0.03, (door.y0 + door.y1) / 2);
    doors.add(mark);
    const label = textSprite(name, doorColor);
    label.position.set(door.x + dir * 3.5, 10, (door.y0 + door.y1) / 2);
    doors.add(label);
  }
  root.add(doors);

  // Visitor route: a thin glowing tube just above the floor, with arrow cones.
  const routeGroup = new THREE.Group();
  const routeMat = overlayMaterial({ color: 0x9b5cf0 });
  const curve = new THREE.CatmullRomCurve3(layout.route.map((p) => new THREE.Vector3(p.x, 0.25, p.y)), false, 'centripetal');
  routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.15, 6, false), routeMat));
  const coneGeo = new THREE.ConeGeometry(0.5, 1.3, 12);
  for (const u of [0.12, 0.3, 0.48, 0.66, 0.84]) {
    const cone = new THREE.Mesh(coneGeo, routeMat);
    cone.position.copy(curve.getPointAt(u));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(u).normalize());
    routeGroup.add(cone);
  }
  root.add(routeGroup);

  // Wall lengths: a tag floating above each wall.
  const measureGroup = new THREE.Group();
  const along = { 'outer-bottom': 0.12, 'outer-left-lower': 0.85 };
  const partitionIds = new Set(layout.partitions.map((p) => p.id));
  for (const w of layout.walls) {
    const ft = Number.isInteger(w.length) ? w.length : w.length.toFixed(1);
    const tag = textSprite(`${ft} ft`, labelColor, 2);
    const nearFloor = w.b.y > w.a.y ? 0.8 : 0.2;
    const at = along[w.id] ?? (partitionIds.has(w.id) ? nearFloor : 0.5);
    tag.position.set(w.a.x + (w.b.x - w.a.x) * at, w.height + 1.6, w.a.y + (w.b.y - w.a.y) * at);
    measureGroup.add(tag);
  }
  root.add(measureGroup);

  // Group areas: tinted floor, a numbered badge, and the width of each doorway on the route.
  const groupLayer = new THREE.Group();
  for (const g of layout.groups) {
    const shape = new THREE.Shape(g.points.map((p) => new THREE.Vector2(p.x, -p.y)));
    const color = GROUP_COLORS[g.n - 1];
    const area = new THREE.Mesh(new THREE.ShapeGeometry(shape), overlayMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
    area.rotation.x = -Math.PI / 2;
    area.position.y = 0.06;
    groupLayer.add(area);
    const badge = badgeSprite(g.n, color);
    badge.position.set(g.at.x, 12, g.at.y);
    groupLayer.add(badge);
  }
  const inset = { entrance: 4, 'g1-g2': -2.5, 'g5-g6': 2.5, exit: -4 };
  for (const o of layout.openings) {
    const tag = textSprite(`${Math.round(o.width * 100) / 100} ft`, labelColor, 1.6);
    tag.position.set(o.x + (inset[o.id] ?? 0), 1.2, (o.y0 + o.y1) / 2);
    groupLayer.add(tag);
  }
  groupLayer.visible = false;
  root.add(groupLayer);

  return { routeGroup, measureGroup, groupLayer };
}

function propMesh(spec) {
  const s = spec.size;
  const geo =
    spec.shape === 'sphere'
      ? new THREE.SphereGeometry(s.diameter / 2, 48, 32)
      : spec.shape === 'box'
        ? new THREE.BoxGeometry(s.width, s.height, s.depth)
        : new THREE.CylinderGeometry(s.diameter / 2, s.diameter / 2, s.height, 32);
  const map = propPattern(spec.look);
  const glossy = spec.look.pattern === 'panels' || spec.look.pattern === 'soccer';
  const mat = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : spec.look.color,
    map,
    roughness: spec.look.roughness ?? (glossy ? 0.3 : 0.85),
  });
  const mesh = shadowed(new THREE.Mesh(geo, mat));
  mesh.name = spec.id;
  return mesh;
}

function disposeObject(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'bumpMap']) m[key]?.dispose();
      m.dispose();
    }
    o.shadow?.map?.dispose();
  });
}

export function pickQuality(search = location.search) {
  const q = new URLSearchParams(search).get('quality');
  if (q === 'low' || q === 'high') return q;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  return coarse || window.innerWidth < 700 ? 'low' : 'high';
}

export function mountView3D(
  container,
  layout,
  { showRoute = true, showMeasurements = true, showGroups = false, sceneId = DEFAULT_SCENE_ID, lights = 'work', quality = pickQuality() } = {},
) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: quality === 'high' });
  } catch (err) {
    throw new Error(`WebGL is not available: ${err.message}`);
  }
  renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the gym is static; redraw shadows only when props or lights change
  const canvas = renderer.domElement;
  canvas.className = 'view3d-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D sandbox. Drag to look, W A S D to fly, E and Q to rise and sink.');
  container.appendChild(canvas);

  const W = layout.room.width;
  const D = layout.room.depth;
  const { scene, root } = buildGym(layout, quality);
  const { routeGroup, measureGroup, groupLayer } = buildOverlays(layout, root);
  routeGroup.visible = showRoute;
  measureGroup.visible = showMeasurements;
  groupLayer.visible = showGroups;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  envScene.traverse((o) => o.geometry?.dispose());
  pmrem.dispose();

  // Base lights.
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x5a4a38, 1);
  scene.add(hemi);
  const shadowSize = quality === 'high' ? 2048 : 1024;
  const directional = (color) => {
    const light = new THREE.DirectionalLight(color, 1);
    light.castShadow = quality === 'high'; // low quality keeps shadows for scene lights only
    light.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(light.shadow.camera, { left: -W / 2 - 8, right: W / 2 + 8, top: D / 2 + 8, bottom: -D / 2 - 8, near: 1, far: 250 });
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.05;
    light.shadow.radius = 3;
    scene.add(light, light.target);
    return light;
  };
  const overhead = directional(0xfff1dc); // gym lights, high and slightly off-center
  overhead.position.set(-18, 90, 26);
  const moon = directional(0x6f86c9); // faint cool fill so Show is dark, not black
  moon.position.set(30, 70, -40);

  let lightsMode = PRESETS[lights] ? lights : 'work';
  const applyLights = () => {
    const p = PRESETS[lightsMode];
    scene.background = new THREE.Color(p.background);
    hemi.intensity = p.hemi;
    overhead.intensity = p.overhead;
    overhead.visible = p.overhead > 0;
    moon.intensity = p.moon;
    moon.visible = p.moon > 0;
    scene.environmentIntensity = p.env;
    scene.fog = p.fog ? new THREE.FogExp2(p.background, p.fog) : null;
    renderer.shadowMap.needsUpdate = true;
  };
  applyLights();

  // Scene props and lights.
  let current = null;
  const loadScene = (id) => {
    const spec = validateScene(sceneById(id) ?? sceneById(DEFAULT_SCENE_ID), layout);
    if (current) {
      root.remove(current.group);
      disposeObject(current.group);
    }
    const group = new THREE.Group();
    const meshes = new Map(spec.props.map((p) => [p.id, propMesh(p)]));
    for (const m of meshes.values()) group.add(m);
    spec.lights.forEach((l, i) => {
      const color = new THREE.Color(l.color);
      const light =
        l.type === 'spot'
          ? new THREE.SpotLight(color, l.intensity, 0, THREE.MathUtils.degToRad(l.angle ?? 30), 0.45, 2)
          : new THREE.PointLight(color, l.intensity, 0, 2);
      light.position.set(l.position.x, l.position.height, l.position.y);
      // Low quality keeps only the first scene light casting shadows.
      light.castShadow = Boolean(l.castShadow) && (quality === 'high' || i === 0);
      if (light.castShadow) {
        light.shadow.mapSize.set(quality === 'high' ? 1024 : 512, quality === 'high' ? 1024 : 512);
        light.shadow.bias = -0.0008;
        light.shadow.radius = 3;
      }
      if (l.type === 'spot') {
        light.target.position.set(l.target.x, l.target.height, l.target.y);
        group.add(light.target);
      }
      group.add(light);
      // A small glowing fixture shows where the light hangs.
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), overlayMaterial({ color }));
      bulb.position.copy(light.position);
      group.add(bulb);
    });
    root.add(group);
    current = { spec, group, meshes, physics: createPhysics(layout, spec) };
    syncProps();
    requestRender();
  };
  const syncProps = () => {
    renderer.shadowMap.needsUpdate = true;
    for (const p of current.physics.poses()) {
      const mesh = current.meshes.get(p.id);
      mesh.position.set(p.x, p.height, p.y);
      mesh.quaternion.set(...p.quaternion);
    }
  };

  // Camera and fly controls.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
  camera.rotation.order = 'YXZ';
  const bounds = { min: { x: -W / 2 - 150, y: 0.5, z: -D / 2 - 150 }, max: { x: W / 2 + 150, y: 150, z: D / 2 + 150 } };
  let fly = { x: 0, y: 40, z: 60, yaw: 0, pitch: -0.5 };
  const applyCamera = () => {
    camera.position.set(fly.x, fly.y, fly.z);
    camera.rotation.set(fly.pitch, fly.yaw, 0);
  };
  // Frame the whole gym from above the entrance corner (or the entrance wall in portrait).
  const startPose = (aspect) => {
    const portrait = aspect < 1;
    const dir = portrait ? new THREE.Vector3(-1, 0.95, 0.3) : new THREE.Vector3(-0.55, 0.62, 0.6);
    const across = portrait ? D * 0.72 : W * 0.6;
    const up = portrait ? W * 0.5 : D * 0.82;
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(across / (tanHalfV * aspect), up / tanHalfV);
    const p = dir.normalize().multiplyScalar(distance);
    return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.x, p.z), pitch: -Math.atan2(p.y, Math.hypot(p.x, p.z)) };
  };

  let dirty = true;
  let userMoved = false;
  const requestRender = () => {
    dirty = true;
  };
  const input = attachFlyInput(canvas, () => {
    userMoved = true;
  });

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) {
      fly = startPose(camera.aspect);
      applyCamera();
    }
    requestRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  loadScene(sceneId);
  resize();

  // Render only when the camera moves, a prop moves, or a setting changes.
  let last = performance.now();
  let running = false;
  let frames = 0;
  const frame = (now = performance.now()) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const step = stepFly(fly, input.take(), dt, { bounds });
    if (step.moved) {
      fly = step.state;
      applyCamera();
      dirty = true;
    }
    if (current.physics.isActive()) {
      current.physics.step(dt);
      syncProps();
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      frames++;
      renderer.render(scene, camera);
    }
  };
  const startLoop = () => {
    if (!running) {
      running = true;
      last = performance.now(); // don't count the time spent hidden
      requestRender();
      renderer.setAnimationLoop(frame);
    }
  };
  const stopLoop = () => {
    running = false;
    renderer.setAnimationLoop(null);
  };

  const onLost = (e) => {
    e.preventDefault();
    stopLoop();
  };
  const onRestored = () => startLoop();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  startLoop();

  return {
    scenes: SCENES.map(({ id, name }) => ({ id, name })),
    setRouteVisible(v) {
      routeGroup.visible = v;
      requestRender();
    },
    setMeasurementsVisible(v) {
      measureGroup.visible = v;
      requestRender();
    },
    setGroupsVisible(v) {
      groupLayer.visible = v;
      requestRender();
    },
    setScene(id) {
      loadScene(id);
    },
    setLights(mode) {
      if (!PRESETS[mode]) return;
      lightsMode = mode;
      applyLights();
      requestRender();
    },
    replay() {
      current.physics.reset();
      syncProps();
      requestRender();
    },
    resetView() {
      userMoved = false;
      fly = startPose(camera.aspect);
      applyCamera();
      requestRender();
    },
    focus() {
      canvas.focus({ preventScroll: true });
    },
    // Read-only state for tests and debugging.
    snapshot() {
      return {
        scene: current.spec.id,
        lights: lightsMode,
        quality,
        time: current.physics.time,
        active: current.physics.isActive(),
        props: current.physics.poses(),
        camera: { ...fly },
        overlays: { route: routeGroup.visible, measurements: measureGroup.visible, groups: groupLayer.visible },
        frames,
      };
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
      input.dispose();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      disposeObject(scene);
      scene.environment?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
