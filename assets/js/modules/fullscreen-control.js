(() => {
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.fullscreenControlRegistered) {
    return;
  }
  moduleState.fullscreenControlRegistered = true;

  baseMap.registerControl({
    key: "fullscreen",
    position: "top-right",
    create: (map) => {
      if (!window.maplibregl || !maplibregl.FullscreenControl) {
        return null;
      }
      const options = {};
      const containerOverride = map.__vectormapControlOptions?.fullscreen?.container;
      if (containerOverride) {
        options.container = containerOverride;
      }
      return new maplibregl.FullscreenControl(options);
    }
  });
})();
