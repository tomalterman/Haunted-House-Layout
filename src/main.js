import { layout } from './layout.js';
import { renderPlan2D } from './plan2d.js';

const $ = (id) => document.getElementById(id);
const plan2d = $('plan-2d');
const plan3d = $('plan-3d');
const btn2d = $('view-2d');
const btn3d = $('view-3d');
const routeBox = $('show-route');
const resetBtn = $('reset-view');
const status = $('status');

$('subtitle').textContent = `To scale · ${layout.room.width} × ${layout.room.depth} ft`;
plan2d.innerHTML = renderPlan2D(layout);

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

function setPressed(is3d) {
  btn2d.setAttribute('aria-pressed', String(!is3d));
  btn3d.setAttribute('aria-pressed', String(is3d));
}

function show2D() {
  setPressed(false);
  plan3d.hidden = true;
  plan2d.hidden = false;
  resetBtn.hidden = true;
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
          view3d = m.mountView3D(plan3d, layout, { showRoute: routeBox.checked });
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
  if (btn3d.getAttribute('aria-pressed') !== 'true') return; // user switched back while loading
  view3d.show();
  resetBtn.hidden = false;
}

btn2d.addEventListener('click', () => {
  hideStatus();
  show2D();
});
btn3d.addEventListener('click', () => {
  show3D();
});
routeBox.addEventListener('change', applyRoute);
resetBtn.addEventListener('click', () => view3d && view3d.resetView());

applyRoute();
