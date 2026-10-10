// Group 4 idea: the 6.5 ft inflatable soccer ball waits out of sight in a booth behind the
// diagonal wall (the side away from the stage). An operator pulls a pin; the ball rolls down a
// short ramp as a black drape drops away in front of it, rolls off a lip over the 8 ft wall, and drops
// into the front of the third lane, just behind the group that has walked past.
//
// Everything is placed relative to the diagonal wall, so the rig follows any change to the
// layout. Positions are plan feet: x across, y down the plan, height above the floor.
//
// Build notes (what each fixture stands for):
// - Ramp deck: 3/4 in plywood on a 2x4 frame, 8 ft wide, square to the wall, 12 deg slope.
//   Its low end rests on the wall's top rail and overhangs the lane face by 1 ft, with a
//   rounded, carpeted edge so the vinyl ball can't snag or puncture. Paint the deck, lip, and
//   rails flat black: from the lane the lip is the one part of the rig a visitor can see.
// - Guide rails: 2x12 on edge (with a padded top) along both sides of the deck, 7 ft apart.
//   They are tall enough to push an off-center ball back to the middle before it reaches the
//   opening; low 2x6 rails only touch the ball's lower curve and let it clip the jambs.
// - Trigger: a 2x4 stop bar across the deck on two butt hinges, standing up against a pair of
//   hitch pins. One cord runs from a pull handle on the operator platform through the stop-bar
//   pin rings and on to the kabuki pins (below). Pulling the handle draws every pin; the ball's
//   weight knocks the bar flat and it rolls over it. The operator watches the lane on a small camera monitor (or through a peephole in the
//   booth side) and pulls once the group has walked past the landing spot.
// - Kabuki drop: a black velour drape hangs in front of the opening from a batten on brackets
//   off the booth header, 1.4 ft out from the wall so it clears the ramp lip, and wide enough
//   to lap the opening by 1.5 ft each side. It hangs on kabuki pins: screw eyes on the batten
//   with a pin through each grommet loop, all on the same pull cord as the stop-bar pins. One
//   pull drops the drape to the lane floor (heaped there in about 1 s) and frees the bar at once;
//   the drape is clear long before the ball reaches the lip, about 2 s after the pull. Short
//   black returns on the batten brackets close the sides between the drape and the booth.
// - Booth: 2x4 frame covered in the same black sheeting as the walls, 17 ft tall, with an
//   opening above the wall just big enough for the ball. Back posts carry the deck's high end.
// - Operator platform: a stage-block or scaffold platform 5 ft up, behind the ball, for
//   pulling the cord and reloading.
// - Run-out: nothing is tied to the ball, since a rope on a rolling ball winds up around it.
//   The third lane is a dead end at the stage, so the ball rolls down after the group at about
//   walking pace and stops against the pony wall.
// - Reset: between groups a crew member walks the ball back up the lane. The operator drops a
//   hoist line from a pulley over the opening, they clip it to the ball's net, and the operator
//   hauls the ball up onto the deck, unclips it, sets the bar and pins, and re-hangs the drape
//   from a stepladder in the lane. Nothing hangs in the lane while a group is inside.

import { layout } from '../layout.js';

const DEG = Math.PI / 180;
const BALL_D = 6.5;
const R = BALL_D / 2;
const RAMP_SLOPE = 12; // degrees
const TAN = Math.tan(RAMP_SLOPE * DEG);
const WALL_T = layout.wallThickness;
const BOOTH_H = 17;

// A frame on the diagonal wall: `along` runs with the wall, `out` points into the lane.
const { a: A, b: B } = layout.diagonal;
const len = Math.hypot(B.x - A.x, B.y - A.y);
const u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
const n = { x: -u.y, y: u.x }; // toward the lane (away from the top wall)
const WALL_YAW = Math.atan2(u.y, u.x) / DEG;

