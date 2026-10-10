// Checks a scene file before it reaches the sandbox, so a typo fails a test with a clear
// message instead of breaking the demo.

const SHAPES = {
  sphere: ['diameter'],
  box: ['width', 'height', 'depth'],
  cylinder: ['diameter', 'height'],
};
const LIGHT_TYPES = ['spot', 'point'];
const MAX_HEIGHT = 40;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const isPoint = (p) => p && isNum(p.x) && isNum(p.height) && isNum(p.y);

export function validateScene(scene, layout) {
  const fail = (what) => {
    throw new Error(`Scene "${scene?.id}": ${what}`);
  };
  if (!scene || typeof scene.id !== 'string' || !scene.id) fail('needs an id');
  if (typeof scene.name !== 'string' || !scene.name) fail('needs a name');
  if (!Array.isArray(scene.props)) fail('props must be a list');
  if (!Array.isArray(scene.lights)) fail('lights must be a list');

  const { width: W, depth: D } = layout.room;
  const inRoom = (p) => isPoint(p) && inRange(p.x, 0, W) && inRange(p.y, 0, D) && inRange(p.height, 0, MAX_HEIGHT);

  const seen = new Set();
  for (const p of scene.props) {
    const bad = (field) => fail(`prop "${p.id}" has a bad ${field}`);
    if (typeof p.id !== 'string' || !p.id) fail('every prop needs an id');
    if (seen.has(p.id)) fail(`prop "${p.id}" is a duplicate id`);
    seen.add(p.id);
    if (!SHAPES[p.shape]) bad('shape (use sphere, box, or cylinder)');
    if (!p.size || !SHAPES[p.shape].every((k) => isNum(p.size[k]) && p.size[k] > 0)) bad(`size (needs ${SHAPES[p.shape].join(', ')})`);
    if (!isNum(p.mass) || p.mass <= 0) bad('mass (pounds, above 0)');
    if (!inRange(p.bounce, 0, 1)) bad('bounce (0 to 1)');
    if (!inRange(p.friction, 0, 2)) bad('friction (0 to 2)');
    if (!inRange(p.drag, 0, 3)) bad('drag (0 to 3)');
    if (p.rollingResistance !== undefined && !inRange(p.rollingResistance, 0, 1)) bad('rollingResistance (0 to 1)');
    if (!p.look || typeof p.look.color !== 'string') bad('look (needs a color)');
    if (!inRoom(p.start)) bad(`start (inside the room, height 0 to ${MAX_HEIGHT} ft)`);
    if (p.velocity !== undefined && !isPoint(p.velocity)) bad('velocity (x, height, y)');
    if (p.dropDelay !== undefined && p.dropDelay !== 'manual' && !(isNum(p.dropDelay) && p.dropDelay >= 0)) {
      bad("dropDelay (seconds, 0 or more, or 'manual')");
    }
    if (p.tether !== undefined && !(p.tether && inRoom(p.tether.anchor) && isNum(p.tether.length) && p.tether.length > 0)) {
      bad('tether (needs an anchor inside the room and a length above 0)');
    }
  }

  if (scene.fixtures !== undefined && !Array.isArray(scene.fixtures)) fail('fixtures must be a list');
  for (const f of scene.fixtures ?? []) {
    const bad = (field) => fail(`fixture "${f.id}" has a bad ${field}`);
    if (typeof f.id !== 'string' || !f.id) fail('every fixture needs an id');
    if (seen.has(f.id)) fail(`fixture "${f.id}" is a duplicate id`);
    seen.add(f.id);
    if (!f.size || !SHAPES.box.every((k) => isNum(f.size[k]) && f.size[k] > 0)) bad('size (needs width, height, depth)');
    if (!inRoom(f.at)) bad(`at (its center, inside the room, height 0 to ${MAX_HEIGHT} ft)`);
    if (f.yaw !== undefined && !inRange(f.yaw, -360, 360)) bad('yaw (degrees)');
    if (f.slope !== undefined && !inRange(f.slope, -89, 89)) bad('slope (degrees, -89 to 89)');
    if (!f.look || typeof f.look.color !== 'string') bad('look (needs a color)');
  }

  scene.lights.forEach((l, i) => {
    const bad = (field) => fail(`light ${i + 1} has a bad ${field}`);
    if (!LIGHT_TYPES.includes(l.type)) bad('type (use spot or point)');
    if (typeof l.color !== 'string') bad('color');
    if (!isNum(l.intensity) || l.intensity <= 0) bad('intensity (above 0)');
    if (!inRoom(l.position)) bad('position');
    if (l.type === 'spot' && !inRoom(l.target)) bad('target (where the spot points)');
    if (l.angle !== undefined && !inRange(l.angle, 1, 89)) bad('angle (degrees, 1 to 89)');
  });
  return scene;
}
