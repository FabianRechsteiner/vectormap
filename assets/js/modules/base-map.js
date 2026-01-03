(() => {
  const config = window.vectormapExampleConfig || {};
  const container = config.container || "map";

  if (!window.maplibregl) {
    console.error("MapLibre GL JS is missing.");
    return;
  }

  if (!window.pmtiles) {
    console.error("PMTiles is missing.");
    return;
  }

  if (!maplibregl.__pmtilesProtocolAdded) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    maplibregl.__pmtilesProtocolAdded = true;
  }

  const map = new maplibregl.Map({
    container,
    style: config.style || "../styles/ch.vectormap.lightbasemap.json",
    center: config.center || [8.7241, 47.4987],
    zoom: config.zoom ?? 15,
    bearing: config.bearing ?? 0,
    pitch: config.pitch ?? 0
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  window.vectormapModules = window.vectormapModules || {};
  window.vectormapModules.map = map;
})();
