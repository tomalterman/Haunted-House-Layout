import { layout, GROUP_COLORS } from './layout.js';
import { renderPlan2D } from './plan2d.js';

const $ = (id) => document.getElementById(id);
const plan2d = $('plan-2d');
const plan3d = $('plan-3d');
const btn2d = $('view-2d');
const btn3d = $('view-3d');
const routeBox = $('show-route');
const measureBox = $('show-measurements');
const groupsBox = $('show-groups');
const groupPanel = $('group-panel');
const resetBtn = $('reset-view');
const sandboxControls = $('sandbox-controls');
const sceneSelect = $('scene-select');
const lightsSelect = $('lights-select');
const replayBtn = $('replay');
const releaseBtn = $('release');
const flyHint = $('fly-hint');
const status = $('status');

$('subtitle').textContent = `To scale · ${layout.room.width} × ${layout.room.depth} ft`;
plan2d.innerHTML = renderPlan2D(layout);

// Group sizes and doorway widths, listed for the page.
const doorWidth = Object.fromEntries(layout.openings.map((o) => [o.id, Math.round(o.width * 100) / 100]));
groupPanel.innerHTML = layout.groups
  .map((g) => {
    const size = g.width ? `${g.width} ft wide · ${g.area} sq ft` : `${g.area} sq ft`;
    return (
      `<li><span class="chip" style="--group:${GROUP_COLORS[g.n - 1]}">${g.n}</span>` +
      `<span><b>${g.name}</b><br>${size}<br>In ${doorWidth[g.in]} ft · out ${doorWidth[g.out]} ft</span></li>`
    );
  })
  .join('');

let view3d = null;
let loading = null;

const showStatus = (text, isError = false) => {
  status.textContent = text;
  status.classList.toggle('error', isError);
  status.hidden = false;
};
const hideStatus = () => {
  status.hidden = true;
};

function applyRoute() {
  const visible = routeBox.checked;
  const g = plan2d.querySelector('#route');
  if (g) g.style.display = visible ? '' : 'none';
  if (view3d) view3d.setRouteVisible(visible);
}

function applyMeasurements() {
  const visible = measureBox.checked;
  const g = plan2d.querySelector('#measurements');
  if (g) g.style.display = visible ? '' : 'none';
  if (view3d) view3d.setMeasurementsVisible(visible);
}

function applyGroups() {
  const visible = groupsBox.checked;
  const svg = plan2d.querySelector('svg');
  if (svg) svg.classList.toggle('groups-on', visible);
  groupPanel.hidden = !visible;
  if (view3d) view3d.setGroupsVisible(visible);
}

function setPressed(is3d) {
  btn2d.setAttribute('aria-pressed', String(!is3d));
  btn3d.setAttribute('aria-pressed', String(is3d));
}

// Controls hint for the 3D view, worded for touch or keyboard, dismissible for good.
const HINT_KEY = 'fly-hint-dismissed';
const touch = window.matchMedia('(pointer: coarse)').matches;
$('fly-hint-text').textContent = touch
  ? 'Drag to look · pinch to fly · two-finger drag to slide or rise'
  : 'Drag to look · W A S D to fly · E / Q up and down · Shift for speed';
const hintDismissed = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
$('fly-hint-close').addEventListener('click', () => {
  flyHint.hidden = true;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // private mode: the hint just comes back next time
  }
  view3d?.focus();
});

function show2D() {
  setPressed(false);
  plan3d.hidden = true;
  plan2d.hidden = false;
  sandboxControls.hidden = true;
  flyHint.hidden = true;
  if (view3d) view3d.hide();
}

async function show3D() {
  setPressed(true);
  plan2d.hidden = true;
  plan3d.hidden = false;
  if (!view3d) {
    if (!loading) {
      showStatus('Loading 3D…');
      loading = import('./view3d.js')
        .then((m) => {
          view3d = m.mountView3D(plan3d, layout, {
            showRoute: routeBox.checked,
            showMeasurements: measureBox.checked,
            showGroups: groupsBox.checked,
            lights: lightsSelect.value,
          });
          sceneSelect.replaceChildren(...view3d.scenes.map((s) => new Option(s.name, s.id)));
          sceneSelect.value = view3d.snapshot().scene;
          updateRelease();
          window.__sandbox = { snapshot: () => view3d.snapshot() }; // read-only hook for tests
        })
        .finally(() => {
          loading = null;
        });
    }
    try {
      await loading;
    } catch (err) {
      console.warn('3D view unavailable:', err);
      show2D();
      showStatus('3D is not available on this device. Showing the 2D plan.', true);
      return;
    }
    hideStatus();
  }
  if (btn3d.getAttribute('aria-pressed') !== 'true') {
    view3d.hide(); // user switched back while loading: keep the hidden loop stopped
    return;
  }
  view3d.show();
  sandboxControls.hidden = false;
  flyHint.hidden = hintDismissed();
  view3d.focus();
}

btn2d.addEventListener('click', () => {
  hideStatus();
  show2D();
});
btn3d.addEventListener('click', () => {
  show3D();
});
routeBox.addEventListener('change', applyRoute);
measureBox.addEventListener('change', applyMeasurements);
groupsBox.addEventListener('change', applyGroups);
// Each sandbox control hands focus back to the view so the fly keys keep working.
const sandboxAction = (fn) => () => {
  if (!view3d) return;
  fn();
  view3d.focus();
};
// Release shows only for scenes that hold something for a manual release, and is usable
// until it has been pulled; Replay or a scene change re-arms it.
function updateRelease() {
  const s = view3d.snapshot();
  releaseBtn.hidden = !s.canRelease;
  releaseBtn.disabled = !s.awaitingRelease;
}
resetBtn.addEventListener('click', sandboxAction(() => view3d.resetView()));
replayBtn.addEventListener('click', sandboxAction(() => {
  view3d.replay();
  updateRelease();
}));
releaseBtn.addEventListener('click', sandboxAction(() => {
  view3d.release();
  updateRelease();
}));
sceneSelect.addEventListener('change', sandboxAction(() => {
  view3d.setScene(sceneSelect.value);
  updateRelease();
}));
lightsSelect.addEventListener('change', sandboxAction(() => view3d.setLights(lightsSelect.value)));

applyRoute();
applyMeasurements();
applyGroups();
