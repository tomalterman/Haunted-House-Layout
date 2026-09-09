// Shared document store (Layer 1, KTD14). Owns the Yjs document shape and every
// mutation the UI performs. DOM-free: never touches window, document, or location.
//
// Document shape:
//   zones   Y.Map   id -> { id, name, team, points: [[xFeet, yFeet]...], createdAt }
//   strokes Y.Array of { id, team, size, points: [x0, y0, x1, y1, ...], pressure? }
//           points are integers in twentieths of a foot, stored flat so a
//           200-point stroke stays under 1.5 KB (KTD2); pressure only for pen.
//   labels  Y.Array of { id, team, x, y, text } with x, y in feet
//   meta    Y.Map   lastSaveError written by the server (KTD12)

export const STROKE_QUANTUM = 20;
export const LABEL_MAX_CHARS = 40;
const DEFAULT_PRESSURE = 0.5;

/** Decode a stored stroke into feet triples [x, y, pressure]. */
export function decodeStrokePoints(stroke) {
  const out = [];
  const pts = stroke.points;
  const pressure = stroke.pressure;
  for (let i = 0, k = 0; i + 1 < pts.length; i += 2, k += 1) {
    const p = pressure ? pressure[k] : DEFAULT_PRESSURE;
    out.push([pts[i] / STROKE_QUANTUM, pts[i + 1] / STROKE_QUANTUM, p ?? DEFAULT_PRESSURE]);
  }
  return out;
}

export function createStore({ doc, provider = null, persistence = null }) {
  const zones = doc.getMap("zones");
  const strokes = doc.getArray("strokes");
  const labels = doc.getArray("labels");
  const meta = doc.getMap("meta");
  const sharedTypes = [zones, strokes, labels, meta];

  // Local-only state (KTD8, KTD13): undo stack, hidden teams, walk start, sync status.
  const undoStack = [];
  const hidden = new Set();
  let walkStart = null;
  let status = provider ? "connecting" : "local";
  const listeners = new Set();

  // Short id unique across devices: client id plus random tail.
  const clientTag = doc.clientID.toString(36);
  const newId = () => `${clientTag}-${Math.random().toString(36).slice(2, 8)}`;

  function notify() {
    for (const fn of listeners) fn();
  }

  // One notification per transaction, only when one of our types changed.
  const onAfterTransaction = (tr) => {
    if (listeners.size === 0) return;
    for (const type of sharedTypes) {
      if (tr.changed.has(type)) {
        notify();
        return;
      }
    }
  };
  doc.on("afterTransaction", onAfterTransaction);

  // Provider status: y-partyserver's YProvider emits "status" with
  // { status: "connected" | "disconnected" | "connecting" } and "sync" with a boolean.
  function setStatus(next) {
    if (next === status) return;
    status = next;
    notify();
  }
  const onProviderStatus = ({ status: s }) => {
    if (s === "connected") setStatus("live");
    else if (s === "disconnected") setStatus("offline");
    else if (s === "connecting") setStatus("connecting");
  };
  const onProviderSync = (synced) => {
    if (synced) setStatus("live");
  };
  if (provider) {
    if (provider.synced || provider.wsconnected) status = "live";
    provider.on("status", onProviderStatus);
    provider.on("sync", onProviderSync);
  }

  // ---- helpers over the arrays ----

  function indexOfId(arr, id) {
    let i = 0;
    for (const item of arr) {
      if (item.id === id) return i;
      i += 1;
    }
    return -1;
  }

  function removeById(arr, id) {
    const i = indexOfId(arr, id);
    if (i < 0) return false;
    arr.delete(i, 1);
    return true;
  }

  // ---- marks ----

  function addStroke({ team, size, points, pointerType }) {
    const id = newId();
    const flat = [];
    const pressure = [];
    let sawPressure = false;
    for (const p of points) {
      flat.push(Math.round(p[0] * STROKE_QUANTUM), Math.round(p[1] * STROKE_QUANTUM));
      if (p[2] != null) sawPressure = true;
      pressure.push(p[2] == null ? DEFAULT_PRESSURE : Math.round(p[2] * 100) / 100);
    }
    const stroke = { id, team, size, points: flat };
    if (pointerType === "pen" && sawPressure) stroke.pressure = pressure;
    strokes.push([stroke]);
    undoStack.push(id);
    return id;
  }

  function addLabel({ team, x, y, text }) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return null;
    const id = newId();
    labels.push([{ id, team, x, y, text: trimmed.slice(0, LABEL_MAX_CHARS) }]);
    undoStack.push(id);
    return id;
  }

  // Erase is global: removes a stroke or label by id for everyone.
  function erase(id) {
    return removeById(strokes, id) || removeById(labels, id);
  }

  // Undo is session-local: pop this store's own ids until one is still present.
  function undo() {
    while (undoStack.length > 0) {
      const id = undoStack.pop();
      if (erase(id)) return id;
    }
    return null;
  }

  // ---- zones ----

  function setZone({ id, name, team, points }) {
    const zoneId = id ?? newId();
    const existing = zones.get(zoneId);
    zones.set(zoneId, {
      id: zoneId,
      name,
      team,
      points: points.map(([x, y]) => [x, y]),
      createdAt: existing ? existing.createdAt : Date.now(),
    });
    return zoneId;
  }

  function patchZone(id, patch) {
    const zone = zones.get(id);
    if (!zone) return false;
    zones.set(id, { ...zone, ...patch });
    return true;
  }

  const assignZone = (id, team) => patchZone(id, { team });
  const renameZone = (id, name) => patchZone(id, { name });

  function deleteZone(id) {
    if (!zones.has(id)) return false;
    zones.delete(id);
    return true;
  }

  // ---- local state ----

  function setTeamVisible(team, visible) {
    const changed = visible ? hidden.delete(team) : !hidden.has(team) && !!hidden.add(team);
    if (changed) notify();
  }

  const isTeamVisible = (team) => !hidden.has(team);

  function setWalkStart(point) {
    walkStart = point ? [point[0], point[1]] : null;
    notify();
  }

  const getWalkStart = () => walkStart;

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() {
    const zoneList = Array.from(zones.values()).sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
    );
    return {
      zones: zoneList,
      strokes: strokes.toArray(),
      labels: labels.toArray(),
      hidden: new Set(hidden),
      walkStart,
    };
  }

  function destroy() {
    doc.off("afterTransaction", onAfterTransaction);
    if (provider) {
      provider.off("status", onProviderStatus);
      provider.off("sync", onProviderSync);
      provider.destroy?.();
    }
    persistence?.destroy?.();
    listeners.clear();
  }

  return {
    doc,
    addStroke,
    addLabel,
    erase,
    undo,
    setZone,
    assignZone,
    renameZone,
    deleteZone,
    setTeamVisible,
    isTeamVisible,
    setWalkStart,
    getWalkStart,
    subscribe,
    getState,
    destroy,
    get status() {
      return status;
    },
    get saveError() {
      return meta.get("lastSaveError") ?? null;
    },
  };
}
