// Zone tool (KTD14 Layer 2): carve team zones by tapping corners along the
// walls, then assign or reassign a team from a small bottom sheet.
//
// The draft (corner snapping, closing, region presets) and the
// self-intersection test are pure and tested. createZoneTool wires them to the
// store, the toolbar's zone tap callback, and two DOM pieces it owns: an SVG
// overlay showing the outline in progress and the bottom sheet. Marks are never
// touched by any zone edit (KTD7); zone delete asks for confirmation (KTD8).
import "./zone-sheet.css";
import { snapPoint, wallEndpoints, zoneAt } from "../geometry.js";

export const SNAP_GRID_FEET = 1;
export const SNAP_RADIUS_FEET = 1.5;
export const MIN_CORNERS = 3;
const CORNER_RADIUS_PX = 5;
const FIRST_CORNER_RADIUS_PX = 8;

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const copyPoints = (points) => points.map(([x, y]) => [x, y]);

// ---- pure core ----

/**
 * Corner-by-corner polygon draft. Corners snap to the grid and to wall
 * endpoints within `radius` feet; tapping within `radius` of the first corner
 * closes the polygon once it has MIN_CORNERS corners, else discards it.
 */
export function createZoneDraft({ floorplan, grid = SNAP_GRID_FEET, radius = SNAP_RADIUS_FEET }) {
  const anchors = wallEndpoints(floorplan.walls);
  let corners = [];

  const reset = () => {
    corners = [];
  };

  return {
    get points() {
      return copyPoints(corners);
    },

    addCorner(feet) {
      const snapped = snapPoint(feet, { grid, anchors, radius });
      if (corners.length > 0) {
        const first = corners[0];
        const closing = Math.hypot(feet[0] - first[0], feet[1] - first[1]) <= radius || samePoint(snapped, first);
        if (closing) {
          const points = copyPoints(corners);
          reset();
          if (points.length >= MIN_CORNERS) return { status: "closed", points };
          return { status: "discarded", points: [] };
        }
        // A repeated tap on the last corner adds nothing.
        if (samePoint(snapped, corners[corners.length - 1])) {
          return { status: "added", points: copyPoints(corners) };
        }
      }
      corners.push(snapped);
      return { status: "added", points: copyPoints(corners) };
    },

    cancel: reset,

    /** The named region's polygon as a fresh array, or null. Resets the draft. */
    fromRegion(regionId) {
      const region = floorplan.regions?.find((r) => r.id === regionId);
      if (!region) return null;
      reset();
      return copyPoints(region.points);
    },
  };
}

// Orientation of the triple, with a tolerance for near-collinear points.
function orient([ax, ay], [bx, by], [cx, cy]) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(v) < 1e-9) return 0;
  return v > 0 ? 1 : -1;
}

function onSegment([px, py], [ax, ay], [bx, by]) {
  return (
    Math.min(ax, bx) - 1e-9 <= px &&
    px <= Math.max(ax, bx) + 1e-9 &&
    Math.min(ay, by) - 1e-9 <= py &&
    py <= Math.max(ay, by) + 1e-9
  );
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(c, a, b)) return true;
  if (o2 === 0 && onSegment(d, a, b)) return true;
  if (o3 === 0 && onSegment(a, c, d)) return true;
  if (o4 === 0 && onSegment(b, c, d)) return true;
  return false;
}

/** True when any two non-adjacent edges of the closed polygon touch or cross. */
export function isSelfIntersecting(points) {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip edges sharing a vertex: the next edge, and the last with the first.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Write a new zone to the store; returns its id, or null for a bad polygon. */
export function commitZone(store, { name, team, points }) {
  if (!points || points.length < MIN_CORNERS) return null;
  const trimmed = String(name ?? "").trim();
  return store.setZone({ name: trimmed || team, team, points: copyPoints(points) });
}

// ---- DOM: draft overlay ----

const SVG_NS = "http://www.w3.org/2000/svg";

function createOverlay(doc, host, transform) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "zone-draft");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("hidden", "");
  // Sit right above the canvas so the toolbar and sheet still paint over it.
  const canvas = host.querySelector("canvas");
  if (canvas) canvas.insertAdjacentElement("afterend", svg);
  else host.append(svg);

  return {
    render(points, closed) {
      svg.replaceChildren();
      if (!points || points.length === 0) {
        svg.setAttribute("hidden", "");
        return;
      }
      svg.removeAttribute("hidden");
      const px = points.map((p) => transform.toPx(p));
      const shape = doc.createElementNS(SVG_NS, closed || px.length > 2 ? "polygon" : "polyline");
      shape.setAttribute("class", closed ? "zone-draft-fill" : "zone-draft-line");
      shape.setAttribute("points", px.map(([x, y]) => `${x},${y}`).join(" "));
      svg.append(shape);
      px.forEach(([x, y], i) => {
        const dot = doc.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", i === 0 && !closed ? FIRST_CORNER_RADIUS_PX : CORNER_RADIUS_PX);
        dot.setAttribute("class", i === 0 && !closed ? "zone-draft-first" : "zone-draft-corner");
        svg.append(dot);
      });
    },
    destroy() {
      svg.remove();
    },
  };
}

