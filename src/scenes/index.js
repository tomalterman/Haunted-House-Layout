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

import schoolyardDemo from './schoolyard-demo.js';
import empty from './empty.js';

export const SCENES = [schoolyardDemo, empty];
export const DEFAULT_SCENE_ID = schoolyardDemo.id;

export const sceneById = (id) => SCENES.find((s) => s.id === id);
