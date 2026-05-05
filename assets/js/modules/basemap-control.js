(() => {
  const config = window.vectormapBasemapControlConfig || {};
  const compareConfig = window.vectormapCompareConfig || {};
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.basemapControlRegistered) {
    return;
  }
  moduleState.basemapControlRegistered = true;

  const defaults = {
    libraryUrl: "https://vectormap.ch/vector-tiles-basemaps/dist/index.js",
    cssUrl: "https://vectormap.ch/vector-tiles-basemaps/dist/style.css",
    position: "bottom-left",
    label: "Basemap waehlen",
    groupBy: "provider",
    mapContainerIds: ["map"],
    normalMapContainerIds: ["normalMap"],
    rightMapContainerIds: ["after", "cmpMapRight"],
    basemapIds: [
      "vectormap.light",
      "swisstopo.light",
      "swisstopo.basemap",
      "swisstopo.imagery",
      "openfreemap.liberty",
      "openfreemap.positron",
      "openfreemap.dark"
    ],
    applyOptions: {
      preserveView: true,
      repositionIfOutsideCoverage: true
    }
  };

  const settings = {
    ...defaults,
    ...config,
    applyOptions: {
      ...defaults.applyOptions,
      ...(config.applyOptions || {})
    }
  };

  const normalizeStringArray = (value, fallback = []) => {
    const values = Array.isArray(value) ? value : [value];
    const normalized = values
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return normalized.length ? normalized : fallback;
  };

  const compareRoot = document.getElementById(
    compareConfig.containerId || "compare-root"
  );
  const mapContainerIds = new Set(
    normalizeStringArray(settings.mapContainerIds, defaults.mapContainerIds)
  );
  const normalMapContainerIds = new Set(
    normalizeStringArray(
      settings.normalMapContainerIds,
      defaults.normalMapContainerIds
    )
  );
  const rightMapContainerIds = new Set(
    normalizeStringArray(
      settings.rightMapContainerIds,
      defaults.rightMapContainerIds
    )
  );
  const basemapIds = normalizeStringArray(settings.basemapIds, defaults.basemapIds);
  let activeDefaultBasemapId =
    settings.initialBasemapId ||
    compareRoot?.dataset.basemapId ||
    "vectormap.light";
  let activeNormalBasemapId =
    settings.initialNormalBasemapId ||
    compareConfig.initialNormalBasemapId ||
    compareRoot?.dataset.leftBasemapId ||
    "vectormap.light";
  let activeRightBasemapId =
    settings.initialRightBasemapId ||
    compareConfig.initialRightBasemapId ||
    compareRoot?.dataset.rightBasemapId ||
    "swisstopo.light";
  let syncSequence = 0;

  const controlsByMap = new WeakMap();

  const getContainerId = (map) => map?.getContainer?.()?.id || "";
  const isDefaultMap = (map) => mapContainerIds.has(getContainerId(map));
  const isNormalCompareMap = (map) =>
    normalMapContainerIds.has(getContainerId(map));
  const isRightCompareMap = (map) => rightMapContainerIds.has(getContainerId(map));
  const isControlledMap = (map) =>
    isDefaultMap(map) || isNormalCompareMap(map) || isRightCompareMap(map);
  const getRightCompareMaps = () =>
    (Array.isArray(moduleState.maps) ? moduleState.maps : [])
      .filter(isRightCompareMap);

  const reportError = (event) => {
    settings.applyOptions?.onBasemapError?.(event);
    config.onBasemapError?.(event);
    console.error("Basemap konnte nicht geladen werden.", event.error);
  };

  const buildApplyOptions = (previousBasemapId) => ({
    ...settings.applyOptions,
    previousBasemapId,
    onBasemapError: reportError
  });

  const syncRightBasemaps = async (
    sourceMap,
    basemapId,
    previousBasemapId,
    api
  ) => {
    const sequence = ++syncSequence;
    const targets = getRightCompareMaps().filter((map) => map !== sourceMap);

    await Promise.all(
      targets.map(async (targetMap) => {
        try {
          await api.applyBasemap(
            targetMap,
            basemapId,
            buildApplyOptions(previousBasemapId)
          );
          if (sequence !== syncSequence) {
            return;
          }
          controlsByMap.get(targetMap)?.setActiveBasemap?.(basemapId);
        } catch (error) {
          if (error?.name !== "AbortError") {
            reportError({ map: targetMap, basemapId, error });
          }
        }
      })
    );
  };

  const createSyncedControl = (map, api) => {
    const isRightMap = isRightCompareMap(map);
    const isNormalMap = isNormalCompareMap(map);
    const initialBasemapId = isRightMap
      ? activeRightBasemapId
      : isNormalMap
        ? activeNormalBasemapId
        : activeDefaultBasemapId;
    const control = api.createBasemapControl({
      basemapIds,
      initialBasemapId,
      groupBy: settings.groupBy,
      label: settings.label,
      position: settings.position,
      applyOptions: buildApplyOptions(initialBasemapId),
      onBasemapChange(event) {
        const nextBasemapId = event.basemap.id;
        controlsByMap.get(map)?.setActiveBasemap?.(nextBasemapId);

        if (isRightMap) {
          const previousBasemapId = activeRightBasemapId;
          activeRightBasemapId = nextBasemapId;
          void syncRightBasemaps(map, nextBasemapId, previousBasemapId, api);
        } else if (isNormalMap) {
          activeNormalBasemapId = nextBasemapId;
        } else {
          activeDefaultBasemapId = nextBasemapId;
        }

        config.onBasemapChange?.(event);
      }
    });

    controlsByMap.set(map, control);
    return control;
  };

  const init = async () => {
    if (settings.cssUrl) {
      baseMap.loadCss(settings.cssUrl);
    }

    let api;
    try {
      api = await import(settings.libraryUrl);
    } catch (error) {
      console.error("Basemap-Control konnte nicht geladen werden.", error);
      return;
    }

    baseMap.registerControl({
      key: "basemap",
      position: settings.position,
      applyTo: isControlledMap,
      create: (map) => createSyncedControl(map, api)
    });
  };

  void init();
})();