// The drop point: on the wall over the front of the third lane, left of center so the
// opening stays above group 4 (lane runs x 43-55).
const STATION_X = 46.5;
const ts = (STATION_X - A.x) / (B.x - A.x);
const STATION = { x: A.x + (B.x - A.x) * ts, y: A.y + (B.y - A.y) * ts };

export const at = (along, out, height) => ({
  x: STATION.x + u.x * along + n.x * out,
  y: STATION.y + u.y * along + n.y * out,
  height,
});

// Ramp deck top surface. Height 8.3 ft at the lane face of the wall, rising 12 deg going back.
const LANE_FACE = WALL_T / 2;
const LIP = LANE_FACE + 1; // deck end, 1 ft past the lane face
const BACK = -7; // deck high end, 7 ft behind the wall's centerline
const DECK_T = 0.25;
const deckTop = (out) => 8.3 - (out - LANE_FACE) * TAN;
// A point `lift` feet off the deck surface (along its normal), above deck position `out`.
const onDeck = (along, out, lift) => at(along, out + Math.sin(RAMP_SLOPE * DEG) * lift, deckTop(out) + Math.cos(RAMP_SLOPE * DEG) * lift);
const slopeLen = (LIP - BACK) / Math.cos(RAMP_SLOPE * DEG);

const black = { color: '#121214', pattern: 'sheeting' };
const pine = { color: '#d9b47c', pattern: 'pine' };
const plywood = { color: '#c9a46e', pattern: 'plywood' };
const paintedBlack = { color: '#161618' }; // anything visitors could glimpse is painted flat black

// Ball held at the top of the ramp, resting against the stop bar.
const BALL_CONTACT = -5.8;
const BAR_H = 0.29; // a 2x4 on edge
const barReach = Math.sqrt(R * R - (R - BAR_H) ** 2); // slope distance from ball contact to bar
const ballStart = onDeck(0, BALL_CONTACT, R);
const barOut = BALL_CONTACT + (barReach + 0.07) * Math.cos(RAMP_SLOPE * DEG);

// Booth sizes. The opening clears the ball by 0.75 ft each side and about 1 ft overhead.
const OPEN_W = 8;
export const OPENING_WIDTH = OPEN_W;
const OPEN_TOP = 16.25;
const JAMB = 1;
const BOOTH_W = OPEN_W + 2 * JAMB;
const BOOTH_D = 11.5;
const PANEL = 0.25;

// The drape hangs past the ramp lip, laps the opening 1.5 ft each side, and its hem sits a few
// inches below the lip so no one in the lane can see up behind it.
const DRAPE_OUT = LIP + 0.15;
const DRAPE_W = OPEN_W + 3;
const DRAPE_BOTTOM = 7.75;
const DRAPE_TOP = OPEN_TOP + 0.25;

// Rails 1.5 ft tall with inner faces 3.425 ft from the middle hold the ball within about
// 0.7 ft of center, inside the opening's 0.75 ft side clearance.
const RAIL_H = 1.5;
const RAIL_AT = 3.5;

const box = (id, label, size, center, look, extra = {}) => ({ id, label, size, at: center, yaw: WALL_YAW, look, ...extra });

