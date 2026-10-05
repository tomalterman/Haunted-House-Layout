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

const UP = new CANNON.Vec3(0, 1, 0);

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

// A static box centered on segment a-b, standing on the floor.
function wallBody(a, b, height, thickness, material) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) + thickness;
  const body = new CANNON.Body({ mass: 0, material });
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

  const floor = new CANNON.Body({ mass: 0, material: fixed, shape: new CANNON.Plane() });
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  const t = layout.wallThickness;
  for (const w of layout.walls) world.addBody(wallBody(w.a, w.b, w.height, t, fixed));
  for (const s of layout.tentSides) world.addBody(wallBody(s.a, s.b, layout.tentHeight, t, fixed));
  const st = layout.stage;
  const stage = new CANNON.Body({ mass: 0, material: fixed });
  stage.addShape(new CANNON.Box(new CANNON.Vec3(st.width / 2, st.height / 2, st.depth / 2)));
  stage.position.set(st.x + st.width / 2, st.height / 2, st.y + st.depth / 2);
  world.addBody(stage);

  const props = scene.props.map((spec) => {
    const body = new CANNON.Body({
      mass: spec.mass,
      material: new CANNON.Material({ friction: spec.friction, restitution: spec.bounce }),
      shape: shapeOf(spec),
      angularDamping: spec.rollingResistance ?? 0.1,
      linearDamping: 0, // air drag is applied as a real quadratic force instead
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 0.5,
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
  const api = {
    time: 0,
    reset() {
      api.time = 0;
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
        if (spec.dropDelay > 0) hold(p);
        else release(p);
      }
    },
    // Advance by one frame's elapsed time in fixed steps.
    step(frameSeconds) {
      accumulator += Math.min(frameSeconds, MAX_FRAME);
      let n = 0;
      while (accumulator >= FIXED_STEP && n < MAX_SUBSTEPS) {
        for (const p of props) {
          if (p.pending && api.time >= p.spec.dropDelay) release(p);
          if (!p.pending && p.dragK > 0) {
            // Quadratic air drag at the center of mass, opposing motion.
            const v = p.body.velocity;
            const k = -p.dragK * v.length();
            p.body.force.x += k * v.x;
            p.body.force.y += k * v.y;
            p.body.force.z += k * v.z;
          }
        }
        world.step(FIXED_STEP);
        api.time += FIXED_STEP;
        accumulator -= FIXED_STEP;
        n++;
      }
      if (n === MAX_SUBSTEPS) accumulator = 0;
    },
    // True while a drop is still scheduled or anything is moving.
    isActive() {
      return props.some((p) => p.pending || p.body.sleepState !== CANNON.Body.SLEEPING);
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
