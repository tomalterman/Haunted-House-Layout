// The locked gym floor plan, as plain data in feet.
//
// Coordinate frame: origin at the top-left corner of the sketch, x to the
// right, y down (KTD6). The gym is 85 by 60 feet with a 24 foot ceiling; maze
// walls are 8 foot black panels 0.3 feet thick (KTD9).
//
// What came straight off the sketch (docs/plans/assets/gym-floor-plan-sketch.jpg):
//   - the 85 by 60 gym, the 50 foot pony wall along the stage front,
//   - the 10 foot tent squares (three at the entrance, three at the exit),
//   - the 8 foot panel counts along the right corridor and the diagonal.
// What is traced from the sketch's proportions and still needs measuring:
//   - the diagonal wall. The sketch labels it 32 feet, but drawn to scale it
//     spans roughly 40 by 24 feet (about 47 feet long). It is placed here by
//     the drawn proportions, (20,36) to (60,12), not by the 32 foot label.
//   - the three serpentine partitions and the right corridor wall at x 64,
//   - the entrance and exit door positions and the visitor path.
// A measured correction is a one-file change here: every other module reads
// this object and derives its own geometry from it.
//
// Tents are open canopies the path walks through, so they are NOT walls.

const THICKNESS = 0.3;

const wall = (id, a, b) => ({ id, a, b, thickness: THICKNESS });

export const FLOORPLAN = {
  bounds: { w: 85, h: 60 },
  wallHeight: 8,
  ceiling: 24,

  walls: [
    // Outer gym walls, clockwise from the top-left corner.
    wall("outer-top", [0, 0], [85, 0]),
    wall("outer-right", [85, 0], [85, 60]),
    wall("outer-bottom", [85, 60], [0, 60]),
    wall("outer-left", [0, 60], [0, 0]),
    // 50 foot pony wall along the stage front.
    wall("pony", [20, 56], [70, 56]),
    // Diagonal wall, placed by the sketch's proportions (see header).
    wall("diagonal", [20, 36], [60, 12]),
    // Serpentine partitions. The first and third hang from the diagonal wall
    // with a gap at the stage end; the middle one rises from the pony wall.
    wall("partition-1", [30, 30], [30, 50]),
    wall("partition-2", [41, 56], [41, 32]),
    wall("partition-3", [52, 17], [52, 44]),
    // Right corridor wall, four 8 foot panels up from the pony wall.
    wall("right-corridor", [64, 56], [64, 24]),
  ],

  // 10 by 10 pop-up canopies in two L-shaped blocks of three.
  tents: [
    { id: "tent-entrance-1", x: 10, y: 36, size: 10, block: "entrance" },
    { id: "tent-entrance-2", x: 0, y: 46, size: 10, block: "entrance" },
    { id: "tent-entrance-3", x: 10, y: 46, size: 10, block: "entrance" },
    { id: "tent-exit-1", x: 62, y: 4, size: 10, block: "exit" },
    { id: "tent-exit-2", x: 72, y: 4, size: 10, block: "exit" },
    { id: "tent-exit-3", x: 62, y: 14, size: 10, block: "exit" },
  ],

  stage: { x: 20, y: 56, w: 50, h: 4 },

  // Door openings drawn as thin rectangles on the outer walls.
  entrance: { x: 0, y: 47, w: 1, h: 8 },
  exit: { x: 82, y: 4, w: 3, h: 6 },

  // Visitor path: entrance, through the entrance tents, the serpentine, up
  // the right corridor, through the exit tents, to the exit. Routed through
  // the gaps between partitions so it clears every wall (see the test).
  path: [[0, 51], [15, 51], [15, 41], [25, 41], [25, 52], [36, 52], [36, 28], [46, 28], [46, 51], [58, 51], [58, 22], [72, 22], [72, 12], [82, 8]],

  // Named regions in walk order: one-tap starting outlines for team zones.
  // They share edges but never overlap, and all stay inside the gym.
  regions: [
    {
      id: "entrance-tents",
      name: "Entrance tents",
      points: [[0, 36], [20, 36], [20, 56], [0, 56]],
    },
    {
      // An 8 foot band under the diagonal wall, from its start to the exit tents.
      id: "diagonal-corridor",
      name: "Diagonal corridor",
      points: [[20, 36], [60, 12], [62, 12], [62, 19], [20, 44]],
    },
    {
      // Everything between the diagonal band, the pony wall, and the right corridor.
      id: "serpentine",
      name: "Serpentine",
      points: [[20, 44], [62, 19], [62, 24], [64, 24], [64, 56], [20, 56]],
    },
    {
      id: "right-corridor",
      name: "Right corridor",
      points: [[64, 24], [85, 24], [85, 56], [64, 56]],
    },
    {
      id: "exit-tents",
      name: "Exit tents",
      points: [[62, 4], [85, 4], [85, 24], [62, 24]],
    },
  ],
};
