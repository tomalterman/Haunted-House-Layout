// Group 4 idea: the 6.5 ft inflatable soccer ball waits out of sight in a booth behind the
// diagonal wall (the side away from the stage). An operator pulls a cord; the ball rolls down a
// short ramp as a black drape drops away in front of it, rolls off a lip over the 8 ft wall, and drops
// into the front of the third lane, just behind the group that has walked past.
//
// Everything is placed relative to the diagonal wall, so the rig follows any change to the
// layout. Positions are plan feet: x across, y down the plan, height above the floor.
//
// Build notes (what each fixture stands for). The drawing set in docs/drawings/ (generated
// from this file by scripts/drawings.mjs) has the dimensions.
// - Booth: a freestanding 2x4 box, 11 ft 4 in wide, 11 ft 3 in deep, 17 ft tall, covered in
//   the same black sheeting as the walls. It stands on the floor behind the maze wall with its
//   front face against the wall's back face, so neither it nor the ramp loads the wall. Its
//   front frames an 8 ft opening above the wall.
// - Ramp deck: 3/4 in plywood on 2x4 joists, 8 ft wide, square to the wall, 12 deg slope. The
//   joists bear on the booth front wall's beveled top plate and on two 2x6 beams on 4x4 posts;
//   a doubled-plywood lip cantilevers 1 ft past the wall's lane face, clear of the wall cap,
//   with a rounded, carpeted edge so the vinyl ball can't snag or puncture. A 2x4 back stop at
//   the high end holds the ball while it is reloaded. Paint the deck, lip, and rails flat black.
// - Guide rails: 3/4 in plywood, 18 in tall, padded 2x4 caps, along both sides of the deck. They
//   are tall enough to push an off-center ball back to the middle before it reaches the
//   opening; low rails only touch the ball's lower curve and let it clip the jambs.
// - Trigger: a 2x4 stop bar across the deck on two butt hinges, held upright by a gravity gate
//   latch on each rail. One T-handle on the operator platform pulls two cords: line K frees the
//   kabuki pins (below) and line B, with 2 in more slack, lifts both latch arms. The ball's
//   weight knocks the bar flat and it rolls over it. The operator watches the lane on a small
//   camera monitor and pulls once the group has walked past the landing spot.
// - Kabuki drop: a black velour drape hangs from a 2x4 batten 1.4 ft out from the wall, so it
//   clears the ramp lip, filling the width between the returns. Each of its 6 webbing loops
//   hangs on a smooth steel pin through two screw eyes; the pins all point the same way and tie
//   to line K, so a 3 in pull frees them together. The drape is heaped on the lane floor in about
//   1 s, long before the ball reaches the lip. Black returns continue the booth sides out to
//   the drape and lip fillers close the pocket beside the ramp, so no slanted view gets in.
// - Operator platform: 4 ft by 2 ft 5 in, 5 ft up against the booth back, behind the deck's high
//   end, with a guardrail; a ladder and a door in the left side wall reach it.
// - Run-out: nothing is tied to the ball, since a rope on a rolling ball winds up around it.
//   The third lane is a dead end at the stage, so the ball rolls down after the group at about
//   walking pace and stops against the pony wall.
// - Reset: between groups a crew member walks the ball back up the lane. The operator drops a
//   hoist line from a pulley on the booth back wall; it clips to the ball's net with a snap
//   shackle. The operator hauls the ball up past the flat bar to the back stop, pulls a reset
//   cord to stand the bar up (the latches click over it), eases the ball onto it, and trips the
//   shackle. The batten is lowered on its lift lines, the drape re-hung from the lane floor, and
//   the batten flown back out. Nothing hangs in the lane while a group is inside.

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
const BACK = -8.5; // deck high end, 8.5 ft behind the wall's centerline (room behind the ball to reload)
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
const JAMB = 5 / 3; // 1 ft 8 in each side, so the booth sides line up with the drape returns
const BOOTH_W = OPEN_W + 2 * JAMB;
const BOOTH_D = 11.5; // from the wall's centerline to the outside of the booth back
const PANEL = 0.25;
// The booth stands on the floor behind the maze wall, its front face against the wall's back
// face, so none of its weight (or the ramp's) bears on the wall.
const FRONT_FACE = -WALL_T / 2;
const FRONT_AT = FRONT_FACE - PANEL / 2;

