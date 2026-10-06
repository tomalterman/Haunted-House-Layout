# Gym Haunted House Layout

A to-scale view of the gym haunted house: the walls that funnel visitors from the entrance, through the tents and the S-shaped serpentine, to the exit. Switch between a flat 2D plan and a realistic 3D sandbox, and turn the visitor route, the wall-length measurements, and the six group areas (with floor area and doorway widths) on or off in either view.

## The 3D sandbox

The 3D view is a place to try ideas and see if they feel right. Surfaces look like the real build (wood gym floor, black sheeting on pine frames, white tents), lights cast real shadows, and props obey physics at real-world scale against the actual walls.

- **Fly:** drag to look, W A S D to fly, E / Q to rise and sink, Shift for speed, mouse wheel to move forward. On a phone: drag to look, pinch to fly, two-finger drag to slide or rise.
- **Scene:** pick an idea from the dropdown. **Replay** restarts it, for example to drop the ball again.
- **Lights:** Work lights shows the whole gym; Show (dark) shows the haunted-house mood with each scene's own lights.
- **Quality** is picked automatically (lower on phones). Add `?quality=low` or `?quality=high` to the URL to force it.

Ideas live in `src/scenes/`, one file per scene: props (shape, size, weight, bounce, look, start position, drop delay) and lights (spot or point, color, brightness, aim). Copy `schoolyard-demo.js`, change it, and list it in `src/scenes/index.js`. `npm test` checks every scene is valid and settles.

## Open it

The page is plain static files with no build step. Serve the repo root with any static file server and open it in a browser:

```
npm run serve        # python3 -m http.server 8000
```

Then visit http://localhost:8000. Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`.

## Change a measurement

Every position and length lives in `MEASUREMENTS` at the top of `src/layout.js`, in feet, with the origin at the top-left corner of the room. Both views read from it. Attachment points are derived, so moving one value keeps walls connected. For example, partition tops follow the diagonal, and the corridor wall always reaches the pony wall.

Values the sketch did not label are estimates: the three serpentine partitions, the stage depth, the gap above the right tents, and the pony wall height. Measure them in the gym and update them here.

## Check the walls

```
npm test
```

The tests include a leak check. It flood-fills the floor from the entrance door and fails if the exit is unreachable or any off-route area can be reached. The check counts closed tent sides as barriers, so it assumes the tents have sidewalls.

## Files

- `src/layout.js`: measurements and derived geometry
- `src/barriers.js`: leak check
- `src/plan2d.js`: 2D SVG plan
- `src/view3d.js`: realistic 3D sandbox (Three.js r186, vendored in `vendor/three/`)
- `src/physics.js`: physics world from the layout (cannon-es, vendored in `vendor/cannon-es/`)
- `src/flycam.js`: fly-through camera
- `src/textures.js`: procedural textures
- `src/scenes/`: scene files and their validator
- `scripts/sandbox-smoke.cjs`: browser check with screenshots (needs Playwright)
- `src/main.js`, `index.html`, `src/styles.css`: page shell