export const fixtures = [
  box('ramp-deck', 'Ramp deck (plywood, 12 deg)', { width: 8, height: DECK_T, depth: slopeLen }, onDeck(0, (LIP + BACK) / 2, -DECK_T / 2), paintedBlack, { slope: RAMP_SLOPE }),
  ...[-1, 1].map((side) =>
    box(`rail-${side < 0 ? 'left' : 'right'}`, 'Guide rail (2x12, padded top)', { width: 0.15, height: RAIL_H, depth: slopeLen }, onDeck(side * RAIL_AT, (LIP + BACK) / 2, RAIL_H / 2), paintedBlack, { slope: RAMP_SLOPE }),
  ),
  // Hinged at the deck and pinned upright until the release.
  box('stop-bar', 'Stop bar (2x4 on hinges, held by pull pins)', { width: 2 * RAIL_AT - 0.2, height: BAR_H, depth: 0.125 }, onDeck(0, barOut, BAR_H / 2), { color: '#d23b2a' }, {
    slope: RAMP_SLOPE,
    hinge: { edge: 'bottom', mass: 3, opens: 90, latched: true },
  }),
  ...[-3.6, 3.6].map((along, i) =>
    box(`ramp-post-${i + 1}`, 'Ramp post (4x4)', { width: 0.3, height: deckTop(BACK + 0.4) - DECK_T, depth: 0.3 }, at(along, BACK + 0.4, (deckTop(BACK + 0.4) - DECK_T) / 2), pine),
  ),
  // Booth front, standing on the wall: two jambs and a header around the ball opening.
  ...[-1, 1].map((side) =>
    box(`booth-jamb-${side < 0 ? 'left' : 'right'}`, 'Booth front (black sheeting)', { width: JAMB, height: BOOTH_H - 8, depth: PANEL }, at(side * (OPEN_W + JAMB) / 2, 0, (8 + BOOTH_H) / 2), black),
  ),
  box('booth-header', 'Booth front header', { width: OPEN_W, height: BOOTH_H - OPEN_TOP, depth: PANEL }, at(0, 0, (OPEN_TOP + BOOTH_H) / 2), black),
  // Returns: short black panels on the batten brackets closing the gap between the booth front
  // and the drape's edges, so slanted views from the lanes can't slip in behind it.
  ...[-1, 1].map((side) =>
    box(`drape-return-${side < 0 ? 'left' : 'right'}`, 'Drape return (black sheeting on the batten bracket)', { width: 0.1, height: DRAPE_TOP - 8, depth: DRAPE_OUT - PANEL / 2 }, at(side * (DRAPE_W / 2 + 0.05), (DRAPE_OUT + PANEL / 2) / 2, (8 + DRAPE_TOP) / 2), black),
  ),
  // Kabuki drop: blocks the view, falls to the floor on release.
  box('kabuki-drape', 'Kabuki drop (black velour on pull pins)', { width: DRAPE_W, height: DRAPE_TOP - DRAPE_BOTTOM, depth: 0.05 }, at(0, DRAPE_OUT, (DRAPE_BOTTOM + DRAPE_TOP) / 2), { color: '#0b0b0d', pattern: 'drape' }, { dropsOnRelease: true }),
  // Booth sides and back, floor to top, behind the wall. The sides butt against the front
  // panels so the corners are tight.
  ...[-1, 1].map((side) =>
    box(`booth-side-${side < 0 ? 'left' : 'right'}`, 'Booth side (black sheeting)', { width: PANEL, height: BOOTH_H, depth: BOOTH_D + PANEL / 2 }, at(side * (BOOTH_W - PANEL) / 2, (PANEL / 2 - BOOTH_D) / 2, BOOTH_H / 2), black),
  ),
  box('booth-back', 'Booth back (black sheeting, operator door)', { width: BOOTH_W, height: BOOTH_H, depth: PANEL }, at(0, -BOOTH_D, BOOTH_H / 2), black),
  box('operator-platform', 'Operator platform, 5 ft', { width: 4, height: 0.3, depth: 3 }, at(0, -BOOTH_D + 1.75, 4.85), plywood),
];

export const ball = {
  id: 'inflatable-ball',
  label: '6.5 ft inflatable soccer ball',
  shape: 'sphere',
  size: { diameter: BALL_D },
  mass: 12, // a 2 m PVC giant ball; weigh yours and update
  bounce: 0.6,
  friction: 0.5,
  drag: 0.47,
  rollingResistance: 0.1,
  look: { color: '#f4f4f0', pattern: 'soccer', accent: '#151515' },
  start: ballStart,
  dropDelay: 'manual',
};

export default {
  id: 'ball-drop-rig',
  name: 'Hidden ball drop (group 4)',
  props: [ball],
  fixtures,
  lights: [],
};
