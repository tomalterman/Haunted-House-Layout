// Group 4 (Schoolyard Dangers) starter: a giant inflatable ball drops into the third lane,
// drifts down it, and knocks into a stack of giant cardboard boxes while a giant soccer ball
// rolls in from the lane entrance. A red spotlight pools on the lane.
//
// Positions are plan feet: x across the gym, y down the plan, height above the floor.
// The third lane runs between partitions P2 (x 43) and P3 (x 55).

const cardboard = (id, x, height) => ({
  id,
  label: 'Giant cardboard box',
  shape: 'box',
  size: { width: 3.5, height: 3.5, depth: 3.5 },
  mass: 4,
  bounce: 0.15,
  friction: 0.6,
  drag: 1.05,
  rollingResistance: 0.3,
  look: { color: '#b8875a', pattern: 'cardboard' },
  start: { x, height, y: 47 },
});

export default {
  id: 'schoolyard-demo',
  name: 'Schoolyard demo (group 4)',
  props: [
    {
      id: 'inflatable-ball',
      label: '6.5 ft inflatable ball',
      shape: 'sphere',
      size: { diameter: 6.5 },
      mass: 6,
      bounce: 0.6,
      friction: 0.5,
      drag: 0.47,
      rollingResistance: 0.1,
      look: { color: '#d7263d', pattern: 'panels', accent: '#1b4fd8' },
      start: { x: 49.6, height: 22, y: 46 },
      velocity: { x: 0, height: 0, y: -1.5 },
      dropDelay: 1.5,
    },
    cardboard('box-left', 47, 1.75),
    cardboard('box-right', 51, 1.75),
    cardboard('box-top', 49.4, 5.3),
    {
      id: 'soccer-ball',
      label: 'Giant soccer ball',
      shape: 'sphere',
      size: { diameter: 5 },
      mass: 10,
      bounce: 0.5,
      friction: 0.6,
      drag: 0.47,
      rollingResistance: 0.15,
      look: { color: '#f4f4f0', pattern: 'soccer', accent: '#151515' },
      start: { x: 47.5, height: 2.5, y: 25 },
      velocity: { x: 0, height: 0, y: 7 },
    },
  ],
  lights: [
    {
      type: 'spot',
      color: '#ff3b30',
      intensity: 6000,
      angle: 32,
      position: { x: 49, height: 18, y: 44 },
      target: { x: 49, height: 0, y: 40 },
      castShadow: true,
    },
    { type: 'point', color: '#6aa8ff', intensity: 400, position: { x: 44, height: 7, y: 52 } },
  ],
};
