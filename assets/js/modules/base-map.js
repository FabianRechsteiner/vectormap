(() => {
  const config = window.vectormapExampleConfig || {};
  const container = config.container || "map";
  const pmtilesUrl =
    config.pmtilesUrl || "https://vectormap.ch/pmtiles/av/av.pmtiles";

  if (!window.maplibregl) {
    console.error("MapLibre GL JS is missing.");
    return;
  }

  if (!window.pmtiles) {
    console.error("PMTiles is missing.");
    return;
  }

  window.vectormapModules = window.vectormapModules || {};

  if (!window.vectormapModules.pmtilesProtocol) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    window.vectormapModules.pmtilesProtocol = protocol;
  }

  if (!window.vectormapModules.pmtilesArchive) {
    window.vectormapModules.pmtilesArchive = new pmtiles.PMTiles(pmtilesUrl);
    window.vectormapModules.pmtilesProtocol.add(
      window.vectormapModules.pmtilesArchive
    );
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

  window.vectormapModules.map = map;
})();
