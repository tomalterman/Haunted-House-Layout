// App shell from U1: view switching only. U8 and U9 wire the store, the walk, and sync.
const mapView = document.getElementById("map-view");
const walkView = document.getElementById("walk-view");

export function showView(name) {
  const walk = name === "walk";
  mapView.hidden = walk;
  walkView.hidden = !walk;
}

showView("map");
