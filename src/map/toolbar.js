// Map toolbar (KTD14 Layer 2): team chips, tool buttons, undo, walk, and the
// sync status readout, plus the glue between the input state machine and the
// store/map view. Thin DOM code; the machine itself is tested in map-input.js.
import { encodeStrokePoints } from "../store.js";
import { hitTestMark } from "./map-input.js";

export const STROKE_SIZE_FEET = 0.6;
export const ERASE_RADIUS_FEET = 1;
/** Minimum erase tolerance in CSS pixels, a comfortable fingertip. */
export const ERASE_RADIUS_PX = 22;
const LONG_PRESS_MS = 500;
const LABEL_MARGIN_PX = 8;

const TOOL_BUTTONS = [
  ["draw", "Draw"],
  ["label", "Label"],
  ["erase", "Erase"],
  ["zone", "Zone"],
  ["walk-from-here", "Walk here"],
];


const EYE_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const b = el("button", className, text);
  b.type = "button";
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** Store-shaped in-progress stroke, encoded exactly as `addStroke` will store it. */
function toInProgressStroke(team, points, pointerType) {
  const { flat, pressure, sawPressure } = encodeStrokePoints(points);
  const stroke = { team, size: STROKE_SIZE_FEET, points: flat };
  if (pointerType === "pen" && sawPressure) stroke.pressure = pressure;
  return stroke;
}

