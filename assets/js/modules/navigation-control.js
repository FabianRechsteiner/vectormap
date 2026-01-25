(() => {
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.navigationControlRegistered) {
    return;
  }
  moduleState.navigationControlRegistered = true;

  baseMap.registerControl({
    key: "navigation",
    position: "top-right",
    create: () => {
      if (!window.maplibregl || !maplibregl.NavigationControl) {
        return null;
      }
      return new maplibregl.NavigationControl();
    }
  });
})();