// The drape hangs past the ramp lip, fills the width between the returns (lapping the opening
// about 1 ft 5 in each side), and its hem sits a few inches below the lip so no one in the lane
// can see up behind it.
const DRAPE_OUT = LIP + 0.15;
const RETURN_AT = BOOTH_W / 2 - PANEL / 2; // returns continue the booth sides out over the lane
const DRAPE_W = 2 * RETURN_AT - PANEL;
const DRAPE_BOTTOM = 7.75;
const DRAPE_TOP = OPEN_TOP + 0.25;

// Rails 1.5 ft tall with inner faces 3.425 ft from the middle hold the ball within about
// 0.7 ft of center, inside the opening's 0.75 ft side clearance.
const RAIL_H = 1.5;
const RAIL_AT = 3.5;

// Supports under the deck: a beam on the booth front frame just behind the wall, and two more
// beams across 4x4 posts.
const POST_ALONG = 3.75;
const MID_BEAM = -4.25;
const REAR_BEAM = -8.2;
const PLATFORM = { width: 4, depth: 2.5, top: 5, front: -8.75 };

const box = (id, label, size, center, look, extra = {}) => ({ id, label, size, at: center, yaw: WALL_YAW, look, ...extra });

export const fixtures = [
  box('ramp-deck', 'Ramp deck (plywood, 12 deg)', { width: 8, height: DECK_T, depth: slopeLen }, onDeck(0, (LIP + BACK) / 2, -DECK_T / 2), paintedBlack, { slope: RAMP_SLOPE }),
  ...[-1, 1].map((side) =>
    box(`rail-${side < 0 ? 'left' : 'right'}`, 'Guide rail (18 in plywood, padded 2x4 cap)', { width: 0.15, height: RAIL_H, depth: slopeLen }, onDeck(side * RAIL_AT, (LIP + BACK) / 2, RAIL_H / 2), paintedBlack, { slope: RAMP_SLOPE }),
  ),
  // Hinged at the deck and latched upright until the release.
  box('stop-bar', 'Stop bar (2x4 on hinges, held by gravity latches)', { width: 2 * RAIL_AT - 0.2, height: BAR_H, depth: 0.125 }, onDeck(0, barOut, BAR_H / 2), { color: '#d23b2a' }, {
    slope: RAMP_SLOPE,
    hinge: { edge: 'bottom', mass: 3, opens: 90, latched: true },
  }),
  // Stops the ball rolling off the back while it is hauled up to reload.
  box('back-stop', 'Back stop (2x4 on edge)', { width: 2 * RAIL_AT - 0.2, height: 0.29, depth: 0.125 }, onDeck(0, BACK + 0.07, 0.145), paintedBlack, { slope: RAMP_SLOPE }),
  ...[MID_BEAM, REAR_BEAM].flatMap((out, row) =>
    [-1, 1].map((side) =>
      box(`ramp-post-${row === 0 ? 'mid' : 'rear'}-${side < 0 ? 'left' : 'right'}`, 'Ramp post (4x4)', { width: 0.3, height: deckTop(out) - DECK_T, depth: 0.3 }, at(side * POST_ALONG, out, (deckTop(out) - DECK_T) / 2), pine),
    ),
  ),
  // Booth front, on the floor behind the wall: the lower frame carries the deck's low end, and
  // two jambs and a header frame the ball opening above it.
  // Its top plate is the beam under the deck's low end, so it meets the deck with no gap.
  box('booth-front-lower', 'Booth front lower frame (behind the wall)', { width: BOOTH_W, height: deckTop(FRONT_AT) - DECK_T, depth: PANEL }, at(0, FRONT_AT, (deckTop(FRONT_AT) - DECK_T) / 2), black),
  ...[-1, 1].map((side) =>
    box(`booth-jamb-${side < 0 ? 'left' : 'right'}`, 'Booth front jamb (black sheeting)', { width: JAMB, height: BOOTH_H - 8, depth: PANEL }, at(side * (OPEN_W + JAMB) / 2, FRONT_AT, (8 + BOOTH_H) / 2), black),
  ),
  box('booth-header', 'Booth front header', { width: OPEN_W, height: BOOTH_H - OPEN_TOP, depth: PANEL }, at(0, FRONT_AT, (OPEN_TOP + BOOTH_H) / 2), black),
  // Returns: short black panels on the batten outriggers closing the gap between the booth front
  // and the drape's edges, so slanted views from the lanes can't slip in behind it. They hang
  // down to the drape's hem (notched over the wall cap), or a view from the group 3 doorway
  // slips in under their corner.
  ...[-1, 1].map((side) =>
    box(`drape-return-${side < 0 ? 'left' : 'right'}`, 'Drape return (black sheeting on the batten outrigger)', { width: PANEL, height: BOOTH_H - DRAPE_BOTTOM, depth: DRAPE_OUT + 0.1 - FRONT_FACE }, at(side * RETURN_AT, (DRAPE_OUT + 0.1 + FRONT_FACE) / 2, (DRAPE_BOTTOM + BOOTH_H) / 2), black),
  ),
  // Lip fillers: flat black boards at lip height closing the floor of the drape pocket beside
  // the ramp, between its edge and each return.
  ...[-1, 1].map((side) =>
    box(`lip-filler-${side < 0 ? 'left' : 'right'}`, 'Lip filler (3/4 in plywood, painted black)', { width: RETURN_AT - PANEL / 2 - 4, height: 0.0625, depth: DRAPE_OUT - FRONT_FACE }, at(side * (4 + (RETURN_AT - PANEL / 2 - 4) / 2), (DRAPE_OUT + FRONT_FACE) / 2, deckTop(LIP) - 0.03), paintedBlack),
  ),
  // Kabuki drop: blocks the view, falls to the floor on release.
  box('kabuki-drape', 'Kabuki drop (black velour on pull pins)', { width: DRAPE_W, height: DRAPE_TOP - DRAPE_BOTTOM, depth: 0.05 }, at(0, DRAPE_OUT, (DRAPE_BOTTOM + DRAPE_TOP) / 2), { color: '#0b0b0d', pattern: 'drape' }, { dropsOnRelease: true }),
  // Booth sides and back, floor to top, behind the wall, closing tight on the front.
  ...[-1, 1].map((side) =>
    box(`booth-side-${side < 0 ? 'left' : 'right'}`, 'Booth side (black sheeting, operator door on the left)', { width: PANEL, height: BOOTH_H, depth: BOOTH_D + FRONT_FACE }, at(side * RETURN_AT, (FRONT_FACE - BOOTH_D) / 2, BOOTH_H / 2), black),
  ),
  box('booth-back', 'Booth back (black sheeting)', { width: BOOTH_W, height: BOOTH_H, depth: PANEL }, at(0, -BOOTH_D + PANEL / 2, BOOTH_H / 2), black),
  box('operator-platform', 'Operator platform, 5 ft', { width: PLATFORM.width, height: 0.3, depth: PLATFORM.depth }, at(0, PLATFORM.front - PLATFORM.depth / 2, PLATFORM.top - 0.15), plywood),
];