// ---- DOM: bottom sheet ----

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(doc, className, text, onClick) {
  const b = el(doc, "button", className, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function createSheet(doc, host, { teams, regions, handlers }) {
  const sheet = el(doc, "div", "zone-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Zone");
  sheet.hidden = true;

  const title = el(doc, "div", "zone-sheet-title");
  const hint = el(doc, "div", "zone-sheet-hint");

  const presetsLabel = el(doc, "div", "zone-sheet-label", "Start from a region");
  const presets = el(doc, "div", "zone-sheet-row");
  for (const region of regions) {
    presets.append(button(doc, "zone-preset", region.name, () => handlers.onPreset(region.id)));
  }

  const teamsRow = el(doc, "div", "zone-sheet-row");
  const chips = new Map();
  for (const t of teams) {
    const chip = button(doc, "zone-chip", null, () => handlers.onTeam(t.id));
    chip.style.setProperty("--team", t.color);
    chip.append(el(doc, "span", "swatch"), el(doc, "span", "chip-name", t.name));
    chip.setAttribute("aria-label", `Assign to ${t.name}`);
    teamsRow.append(chip);
    chips.set(t.id, chip);
  }

  const nameRow = el(doc, "div", "zone-sheet-row");
  const name = el(doc, "input", "zone-name");
  name.type = "text";
  name.maxLength = 40;
  name.autocomplete = "off";
  name.enterKeyHint = "done";
  name.placeholder = "Zone name";
  name.setAttribute("aria-label", "Zone name");
  name.addEventListener("input", () => handlers.onName(name.value));
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlers.onSave();
    }
  });
  nameRow.append(name);

  const warning = el(doc, "div", "zone-sheet-warning", "This outline crosses itself.");
  warning.setAttribute("role", "status");

  const actions = el(doc, "div", "zone-sheet-actions");
  const save = button(doc, "zone-save", "Save", handlers.onSave);
  const cancel = button(doc, "zone-cancel", "Cancel", handlers.onCancel);
  const del = button(doc, "zone-delete", "Delete", handlers.onDelete);
  actions.append(save, cancel, del);

  sheet.append(title, hint, presetsLabel, presets, teamsRow, nameRow, warning, actions);
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handlers.onCancel();
    }
  });
  host.append(sheet);

  const toolbar = doc.getElementById("toolbar");

  return {
    /** view: { mode: "draft" | "new" | "edit", corners, team, name, warn } */
    render(view) {
      if (!view) {
        sheet.hidden = true;
        return;
      }
      const drafting = view.mode === "draft";
      const editing = view.mode === "edit";
      sheet.hidden = false;
      sheet.style.setProperty("--zone-sheet-bottom", `${toolbar?.offsetHeight ?? 0}px`);

      title.textContent = drafting ? "New zone" : editing ? "Edit zone" : "Assign zone";
      hint.hidden = !drafting;
      if (drafting) {
        const n = view.corners;
        hint.textContent =
          n < MIN_CORNERS
            ? `${n} corner${n === 1 ? "" : "s"}. Tap corners along the walls.`
            : `${n} corners. Tap the first corner to close.`;
      }
      presetsLabel.hidden = !drafting;
      presets.hidden = !drafting;
      teamsRow.hidden = drafting;
      nameRow.hidden = drafting;
      for (const [id, chip] of chips) chip.setAttribute("aria-pressed", String(id === view.team));
      if (!drafting && name.value !== view.name) name.value = view.name;
      warning.hidden = drafting || !view.warn;
      save.hidden = drafting;
      del.hidden = !editing;
    },
    destroy() {
      sheet.remove();
    },
  };
}

// ---- tool ----

