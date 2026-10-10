// The hidden ball drop rig without the tether, to compare how far the ball runs on its own.
import { ball, fixtures } from './ball-drop-rig.js';

export default {
  id: 'ball-drop-free',
  name: 'Hidden ball drop (group 4, no tether)',
  props: [ball],
  fixtures,
  lights: [],
};
