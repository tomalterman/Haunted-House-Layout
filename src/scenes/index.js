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
// tether { anchor, length } ties a prop to a point with a slack rope.
// Fixtures are fixed rig pieces (ramps, booths, gates, curtains), each a box: id, label,
// size { width, height, depth }, at (center), yaw (plan angle of the width axis, degrees),
// slope (degrees, depth axis tilting down), look, solid (false lets props pass but still
// blocks sight, like a strip curtain), removeOnRelease (a gate that opens on release).

import ballDropRig from './ball-drop-rig.js';
import ballDropFree from './ball-drop-free.js';
import schoolyardDemo from './schoolyard-demo.js';
import empty from './empty.js';

export const SCENES = [ballDropRig, ballDropFree, schoolyardDemo, empty];
export const DEFAULT_SCENE_ID = ballDropRig.id;

export const sceneById = (id) => SCENES.find((s) => s.id === id);
