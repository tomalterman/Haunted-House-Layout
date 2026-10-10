// Physics world for the sandbox, built from the layout plus a scene. No three.js here, so it
// runs the same in the browser and under Node tests.
//
// Units are feet, pounds, and seconds. Coordinates follow the plan: x across, y down the plan,
// and height up. In the physics world that is (x, height, y).

import * as CANNON from '../vendor/cannon-es/cannon-es.js';

export const GRAVITY = 32.17; // ft/s²
export const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 8; // a slow frame drops sim time instead of stalling the page
const MAX_FRAME = 0.25;
const AIR_DENSITY = 0.0765; // lb/ft³
export const DRAPE_PILE = 0.4; // ft of a dropped drape heaped on the floor

const UP = new CANNON.Vec3(0, 1, 0);
const DEG = Math.PI / 180;

// Collision groups: the gym and rig fixtures, and the props that move.
const STATIC = 1;
const PROP = 2;

function shapeOf(prop) {
  const s = prop.size;
  if (prop.shape === 'sphere') return new CANNON.Sphere(s.diameter / 2);
  if (prop.shape === 'box') return new CANNON.Box(new CANNON.Vec3(s.width / 2, s.height / 2, s.depth / 2));
  if (prop.shape === 'cylinder') return new CANNON.Cylinder(s.diameter / 2, s.diameter / 2, s.height, 16);
  throw new Error(`Unknown shape "${prop.shape}" for prop ${prop.id}`);
}

// Area facing the airflow, averaged over orientations for non-spheres.
function frontalArea(prop) {
  const s = prop.size;
  if (prop.shape === 'sphere') return Math.PI * (s.diameter / 2) ** 2;
  if (prop.shape === 'box') return (s.width * s.height + s.height * s.depth + s.width * s.depth) / 3;
  return (Math.PI * (s.diameter / 2) ** 2 + s.diameter * s.height) / 2;
}

// Orientation of a scene fixture. `yaw` is the plan angle of the box's width axis, measured
// from +x toward +y like a wall's direction. `slope` tilts the depth axis down toward +depth.
function fixtureQuaternion({ yaw = 0, slope = 0 }) {
  return new CANNON.Quaternion().setFromEuler(slope * DEG, -yaw * DEG, 0, 'YXZ');
}

// Hinge edges in a fixture's own frame (width x, height y, depth z). Each axis is signed so a
// positive angle swings the free edge toward +depth.
const HINGE_EDGES = {
  left: { pivot: (s) => new CANNON.Vec3(-s.width / 2, 0, 0), axis: new CANNON.Vec3(0, -1, 0) },
  right: { pivot: (s) => new CANNON.Vec3(s.width / 2, 0, 0), axis: new CANNON.Vec3(0, 1, 0) },
  bottom: { pivot: (s) => new CANNON.Vec3(0, -s.height / 2, 0), axis: new CANNON.Vec3(1, 0, 0) },
  top: { pivot: (s) => new CANNON.Vec3(0, s.height / 2, 0), axis: new CANNON.Vec3(-1, 0, 0) },
};

// A static box centered on segment a-b, standing on the floor.
function wallBody(a, b, height, thickness, material) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) + thickness;
  const body = new CANNON.Body({ mass: 0, material, collisionFilterGroup: STATIC });
  body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, height / 2, thickness / 2)));
  body.position.set((a.x + b.x) / 2, height / 2, (a.y + b.y) / 2);
  body.quaternion.setFromAxisAngle(UP, -Math.atan2(b.y - a.y, b.x - a.x));
  return body;
}

