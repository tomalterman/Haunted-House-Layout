// App shell: view switching (U1) plus the shared-document wiring (U9).
// U8 wires the map and walk views onto `store`.
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { createStore } from "./store.js";

const mapView = document.getElementById("map-view");
const walkView = document.getElementById("walk-view");

export function showView(name) {
  const walk = name === "walk";
  mapView.hidden = walk;
  walkView.hidden = !walk;
}

// ---- Shared document (KTD1, KTD3, KTD12) ----
// The room is the Durable Object name: `?room=rehearsal` opens a separate
// board. It is sanitized to [a-z0-9-] so the name is URL-safe and stable.
export const DEFAULT_ROOM = "gym";

export function sanitizeRoom(raw) {
  const cleaned = (raw ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return cleaned || DEFAULT_ROOM;
}

export const room = sanitizeRoom(new URLSearchParams(location.search).get("room"));

const doc = new Y.Doc();

// Local copy first (offline reads and the informal backup), then the server.
// Either may fail (private mode, blocked IndexedDB, Worker not running);
// the app still works and the store reports status "local".
let persistence = null;
try {
  persistence = new IndexeddbPersistence(`hh-${room}`, doc);
} catch (err) {
  console.warn("IndexedDB persistence unavailable, running without a local copy", err);
}

let provider = null;
try {
  // YProvider(host, room, doc, options): host is the page origin with the
  // scheme stripped, `party: "main"` matches the Durable Object binding, and
  // `protocol` is the bare WebSocket scheme ("ws" | "wss"). The URL becomes
  // <protocol>://<host>/parties/main/<room>; under `npm run dev` Vite proxies
  // /parties to the Worker on :8787.
  provider = new YProvider(location.host, room, doc, {
    party: "main",
    protocol: location.protocol === "https:" ? "wss" : "ws",
  });
} catch (err) {
  console.warn("Sync provider unavailable, running local only", err);
}

export const store = createStore({ doc, provider, persistence });
export { doc, provider, persistence };

showView("map");