export function createZoneTool({
  store,
  floorplan,
  teams,
  toolbar,
  mapView,
  confirm = globalThis.confirm,
  doc = globalThis.document,
}) {
  const { transform } = mapView;
  const draft = createZoneDraft({ floorplan });
  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? id;
  const host = doc.getElementById("map-view") ?? doc.body;

  // mode: "idle" | "draft" | "new" (sheet for pending points) | "edit" (sheet for zoneId)
  let mode = "idle";
  let pending = null; // points awaiting a team, in "new" mode
  let zoneId = null; // zone being edited, in "edit" mode
  let team = null;
  let name = "";
  let nameDirty = false;

  const handlers = {
    onPreset(regionId) {
      const points = draft.fromRegion(regionId);
      if (points) startNew(points);
    },
    onTeam(id) {
      team = id;
      if (!nameDirty) name = teamName(id);
      render();
    },
    onName(value) {
      name = value;
      nameDirty = value.trim() !== "" && value !== teamName(team);
    },
    onSave() {
      if (mode === "new" && pending) {
        commitZone(store, { name, team, points: pending });
      } else if (mode === "edit" && zoneId) {
        store.assignZone(zoneId, team);
        store.renameZone(zoneId, name.trim() || teamName(team));
      }
      close();
    },
    onDelete() {
      if (mode !== "edit" || !zoneId) return;
      const zone = store.getState().zones.find((z) => z.id === zoneId);
      const label = zone?.name || teamName(zone?.team);
      const ok =
        typeof confirm === "function" ? confirm.call(globalThis, `Delete zone "${label}"? This cannot be undone.`) : true;
      if (!ok) return;
      store.deleteZone(zoneId);
      close();
    },
    onCancel: () => close(),
  };

  const overlay = createOverlay(doc, host, transform);
  const sheet = createSheet(doc, host, { teams, regions: floorplan.regions ?? [], handlers });

  function outlinePoints() {
    if (mode === "new") return pending;
    if (mode === "draft") return draft.points;
    if (mode === "edit") return store.getState().zones.find((z) => z.id === zoneId)?.points ?? null;
    return null;
  }

  function render() {
    overlay.render(outlinePoints(), mode !== "draft");
    if (mode === "idle") return sheet.render(null);
    const points = outlinePoints() ?? [];
    return sheet.render({
      mode,
      corners: points.length,
      team,
      name,
      warn: isSelfIntersecting(points),
    });
  }

  function close() {
    mode = "idle";
    pending = null;
    zoneId = null;
    draft.cancel();
    render();
  }

  function startNew(points) {
    mode = "new";
    pending = points;
    zoneId = null;
    team = toolbar.team ?? teams[0]?.id ?? null;
    name = teamName(team);
    nameDirty = false;
    render();
  }

  function openSheetFor(id) {
    const zone = store.getState().zones.find((z) => z.id === id);
    if (!zone) return false;
    draft.cancel();
    mode = "edit";
    pending = null;
    zoneId = zone.id;
    team = zone.team;
    name = zone.name ?? "";
    nameDirty = name.trim() !== "" && name !== teamName(team);
    render();
    return true;
  }

  function addCorner(feet) {
    const result = draft.addCorner(feet);
    if (result.status === "closed") return startNew(result.points);
    if (result.status === "discarded") return close();
    mode = "draft";
    return render();
  }

  function handleTap(feet) {
    // The sheet for a finished outline is modal until Save or Cancel.
    if (mode === "new") return;
    if (mode === "draft") return addCorner(feet);
    const zone = zoneAt(feet, store.getState().zones);
    if (zone) return void openSheetFor(zone.id);
    if (mode === "edit") close();
    addCorner(feet);
  }

  function cancelDraft() {
    if (mode === "draft" || mode === "new") close();
  }

  // The store can delete the edited zone from another device; pan and zoom
  // move the outline under the overlay.
  const onStore = () => {
    if (mode === "edit" && !store.getState().zones.some((z) => z.id === zoneId)) close();
    else render();
  };
  const unsubscribe = store.subscribe(onStore);
  const originals = {};
  for (const fn of ["fitToBounds", "panBy", "zoomAt"]) {
    originals[fn] = transform[fn];
    transform[fn] = (...args) => {
      const out = originals[fn].apply(transform, args);
      if (mode !== "idle") overlay.render(outlinePoints(), mode !== "draft");
      return out;
    };
  }

  toolbar.setZoneHandler((feet) => handleTap(feet));
  const unlistenTool = toolbar.onToolChange?.((tool) => {
    if (tool !== "zone") close();
  });

  return {
    handleTap,
    openSheetFor,
    cancelDraft,
    get mode() {
      return mode;
    },
    destroy() {
      unsubscribe();
      unlistenTool?.();
      for (const fn of Object.keys(originals)) transform[fn] = originals[fn];
      toolbar.setZoneHandler(null);
      overlay.destroy();
      sheet.destroy();
    },
  };
}