export function createToolbar({
  root,
  store,
  teams,
  mapView,
  machine,
  onWalk = () => {},
  onWalkFromHere = () => {},
}) {
  const { transform } = mapView;
  let team = teams[0]?.id ?? null;
  let zoneHandler = () => {};
  const toolListeners = new Set();
  let stroke = null;
  let strokePointerType = null;

  // ---- machine callbacks ----

  const toFeetTriple = ({ x, y, pressure }) => [...transform.toFeet([x, y]), pressure];

  function wire() {
    machine.setHandlers({
      onStrokeStart(point, pointerType) {
        stroke = [toFeetTriple(point)];
        strokePointerType = pointerType;
        mapView.setInProgressStroke(toInProgressStroke(team, stroke, pointerType));
      },
      onStrokePoint(point) {
        if (!stroke) return;
        stroke.push(toFeetTriple(point));
        mapView.setInProgressStroke(toInProgressStroke(team, stroke, strokePointerType));
      },
      onStrokeEnd(points, pointerType) {
        const feet = points.map(toFeetTriple);
        stroke = null;
        strokePointerType = null;
        mapView.setInProgressStroke(null);
        store.addStroke({ team, size: STROKE_SIZE_FEET, points: feet, pointerType });
      },
      onStrokeCancel() {
        stroke = null;
        strokePointerType = null;
        mapView.setInProgressStroke(null);
      },
      onPan(delta) {
        transform.panBy(delta);
      },
      onZoom({ center, factor }) {
        transform.zoomAt(center, factor);
      },
      onTap({ x, y, tool }) {
        const feet = transform.toFeet([x, y]);
        switch (tool) {
          case "label":
            return openLabel([x, y], feet);
          case "erase": {
            // The tolerance a finger feels is in pixels, so widen the foot radius
            // when zoomed out; at fit zoom 1 ft is only ~4 px.
            const radius = Math.max(ERASE_RADIUS_FEET, ERASE_RADIUS_PX / mapView.transform.scale);
            const id = hitTestMark(store.getState(), feet, radius);
            if (id) store.erase(id);
            return undefined;
          }
          case "walk-from-here":
            store.setWalkStart(feet);
            return onWalkFromHere(feet);
          case "zone":
            return zoneHandler(feet, [x, y]);
          default:
            return undefined;
        }
      },
    });
  }

  // ---- DOM ----

  root.replaceChildren();
  root.setAttribute("role", "toolbar");

  const chipsRow = el("div", "chips");
  const toolsRow = el("div", "tools");
  const toolsScroll = el("div", "tools-scroll");
  const toolsPin = el("div", "tools-pin");
  toolsRow.append(toolsScroll, toolsPin);
  const warning = el("div", "save-warning", "Save failed");
  warning.hidden = true;
  root.append(chipsRow, toolsRow, warning);

  const chips = new Map();
  for (const t of teams) {
    const chip = el("div", "chip");
    chip.style.setProperty("--team", t.color);

    const select = button("chip-select", null);
    select.append(el("span", "swatch"), el("span", "chip-name", t.name));
    select.setAttribute("aria-label", `Draw as ${t.name}`);

    // Long-press on the chip toggles visibility; a click selects the team.
    let timer = null;
    let longPressed = false;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    select.addEventListener("pointerdown", () => {
      longPressed = false;
      clearTimer();
      timer = setTimeout(() => {
        longPressed = true;
        store.setTeamVisible(t.id, !store.isTeamVisible(t.id));
      }, LONG_PRESS_MS);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      select.addEventListener(type, clearTimer);
    }
    select.addEventListener("click", () => {
      if (longPressed) {
        longPressed = false;
        return;
      }
      setTeam(t.id);
    });

    const eye = button("chip-eye", null, () => {
      store.setTeamVisible(t.id, !store.isTeamVisible(t.id));
    });
    eye.innerHTML = EYE_SVG;

    chip.append(select, eye);
    chipsRow.append(chip);
    chips.set(t.id, { chip, select, eye, name: t.name });
  }

  const toolButtons = new Map();
  for (const [name, text] of TOOL_BUTTONS) {
    const b = button("tool", text, () => setTool(name));
    toolButtons.set(name, b);
    toolsScroll.append(b);
  }
  const undoButton = button("tool action", "Undo", () => store.undo());
  const walkButton = button("tool action walk", "Walk", () => onWalk());
  const status = el("div", "status");
  status.setAttribute("role", "status");
  const dot = el("span", "status-dot");
  const word = el("span", "status-word");
  status.append(dot, word);
  // Walk / Undo / live stay pinned: on a phone the tool row otherwise
  // scrolls them off-screen, and volunteers never find the walk.
  toolsPin.append(undoButton, walkButton, status);

  // ---- label entry ----

  const labelBar = document.getElementById("label-bar");
  const labelInput = document.getElementById("label-input");
  const labelDone = document.getElementById("label-done");
  const labelCancel = document.getElementById("label-cancel");
  let labelAnchor = null; // { px: [x, y], feet: [x, y] }

  function placeLabelBar() {
    if (!labelAnchor || !labelBar) return;
    const vv = globalThis.visualViewport;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const barHeight = labelBar.offsetHeight || 48;
    const barWidth = labelBar.offsetWidth || 240;
    let [x, y] = labelAnchor.px;
    // Keep the bar above the keyboard by scrolling the map up with the anchor.
    const lowest = viewportHeight - barHeight - LABEL_MARGIN_PX;
    if (y > lowest) {
      const dy = lowest - y;
      transform.panBy([0, dy]);
      y = lowest;
      labelAnchor.px = [x, y];
    }
    x = Math.max(LABEL_MARGIN_PX, Math.min(x, viewportWidth - barWidth - LABEL_MARGIN_PX));
    labelBar.style.left = `${x}px`;
    labelBar.style.top = `${y}px`;
  }

  function openLabel(px, feet) {
    if (!labelBar || !labelInput) return;
    labelAnchor = { px: [...px], feet };
    labelInput.value = "";
    labelBar.hidden = false;
    placeLabelBar();
    labelInput.focus();
  }

  function closeLabel() {
    labelAnchor = null;
    if (labelBar) labelBar.hidden = true;
    if (labelInput) {
      labelInput.value = "";
      labelInput.blur();
    }
  }

  function commitLabel() {
    if (!labelAnchor) return;
    const text = labelInput.value.trim();
    const [x, y] = labelAnchor.feet;
    if (text) store.addLabel({ team, x, y, text });
    closeLabel();
  }

  const onLabelKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitLabel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeLabel();
    }
  };
  labelInput?.addEventListener("keydown", onLabelKey);
  labelDone?.addEventListener("click", commitLabel);
  labelCancel?.addEventListener("click", closeLabel);
  const onViewportChange = () => {
    if (labelAnchor) placeLabelBar();
  };
  globalThis.visualViewport?.addEventListener("resize", onViewportChange);
  globalThis.visualViewport?.addEventListener("scroll", onViewportChange);

  // ---- state refresh ----

  function setTeam(id) {
    team = id;
    for (const [tid, { select }] of chips) {
      select.setAttribute("aria-pressed", String(tid === id));
    }
  }

  function setTool(name) {
    machine.setTool(name);
    if (name !== "label") closeLabel();
    for (const [tname, b] of toolButtons) b.setAttribute("aria-pressed", String(tname === name));
    for (const fn of toolListeners) fn(name);
  }

  function refresh() {
    for (const [tid, { chip, eye, name }] of chips) {
      const visible = store.isTeamVisible(tid);
      chip.classList.toggle("is-hidden", !visible);
      eye.setAttribute("aria-pressed", String(!visible));
      eye.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${name} marks`);
    }
    const s = store.status;
    dot.className = `status-dot status-${s}`;
    word.textContent = s;
    warning.hidden = !store.saveError;
  }

  wire();
  const unsubscribe = store.subscribe(refresh);
  setTeam(team);
  setTool(machine.tool);
  refresh();

  return {
    get team() {
      return team;
    },
    setTeam,
    setTool,
    setZoneHandler(fn) {
      zoneHandler = typeof fn === "function" ? fn : () => {};
    },
    /** Called with the tool name after every setTool; returns an unsubscribe. */
    onToolChange(fn) {
      toolListeners.add(fn);
      return () => toolListeners.delete(fn);
    },
    refresh,
    closeLabel,
    destroy() {
      unsubscribe();
      toolListeners.clear();
      closeLabel();
      labelInput?.removeEventListener("keydown", onLabelKey);
      labelDone?.removeEventListener("click", commitLabel);
      labelCancel?.removeEventListener("click", closeLabel);
      globalThis.visualViewport?.removeEventListener("resize", onViewportChange);
      globalThis.visualViewport?.removeEventListener("scroll", onViewportChange);
      root.replaceChildren();
    },
  };
}