// The rig in the wall's own frame, for the build drawings (scripts/drawings.mjs). Feet: `along`
// the wall from the middle of the opening, `out` from the wall's centerline toward the lane,
// and height above the floor.
export const geometry = {
  station: STATION,
  wallYaw: WALL_YAW,
  wallT: WALL_T,
  ballR: R,
  ballCenter: { out: BALL_CONTACT + Math.sin(RAMP_SLOPE * DEG) * R, height: ballStart.height },
  ballContact: BALL_CONTACT,
  slope: RAMP_SLOPE,
  deckTop,
  laneFace: LANE_FACE,
  lip: LIP,
  back: BACK,
  deckWidth: 8,
  railH: RAIL_H,
  railAt: RAIL_AT,
  barOut,
  barH: BAR_H,
  postAlong: POST_ALONG,
  midBeam: MID_BEAM,
  rearBeam: REAR_BEAM,
  platform: PLATFORM,
  openW: OPEN_W,
  openTop: OPEN_TOP,
  jamb: JAMB,
  boothW: BOOTH_W,
  boothD: BOOTH_D,
  boothH: BOOTH_H,
  frontFace: FRONT_FACE,
  returnAt: RETURN_AT,
  drapeOut: DRAPE_OUT,
  drapeW: DRAPE_W,
  drapeTop: DRAPE_TOP,
  drapeBottom: DRAPE_BOTTOM,
};

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