export function createPhysics(layout, scene) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0), allowSleep: true });
  world.solver.iterations = 20;

  // Static surfaces pass each prop's own bounce and friction straight through
  // (cannon multiplies the two materials in a contact).
  const fixed = new CANNON.Material({ friction: 1, restitution: 1 });

  const floor = new CANNON.Body({ mass: 0, material: fixed, shape: new CANNON.Plane(), collisionFilterGroup: STATIC });
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  const t = layout.wallThickness;
  for (const w of layout.walls) world.addBody(wallBody(w.a, w.b, w.height, t, fixed));
  for (const s of layout.tentSides) world.addBody(wallBody(s.a, s.b, layout.tentHeight, t, fixed));
  const st = layout.stage;
  const stage = new CANNON.Body({ mass: 0, material: fixed, collisionFilterGroup: STATIC });
  stage.addShape(new CANNON.Box(new CANNON.Vec3(st.width / 2, st.height / 2, st.depth / 2)));
  stage.position.set(st.x + st.width / 2, st.height / 2, st.y + st.depth / 2);
  world.addBody(stage);

  // Rig pieces from the scene: ramps, booths, stop bars, drapes. A hinged fixture is a light
  // panel that swings about one edge; only props push it. A drop fixture is a drape: it blocks
  // sight but not props, and on release it falls to the floor.
  const hingeAnchor = new CANNON.Body({ mass: 0 });
  world.addBody(hingeAnchor);
  const fixtures = (scene.fixtures ?? []).map((spec) => {
    const s = spec.size;
    const body = new CANNON.Body({ mass: 0, material: fixed, collisionFilterGroup: STATIC, collisionResponse: !spec.dropsOnRelease });
    body.addShape(new CANNON.Box(new CANNON.Vec3(s.width / 2, s.height / 2, s.depth / 2)));
    if (spec.dropsOnRelease) body.type = CANNON.Body.KINEMATIC;
    const f = { spec, body, restPosition: new CANNON.Vec3(spec.at.x, spec.at.height, spec.at.y), restQuaternion: fixtureQuaternion(spec) };
    body.position.copy(f.restPosition);
    body.quaternion.copy(f.restQuaternion);
    world.addBody(body);
    if (spec.hinge) hinge(f);
    return f;
  });
  const hinged = fixtures.filter((f) => f.spec.hinge);
  const drapes = fixtures.filter((f) => f.spec.dropsOnRelease);
  // A released drape falls freely and heaps up on the floor: it keeps sinking until only a pile
  // DRAPE_PILE high shows above the floor. Fabric drags a little in the air, which free fall
  // ignores, so it lands a moment early.
  const pileCenter = (f) => DRAPE_PILE - f.spec.size.height / 2;
  const dropDrapes = () => {
    for (const f of drapes) {
      if (!f.falling) continue;
      f.fallSpeed += GRAVITY * FIXED_STEP;
      const p = f.body.position;
      p.y = Math.max(p.y - f.fallSpeed * FIXED_STEP, pileCenter(f));
      if (p.y === pileCenter(f)) f.falling = false;
      f.body.aabbNeedsUpdate = true;
    }
  };

  // Set up a fixture's hinge: a constraint to the world along one edge, with stops at shut and at
  // fully open.
  function hinge(f) {
    const { spec, body } = f;
    const h = spec.hinge;
    const edge = HINGE_EDGES[h.edge];
    body.type = CANNON.Body.DYNAMIC;
    body.mass = h.mass;
    body.collisionFilterMask = PROP;
    body.sleepSpeedLimit = 0.2;
    body.sleepTimeLimit = 0.5;
    body.updateMassProperties();
    f.pivotLocal = edge.pivot(spec.size);
    f.axisLocal = edge.axis;
    f.pivotWorld = f.restPosition.vadd(f.restQuaternion.vmult(f.pivotLocal));
    f.axisWorld = f.restQuaternion.vmult(f.axisLocal);
    f.maxAngle = h.opens * DEG;
    f.constraint = new CANNON.HingeConstraint(body, hingeAnchor, { pivotA: f.pivotLocal, axisA: f.axisLocal, pivotB: f.pivotWorld, axisB: f.axisWorld });
    world.addConstraint(f.constraint);
  }
  const hingeAngle = (f) => {
    const q = f.restQuaternion.conjugate().mult(f.body.quaternion);
    const a = 2 * Math.atan2(q.x * f.axisLocal.x + q.y * f.axisLocal.y + q.z * f.axisLocal.z, q.w);
    return Math.atan2(Math.sin(a), Math.cos(a));
  };
  const setHingeAngle = (f, angle) => {
    const { body } = f;
    body.quaternion.copy(f.restQuaternion.mult(new CANNON.Quaternion().setFromAxisAngle(f.axisLocal, angle)));
    body.position.copy(f.pivotWorld.vsub(body.quaternion.vmult(f.pivotLocal)));
    body.velocity.setZero();
    body.angularVelocity.setZero();
  };
  // A pinned (latched) panel stays put until the release pulls the pin.
  const latch = (f) => {
    f.body.type = CANNON.Body.KINEMATIC;
    f.constraint.disable();
  };
  const unlatch = (f) => {
    f.body.type = CANNON.Body.DYNAMIC;
    // enable() would also switch on the hinge's motor, which brakes it; leave that off.
    for (const eq of f.constraint.equations) eq.enabled = eq !== f.constraint.motorEquation;
    f.body.wakeUp();
  };
  // The hinge's stops: shut against the frame at 0, fully open at its limit.
  const hingeLimits = () => {
    for (const f of hinged) {
      if (f.body.type !== CANNON.Body.DYNAMIC) continue;
      const a = hingeAngle(f);
      if (a < 0) setHingeAngle(f, 0);
      else if (a > f.maxAngle) setHingeAngle(f, f.maxAngle);
    }
  };

  const props = scene.props.map((spec) => {
    const body = new CANNON.Body({
      mass: spec.mass,
      material: new CANNON.Material({ friction: spec.friction, restitution: spec.bounce }),
      shape: shapeOf(spec),
      angularDamping: spec.rollingResistance ?? 0.1,
      linearDamping: 0, // air drag is applied as a real quadratic force instead
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 0.5,
      collisionFilterGroup: PROP,
    });
    world.addBody(body);
    return { spec, body, dragK: 0.5 * AIR_DENSITY * (spec.drag ?? 0) * frontalArea(spec), pending: false };
  });

  const hold = (p) => {
    p.pending = true;
    p.body.type = CANNON.Body.KINEMATIC;
    p.body.mass = 0;
    p.body.updateMassProperties();
    p.body.velocity.setZero();
    p.body.angularVelocity.setZero();
  };
  // The release pulls every pin in the rig.
  const releaseRig = () => {
    released = true;
    for (const f of hinged) if (f.spec.hinge.latched) unlatch(f);
    for (const f of drapes) {
      f.falling = true;
      f.fallSpeed = 0;
    }
  };
  const release = (p) => {
    p.pending = false;
    p.body.type = CANNON.Body.DYNAMIC;
    p.body.mass = p.spec.mass;
    p.body.updateMassProperties();
    const v = p.spec.velocity;
    if (v) p.body.velocity.set(v.x, v.height, v.y);
    p.body.wakeUp();
  };

  let accumulator = 0;
  let released = false;
  const sightResult = new CANNON.RaycastResult();
  const api = {
    time: 0,
    get released() {
      return released;
    },
    reset() {
      api.time = 0;
      released = false;
      for (const f of drapes) {
        f.body.position.copy(f.restPosition);
        f.body.aabbNeedsUpdate = true;
        f.falling = false;
      }
      for (const f of hinged) {
        f.body.position.copy(f.restPosition); // exactly, so replays match to the last bit
        f.body.quaternion.copy(f.restQuaternion);
        f.body.updateInertiaWorld(true); // cannon refreshes this only while integrating
        f.body.aabbNeedsUpdate = true;
        f.body.velocity.setZero();
        f.body.angularVelocity.setZero();
        if (f.spec.hinge.latched) latch(f);
        else {
          unlatch(f);
          f.body.sleep();
        }
      }
      world.time = 0; // sleep timers run on the world clock; a stale clock makes replays drift
      accumulator = 0;
      for (const p of props) {
        const { body, spec } = p;
        body.position.set(spec.start.x, spec.start.height, spec.start.y);
        body.previousPosition.copy(body.position);
        body.interpolatedPosition.copy(body.position);
        body.quaternion.set(0, 0, 0, 1);
        body.velocity.setZero();
        body.angularVelocity.setZero();
        body.force.setZero();
        body.torque.setZero();
        if (spec.dropDelay === 'manual' || spec.dropDelay > 0) hold(p);
        else release(p);
      }
    },
    // Let go of everything still held (the operator pulls the release).
    release() {
      for (const p of props) if (p.pending) release(p);
      releaseRig();
    },
    // Advance by one frame's elapsed time in fixed steps.
    step(frameSeconds) {
      accumulator += Math.min(frameSeconds, MAX_FRAME);
      let n = 0;
      while (accumulator >= FIXED_STEP && n < MAX_SUBSTEPS) {
        for (const p of props) {
          if (p.pending && typeof p.spec.dropDelay === 'number' && api.time >= p.spec.dropDelay) {
            release(p);
            releaseRig();
          }
          if (!p.pending && p.dragK > 0) {
            // Quadratic air drag at the center of mass, opposing motion.
            const v = p.body.velocity;
            const k = -p.dragK * v.length();
            p.body.force.x += k * v.x;
            p.body.force.y += k * v.y;
            p.body.force.z += k * v.z;
          }
        }
        dropDrapes();
        world.step(FIXED_STEP);
        hingeLimits();
        api.time += FIXED_STEP;
        accumulator -= FIXED_STEP;
        n++;
      }
      if (n === MAX_SUBSTEPS) accumulator = 0;
    },
    // True while a timed drop is still scheduled or anything is moving. A prop waiting for a
    // manual release needs no simulation time.
    isActive() {
      return (
        props.some((p) => (p.pending ? typeof p.spec.dropDelay === 'number' : p.body.sleepState !== CANNON.Body.SLEEPING)) ||
        hinged.some((f) => f.body.type === CANNON.Body.DYNAMIC && f.body.sleepState !== CANNON.Body.SLEEPING) ||
        drapes.some((f) => f.falling)
      );
    },
    // Does the scene hold anything for a manual release?
    canRelease() {
      return props.some((p) => p.spec.dropDelay === 'manual');
    },
    // True while some prop waits for a manual release.
    awaitingRelease() {
      return props.some((p) => p.pending && p.spec.dropDelay === 'manual');
    },
    // Rig pieces where they are now, with how far each hinged one is open (degrees).
    fixtures() {
      return fixtures.map((f) => ({
        id: f.spec.id,
        x: f.body.position.x,
        height: f.body.position.y,
        y: f.body.position.z,
        quaternion: [f.body.quaternion.x, f.body.quaternion.y, f.body.quaternion.z, f.body.quaternion.w],
        angle: f.spec.hinge ? hingeAngle(f) / DEG : 0,
      }));
    },
    // Can an eye at `from` see the point `to`? Walls, the stage, and every fixture (drapes
    // included) block the view; props do not. Points are plan feet {x, height, y}.
    canSee(from, to) {
      sightResult.reset();
      return !world.raycastAny(
        new CANNON.Vec3(from.x, from.height, from.y),
        new CANNON.Vec3(to.x, to.height, to.y),
        { collisionFilterMask: STATIC, checkCollisionResponse: false, skipBackfaces: false },
        sightResult,
      );
    },
    poses() {
      return props.map(({ spec, body, pending }) => ({
        id: spec.id,
        x: body.position.x,
        height: body.position.y,
        y: body.position.z,
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
        sleeping: !pending && body.sleepState === CANNON.Body.SLEEPING,
      }));
    },
  };
  api.reset();
  return api;
}
