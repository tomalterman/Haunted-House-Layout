# Haunted House Layout

A phone-first web page for planning the school haunted house in the gym. Everyone with the link sees the same locked floor plan in two views: a top-down **map** where teams mark zones and draw freehand, and a first-person **walk** at kid height through the same plan. Marks sync live between phones and survive reloads; each phone also keeps a local copy so the page opens offline.

It is one Cloudflare Worker project: the Worker serves the built app from `dist/` and runs the shared board as a Durable Object (y-partyserver's `YServer` over Yjs). It runs on the Cloudflare free plan.

## Run locally

You need Node 22.

```sh
npm install
```

Open two terminals:

```sh
npm run dev          # Vite dev server for the app (prints a http://localhost:5173 URL)
npm run dev:worker   # wrangler dev: the Durable Object sync server on :8787
```

Open the Vite URL in the browser. Vite proxies `/parties/*` to the Worker on port 8787, so the app and the sync server share one origin. Open the same URL in a second tab (or on a phone on the same Wi-Fi, using the Network URL Vite prints) and draw: a stroke in one tab appears in the other within a few seconds.

Only `npm run dev` running (no worker) is fine too: the app loads from its local copy and the toolbar dot shows offline.

## Test

```sh
npm test       # Vitest unit and module tests (store, geometry, map view, worker chunking)
npm run e2e    # Playwright browser smoke tests (mobile and desktop projects)
npm run build  # production build into dist/
```

## Deploy

Once per machine, sign in to Cloudflare:

```sh
npx wrangler login
```

Then, whenever you want to ship:

```sh
npm run deploy   # vite build && wrangler deploy
```

The URL wrangler prints (`https://haunted-house-layout.<account>.workers.dev`) **is the shared link**. Send that to the volunteers. The first deploy runs the `v1` migration that creates the SQLite-backed `Board` Durable Object class.

- The plain link opens the default board, room `gym`.
- Add `?room=rehearsal` (or any lowercase letters, digits, and dashes) to open a separate, empty board. Rooms are independent; there is no list of rooms, so agree on the name in the group chat.
- There is no login. Anyone with the link can draw. The audience is a trusted volunteer group, so abuse protection is deliberately left out.

You can check the dry run without an account or a real deploy:

```sh
npx wrangler deploy --dry-run
```

## Things that must not change

The board's server copy is stored inside a Durable Object, and that storage is addressed by the Durable Object **class name** plus the **room name**. Change either without care and the existing board silently disappears (the data is still there, just no longer reachable). These are declared in `wrangler.toml` and `worker/index.js`:

| Thing | Value | Why it is pinned |
|---|---|---|
| Durable Object class | `Board` (exported from `worker/index.js`) | Storage is keyed by class. Renaming needs a `[[migrations]]` entry with `renamed_classes`. |
| Binding name | `main` | The client (`YProvider`) connects to `/parties/main/<room>`, and `routePartykitRequest` matches the binding name to the URL. Renaming it breaks every client and orphans storage. |
| Migration tag | `v1` (`new_sqlite_classes = ["Board"]`) | Cloudflare applies migrations by tag in order. Never edit or delete a tag that has been deployed; add a new tag for any change. |
| Room names | `?room=` query parameter, default `gym`, sanitized to `[a-z0-9-]` | The room string is the Durable Object name (`idFromName(room)`). Changing the mapping or the default moves everyone to an empty board. |

Persistence writes the document as rows in a `doc_chunks` SQLite table (`seq INTEGER PRIMARY KEY, chunk BLOB`), each under 1 MB, because a single Durable Object key plus value cannot exceed 2 MB. The Durable Object holds the only server copy; there is no export. The y-indexeddb copy on each phone is the informal backup, so if the Cloudflare account is lost the most recently opened phone still has the board.

## Free plan checklist

Cloudflare's free plan includes Durable Objects with SQLite storage and WebSocket hibernation (since April 2025). Before relying on it for event night:

1. **Account is on the free plan** and Workers is enabled (Cloudflare dashboard, Workers & Pages). No card is required.
2. **SQLite migration.** `wrangler.toml` declares the class under `new_sqlite_classes`, not `new_classes`. The free plan supports only SQLite-backed Durable Objects; the first `npm run deploy` prints the migration it applies.
3. **Hibernation works.** `Board` sets `static options = { hibernate: true }`, so an idle room costs nothing. After all tabs close, wait a minute or two and check the dashboard (Workers & Pages, your Worker, Durable Objects): the object should show no active connections and no ongoing duration billing.
4. **Limits are generous for this use:** 100k requests a day, 5 GB of SQLite, and each save is chunked well under the 2 MB value limit.
5. **September dry run.** A month before the event, deploy, open the link on two phones, draw, close everything, reopen the next day, and confirm the strokes are still there and the dashboard shows the object idle in between. This catches an expired login, a paused account, or a changed free-plan rule while there is still time to fix it.

## Troubleshooting

- **Offline dot in the toolbar.** The page cannot reach the sync server. Locally: is `npm run dev:worker` running on port 8787? Deployed: check that the Worker is deployed and the phone has a connection. Drawing still works; strokes made offline are stored in the phone's IndexedDB and pushed to the server when the connection returns.
- **"Save failed" warning.** The server could not write the board to storage (`meta.lastSaveError` in the document). Clients keep their copies and the server keeps retrying after each change. If it persists, look at the Worker logs (`npx wrangler tail`) for the error; the usual cause is a storage limit or a broken migration.
- **Backgrounding Safari and the tap-to-reload overlay.** iOS drops the WebGL context when Safari is backgrounded for a while. The walk view rebuilds its scene on restore; if the context does not come back, the page shows a tap-to-reload overlay. Tap it; the board reloads from the local copy and the server, nothing is lost.
- **Two tabs do not see each other.** They must be on the same room (same `?room=` or none) and the same origin. Under Vite, use the Vite URL, not `localhost:8787` directly.
- **A blank board after deploy.** You changed the class, binding, or room mapping (see above). Restore the values or add a `renamed_classes` migration.

## Compound Engineering (Claude Code)

Planning and implementation in this repo use the Compound Engineering plugin vendored at `.claude/skills/compound-engineering/` (loads as `compound-engineering@skills-dir` once you open the repository root and trust the workspace; no marketplace install). Commands: `/ce-brainstorm`, `/ce-plan`, `/ce-work`, `/ce-compound`. Plans live under `docs/plans/` and solutions under `docs/solutions/`. Upstream: [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT).

## Device checklist

The automated tests run headless Chromium, which cannot reproduce a few iOS
behaviors. Walk these on a real phone before build night:

- **Background and return.** Open the walk, switch apps for a minute, come
  back. The scene should redraw. If iOS dropped the GPU context and it did not
  return, the tap-to-reload overlay appears; tapping it reloads.
- **Low Power Mode.** Safari caps animation at 30 frames per second. Movement
  is time-based, so walking speed should still feel like 3 feet per second,
  just less smooth.
- **Pinch after drawing.** Draw a stroke, then pinch to zoom starting with one
  finger. The zoom should happen with no stray mark left behind.
- **Portrait and landscape.** Rotate in both views. The map refits, and the
  walk's joystick and look areas move to the lower corners.
- **Two phones.** Open the same link on two devices and draw on one. The other
  should show it within a few seconds, and the toolbar should read "live".

### Running the browser tests locally

```
npm run e2e
```

In a sandbox that already has Chromium, point Playwright at it:

```
PW_CHROMIUM=/path/to/chrome npm run e2e
```
