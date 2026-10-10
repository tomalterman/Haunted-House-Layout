// Scene registry. Each scene is a plain data file in this folder: props (things physics moves)
// and lights. To add an idea, copy schoolyard-demo.js, change it, and list it below. The
// Scene dropdown shows them in this order; `npm test` checks every scene is valid.
//
// Prop fields: id, label, shape (sphere | box | cylinder), size (diameter / width, height,
// depth in feet), mass (lb), bounce (0-1), friction, drag (air drag coefficient, about 0.47
// for a ball, 1.05 for a box), rollingResistance (0-1), look { color, pattern?, accent? },
// start { x, height, y }, velocity { x, height, y } (ft/s), dropDelay (seconds).
// Light fields: type (spot | point), color, intensity, position, target (spot only),
// angle (spot cone, degrees), castShadow.
//
// Props may also be held until released: dropDelay 'manual' waits for the Release button.
// Fixtures are rig pieces (ramps, booths, stop bars, drapes), each a box: id, label,
// size { width, height, depth }, at (center), yaw (plan angle of the width axis, degrees),
// slope (degrees, depth axis tilting down), look, and optionally:
// - hinge { edge (left, right, bottom, top), mass (lb), opens (degrees it can swing toward
//   +depth), latched (pinned until the release) }: a panel props can push about one edge.
// - dropsOnRelease: a kabuki drape. It blocks the view but not props, and falls to the floor
//   on release.

import ballDropRig from './ball-drop-rig.js';
import schoolyardDemo from './schoolyard-demo.js';
import empty from './empty.js';

export const SCENES = [ballDropRig, schoolyardDemo, empty];
export const DEFAULT_SCENE_ID = ballDropRig.id;

export const sceneById = (id) => SCENES.find((s) => s.id === id);
