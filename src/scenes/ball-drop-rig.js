// Group 4 idea: the 6.5 ft inflatable soccer ball waits out of sight in a booth behind the
// diagonal wall (the side away from the stage). An operator pulls the release; the ball rolls
// down a short ramp, pushes through a black strip curtain, rolls off a lip over the 8 ft wall,
// and drops into the front of the third lane, just past where visitors walk in.
//
// Everything is placed relative to the diagonal wall, so the rig follows any change to the
// layout. Positions are plan feet: x across, y down the plan, height above the floor.
//
// Build notes (what each fixture stands for):
// - Ramp deck: 3/4 in plywood on a 2x4 frame, 8 ft wide, square to the wall, 12 deg slope.
//   Its low end rests on the wall's top rail and overhangs the lane face by 1 ft, with a
//   rounded, carpeted edge so the vinyl ball can't snag or puncture. Paint the deck, lip, and
//   rails flat black: from the lane the lip is the one part of the rig a visitor can see.
// - Guide rails: 2x6 on edge along both sides of the deck, so the ball can't wander off it.
// - Stop bar: a 2x4 across the deck, hinged at one end and held up by a pull pin on a cord.
//   Pulling the pin lets the bar swing flat; a 4 in bar holds the ball on a 12 deg slope.
// - Booth: 2x4 frame covered in the same black sheeting as the walls, 17 ft tall, with an
//   opening above the wall just big enough for the ball. Back posts carry the deck's high end.
// - Strip curtain: black plastic strips across the opening; the ball pushes through them.
// - Operator platform: a stage-block or scaffold platform 5 ft up, behind the ball, for
//   pulling the pin and reloading.
// - Tether (this scene; see ball-drop-free.js for the same rig without it): a cord from the
//   ball's net to a pulley at the top of the opening, then back to the operator. It stops the
//   ball before the exit gap into group 5, and the operator hauls the ball back up to reload.

import { layout } from '../layout.js';

const DEG = Math.PI / 180;
const BALL_D = 6.5;
const R = BALL_D / 2;
export const RAMP_SLOPE = 12; // degrees
const TAN = Math.tan(RAMP_SLOPE * DEG);
const WALL_T = layout.wallThickness;
const BOOTH_H = 17;

// A frame on the diagonal wall: `along` runs with the wall, `out` points into the lane.
const { a: A, b: B } = layout.diagonal;
const len = Math.hypot(B.x - A.x, B.y - A.y);
const u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
const n = { x: -u.y, y: u.x }; // toward the lane (away from the top wall)
export const WALL_YAW = Math.atan2(u.y, u.x) / DEG;

// The drop point: on the wall over the front of the third lane, left of center so the
// opening stays above group 4 (lane runs x 43-55).
const STATION_X = 46.5;
const ts = (STATION_X - A.x) / (B.x - A.x);
export const STATION = { x: A.x + (B.x - A.x) * ts, y: A.y + (B.y - A.y) * ts };

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
const onDeck = (along, out, lift) => {
  const p = at(along, out + Math.sin(RAMP_SLOPE * DEG) * lift, deckTop(out) + Math.cos(RAMP_SLOPE * DEG) * lift);
  return p;
};
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

// Booth sizes. The opening clears the ball by 0.5 ft each side and about 1 ft overhead.
const OPEN_W = 7.5;
const OPEN_TOP = 16.25;
const JAMB = 1;
const BOOTH_W = OPEN_W + 2 * JAMB;
const BOOTH_D = 11.5;
const PANEL = 0.25;

const box = (id, label, size, center, look, extra = {}) => ({ id, label, size, at: center, yaw: WALL_YAW, look, ...extra });

export const fixtures = [
  box('ramp-deck', 'Ramp deck (plywood, 12 deg)', { width: 8, height: DECK_T, depth: slopeLen }, onDeck(0, (LIP + BACK) / 2, -DECK_T / 2), paintedBlack, { slope: RAMP_SLOPE }),
  box('rail-left', 'Guide rail (2x6)', { width: 0.15, height: 0.5, depth: slopeLen }, onDeck(-3.8, (LIP + BACK) / 2, 0.25), paintedBlack, { slope: RAMP_SLOPE }),
  box('rail-right', 'Guide rail (2x6)', { width: 0.15, height: 0.5, depth: slopeLen }, onDeck(3.8, (LIP + BACK) / 2, 0.25), paintedBlack, { slope: RAMP_SLOPE }),
  box('stop-bar', 'Stop bar (2x4 on a pull pin)', { width: 7.4, height: BAR_H, depth: 0.125 }, onDeck(0, barOut, BAR_H / 2), { color: '#d23b2a' }, { slope: RAMP_SLOPE, removeOnRelease: true }),
  ...[-3.6, 3.6].map((along, i) =>
    box(`ramp-post-${i + 1}`, 'Ramp post (4x4)', { width: 0.3, height: deckTop(BACK + 0.4) - DECK_T, depth: 0.3 }, at(along, BACK + 0.4, (deckTop(BACK + 0.4) - DECK_T) / 2), pine),
  ),
  // Booth front, standing on the wall: two jambs and a header around the ball opening.
  box('booth-jamb-left', 'Booth front (black sheeting)', { width: JAMB, height: BOOTH_H - 8, depth: PANEL }, at(-(OPEN_W + JAMB) / 2, 0, (8 + BOOTH_H) / 2), black),
  box('booth-jamb-right', 'Booth front (black sheeting)', { width: JAMB, height: BOOTH_H - 8, depth: PANEL }, at((OPEN_W + JAMB) / 2, 0, (8 + BOOTH_H) / 2), black),
  box('booth-header', 'Booth front header', { width: OPEN_W, height: BOOTH_H - OPEN_TOP, depth: PANEL }, at(0, 0, (OPEN_TOP + BOOTH_H) / 2), black),
  // Hung on the lane face and 6 in wider than the opening each side, so no slanted view slips
  // past its edges.
  box('strip-curtain', 'Black strip curtain', { width: OPEN_W + 1, height: OPEN_TOP - 8 + 0.25, depth: 0.05 }, at(0, PANEL / 2 + 0.05, (8 + OPEN_TOP + 0.25) / 2), { color: '#0b0b0d', pattern: 'strips' }, { solid: false }),
  // Booth sides and back, floor to top, behind the wall. The sides butt against the front
  // panels so the corners are tight.
  ...[-1, 1].map((side) =>
    box(`booth-side-${side < 0 ? 'left' : 'right'}`, 'Booth side (black sheeting)', { width: PANEL, height: BOOTH_H, depth: BOOTH_D + PANEL / 2 }, at(side * (BOOTH_W - PANEL) / 2, (PANEL / 2 - BOOTH_D) / 2, BOOTH_H / 2), black),
  ),
  box('booth-back', 'Booth back (black sheeting, operator door)', { width: BOOTH_W, height: BOOTH_H, depth: PANEL }, at(0, -BOOTH_D, BOOTH_H / 2), black),
  box('operator-platform', 'Operator platform, 5 ft', { width: 4, height: 0.3, depth: 3 }, at(0, -BOOTH_D + 1.75, 4.85), plywood),
];

// Pulley at the top of the opening, a little into the lane.
export const TETHER_ANCHOR = at(0, LANE_FACE + 0.3, OPEN_TOP - 0.2);
export const TETHER_LENGTH = 27;

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
  name: 'Hidden ball drop (group 4, tethered)',
  props: [{ ...ball, tether: { anchor: TETHER_ANCHOR, length: TETHER_LENGTH } }],
  fixtures,
  lights: [],
};
