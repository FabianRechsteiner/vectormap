(() => {
  const config = window.vectormapCompareConfig || {};
  const moduleState = window.vectormapModules || {};
  moduleState.searchState = moduleState.searchState || { query: "" };
  const baseMap = moduleState.baseMap;

  if (!baseMap) {
    console.error("Base map module fehlt.");
    return;
  }

  const rootId = config.containerId || "compare-root";
  const modeOrder = ["normal", "split", "compare"];
  let controlsLeft = {
    navigation: false,
    geolocate: false,
    scale: false,
    fullscreen: false,
    basemap: false,
    search: false,
    share: false
  };
  let controlsInteractive = {
    navigation: true,
    geolocate: true,
    scale: false,
    fullscreen: true,
    basemap: true,
    search: true,
    share: true
  };

  let rootEl = null;
  let currentMode = "split";
  let initialMode = "split";
  let modeLabels = {
    normal: "Switch to Normal mode",
    split: "Switch to Split mode",
    compare: "Switch to Compare mode"
  };
  let normalMap = null;
  let beforeMap = null;
  let afterMap = null;
  let cmpLeft = null;
  let cmpRight = null;
  let splitCompare = null;
  const toggleButtons = [];
  const geolocateMirrorState = new WeakMap();
  let stateEnabled = true;
  let splitSyncRafId = 0;
  let splitDragActive = false;

  const normalizeMode = (value, fallback = "split") =>
    modeOrder.includes(value) ? value : fallback;

  const getNextMode = (mode) => {
    const currentIndex = modeOrder.indexOf(normalizeMode(mode));
    return modeOrder[(currentIndex + 1) % modeOrder.length];
  };

  const getModeMaps = (mode) => {
    switch (mode) {
      case "normal":
        return [normalMap].filter(Boolean);
      case "compare":
        return [cmpLeft, cmpRight].filter(Boolean);
      case "split":
      default:
        return [beforeMap, afterMap].filter(Boolean);
    }
  };

  const getActiveMap = (mode = currentMode) => {
    switch (mode) {
      case "normal":
        return normalMap;
      case "compare":
        return cmpRight || cmpLeft;
      case "split":
      default:
        return afterMap || beforeMap;
    }
  };

  const getCamera = (map) => {
    if (!map) {
      return null;
    }
    return {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch()
    };
  };

  const parseControlState = (visibleControls = []) => {
    const nextLeft = { ...controlsLeft };
    const nextInteractive = { ...controlsInteractive };
    const valid = new Set(
      (Array.isArray(visibleControls) ? visibleControls : [])
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    if (!valid.size) {
      return;
    }
    Object.keys(nextInteractive).forEach((key) => {
      nextInteractive[key] = valid.has(key);
    });
    Object.keys(nextLeft).forEach((key) => {
      nextLeft[key] = false;
    });
    controlsLeft = nextLeft;
    controlsInteractive = nextInteractive;
  };

  const getVisibleControls = () =>
    Object.keys(controlsInteractive).filter((key) => controlsInteractive[key]);

  const updateUrlState = () => {
    if (!stateEnabled || !moduleState.urlState) {
      return;
    }
    const activeMap = getActiveMap();
    const camera = moduleState.urlState.cameraFromMap(activeMap);
    const basemapId = moduleState.basemapState?.getActiveBasemapId?.() || null;
    moduleState.urlState.replaceUrl({
      camera,
      basemapId,
      visibleControls: getVisibleControls(),
      mode: currentMode,
      searchQuery: moduleState.searchState?.query || null,
      overlayIds: moduleState.ogcState?.serializeOverlayIds?.() || []
    });
  };

  const centerSplitSlider = () => {
    if (!splitCompare || typeof splitCompare.setSlider !== "function") {
      return;
    }
    const container = document.getElementById("splitContainer");
    const bounds = container?.getBoundingClientRect?.();
    if (!bounds || !Number.isFinite(bounds.width) || bounds.width <= 0) {
      return;
    }
    splitCompare.setSlider(bounds.width / 2);
    updateSplitPositionVariable();
  };

  const updateSplitPositionVariable = () => {
    if (!rootEl || !splitCompare) {
      return;
    }
    const position = Number(splitCompare.currentPosition);
    if (Number.isFinite(position)) {
      rootEl.style.setProperty("--vectormap-split-position", `${position}px`);
    }
  };

  const scheduleSplitPositionSync = () => {
    if (splitSyncRafId || !window.requestAnimationFrame) {
      return;
    }
    splitSyncRafId = window.requestAnimationFrame(() => {
      splitSyncRafId = 0;
      updateSplitPositionVariable();
    });
  };

  const bindSplitPositionVariable = () => {
    updateSplitPositionVariable();
  };

  const canActivateMode = (mode) => getModeMaps(mode).length > 0;

  const updateToggleButtons = () => {
    const nextMode = getNextMode(currentMode);
    const label = modeLabels[nextMode] || modeLabels.split;
    const classes = ["is-normal", "is-split", "is-compare"];

    toggleButtons.forEach((button) => {
      button.classList.remove(...classes);
      button.classList.add(`is-${nextMode}`);
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  };

  const applyMode = (mode, { preserveCamera = true } = {}) => {
    if (!rootEl) {
      return;
    }

    const nextMode = normalizeMode(mode, initialMode);
    if (!canActivateMode(nextMode)) {
      return;
    }

    const camera = preserveCamera ? getCamera(getActiveMap()) : null;
    currentMode = nextMode;
    rootEl.dataset.mode = currentMode;
    updateToggleButtons();

    getModeMaps(currentMode).forEach((map) => {
      if (camera) {
        map.jumpTo(camera);
      }
      map.resize();
    });

    if (currentMode === "split") {
      centerSplitSlider();
    }
    updateUrlState();
  };

  const toggleMode = () => {
    applyMode(getNextMode(currentMode));
  };

  moduleState.compareState = moduleState.compareState || {};
  moduleState.compareState.getMode = () => currentMode;
  moduleState.compareState.getActiveMap = () => getActiveMap();

  const toLngLat = (position) => {
    const coords = position?.coords || position;
    const lng = Number(coords?.longitude);
    const lat = Number(coords?.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    return [lng, lat];
  };

  const getGeolocateMirror = (map) => {
    if (!map || !window.maplibregl?.Marker) {
      return null;
    }
    let state = geolocateMirrorState.get(map);
    if (state) {
      return state;
    }

    const dotElement = document.createElement("div");
    dotElement.className = "maplibregl-user-location-dot";
    const circleElement = document.createElement("div");
    circleElement.className = "maplibregl-user-location-accuracy-circle";

    state = {
      dotElement,
      circleElement,
      dotMarker: new maplibregl.Marker({ element: dotElement }),
      circleMarker: new maplibregl.Marker({
        element: circleElement,
        pitchAlignment: "map"
      }),
      accuracy: null,
      updateCircle() {
        const userLocation = state.dotMarker.getLngLat();
        if (!Number.isFinite(state.accuracy) || !userLocation) {
          return;
        }
        const screenPosition = map.project(userLocation);
        const userLocationWith100Px = map.unproject([
          screenPosition.x + 100,
          screenPosition.y
        ]);
        const pixelsToMeters = userLocation.distanceTo(userLocationWith100Px) / 100;
        if (!Number.isFinite(pixelsToMeters) || pixelsToMeters <= 0) {
          return;
        }
        const circleDiameter = (2 * state.accuracy) / pixelsToMeters;
        state.circleElement.style.width = `${circleDiameter.toFixed(2)}px`;
        state.circleElement.style.height = `${circleDiameter.toFixed(2)}px`;
      }
    };

    map.on("zoom", state.updateCircle);
    map.on("move", state.updateCircle);
    map.on("rotate", state.updateCircle);
    map.on("pitch", state.updateCircle);
    geolocateMirrorState.set(map, state);
    return state;
  };

  const clearGeolocateMirror = (map) => {
    const state = geolocateMirrorState.get(map);
    if (!state) {
      return;
    }
    state.dotMarker.remove();
    state.circleMarker.remove();
    state.accuracy = null;
  };

  const mirrorGeolocation = (targetMap, position) => {
    const center = toLngLat(position);
    if (!targetMap || !center) {
      return;
    }
    const state = getGeolocateMirror(targetMap);
    if (!state) {
      return;
    }
    const accuracy = Number(position?.coords?.accuracy);
    state.dotMarker.setLngLat(center).addTo(targetMap);
    state.circleMarker.setLngLat(center).addTo(targetMap);
    state.accuracy = Number.isFinite(accuracy) ? accuracy : null;
    state.updateCircle();
  };

  const registerGeolocateMirrors = (sourceMap, targetMaps) => {
    const control = sourceMap?.__vectormapGeolocateControl;
    const targets = (Array.isArray(targetMaps) ? targetMaps : [])
      .filter((map) => map && map !== sourceMap);

    if (!control || typeof control.on !== "function" || !targets.length) {
      return;
    }

    control.on("geolocate", (event) => {
      targets.forEach((targetMap) => mirrorGeolocation(targetMap, event));
    });
    control.on("outofmaxbounds", () => {
      targets.forEach((targetMap) => clearGeolocateMirror(targetMap));
    });
  };

  const createToggleControl = () => ({
    onAdd() {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "maplibregl-ctrl-icon vectormap-compare-toggle";
      button.addEventListener("click", toggleMode);
      container.appendChild(button);
      toggleButtons.push(button);
      updateToggleButtons();
      return container;
    },
    onRemove() {}
  });

  const registerCompareControl = () => {
    if (typeof baseMap.registerControl !== "function") {
      console.error("Control registry fehlt.");
      return;
    }
    if (moduleState.compareControlRegistered) {
      return;
    }
    moduleState.compareControlRegistered = true;
    baseMap.registerControl({
      key: "compare-toggle",
      position: "top-right",
      applyTo: (map) => {
        const container = map.getContainer();
        return (
          container &&
          ["normalMap", "after", "cmpMapRight"].includes(container.id)
        );
      },
      create: () => createToggleControl()
    });
  };

  registerCompareControl();

  const ensureLayout = () => {
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement("div");
      root.id = rootId;
      document.body.appendChild(root);
    }

    root.innerHTML = `
      <div id="normalContainer" class="mode-container">
        <div id="normalMap"></div>
      </div>
      <div id="splitContainer" class="mode-container">
        <div id="before"></div>
        <div id="after"></div>
      </div>
      <div id="cmpContainer" class="mode-container">
        <div id="cmpMapLeft"></div>
        <div id="cmpMapRight"></div>
      </div>
    `;
  };

  const ensureStyles = () => {
    if (document.getElementById("vectormap-compare-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "vectormap-compare-style";
    style.textContent = `
      html, body { height: 100%; margin: 0; overflow: hidden; }
      #${rootId} { position: absolute; inset: 0; }
      .mode-container { position: absolute; inset: 0; display: none; }
      #normalMap,
      #before,
      #after,
      #cmpMapLeft,
      #cmpMapRight { position: absolute; top: 0; bottom: 0; }
      #normalMap { left: 0; right: 0; }
      #before, #after { width: 100%; }
      #cmpMapLeft, #cmpMapRight { width: 50%; }
      #cmpMapLeft { left: 0; }
      #cmpMapRight { right: 0; }
      #${rootId}[data-mode="normal"] #normalContainer,
      #${rootId}[data-mode="split"] #splitContainer,
      #${rootId}[data-mode="compare"] #cmpContainer {
        display: block;
      }
      #after .maplibregl-ctrl-bottom-left {
        left: var(--vectormap-split-position, 50%);
      }
      /* Keep the shared control rail visually bound to the interactive maps only. */
      #before .maplibregl-ctrl-top-left,
      #before .maplibregl-ctrl-top-right,
      #cmpMapLeft .maplibregl-ctrl-top-left,
      #cmpMapLeft .maplibregl-ctrl-top-right {
        display: none;
      }
      .vectormap-compare-toggle {
        background-repeat: no-repeat;
        background-position: center;
        background-size: 16px 16px;
      }
      .vectormap-compare-toggle.is-normal {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6'><rect x='3' y='3' width='14' height='14' rx='1.8'/></svg>");
      }
      .vectormap-compare-toggle.is-split {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><line x1='10' y1='3' x2='10' y2='17'/><polyline points='6,7 3,10 6,13'/><polyline points='14,7 17,10 14,13'/></svg>");
      }
      .vectormap-compare-toggle.is-compare {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6'><rect x='2' y='3' width='7' height='14' rx='1.5'/><rect x='11' y='3' width='7' height='14' rx='1.5'/></svg>");
      }
    `;
    document.head.appendChild(style);
  };

  const init = async () => {
    ensureLayout();
    ensureStyles();
    rootEl = document.getElementById(rootId);
    if (!rootEl) {
      return;
    }
    rootEl.style.userSelect = "none";
    const data = rootEl.dataset;

    const readValue = (key, fallback) =>
      config[key] !== undefined ? config[key] : data[key] ?? fallback;
    const parseNumber = (value, fallback) => {
      if (value === undefined || value === null || value === "") {
        return fallback;
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const parseBoolean = (value, fallback) => {
      if (value === undefined || value === null || value === "") {
        return fallback;
      }
      if (value === true || value === false) {
        return value;
      }
      return value === "true";
    };
    const parseCenter = (value, fallback) => {
      if (!value) {
        return fallback;
      }
      const parts = value.split(",").map((item) => Number(item.trim()));
      if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) {
        return fallback;
      }
      return [parts[0], parts[1]];
    };

    const compareCss = readValue(
      "compareCss",
      "../assets/css/maplibre-gl-compare.css"
    );
    const compareJs = readValue(
      "compareJs",
      "../assets/js/maplibre-gl-compare.js"
    );
    const styleLeft = readValue(
      "styleLeft",
      "../styles/ch.vectormap.lightbasemap.json"
    );
    const styleRight = readValue(
      "styleRight",
      "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"
    );

    modeLabels = {
      normal: readValue("labelNormal", "Switch to Normal mode"),
      split: readValue("labelSplit", "Switch to Split mode"),
      compare: readValue("labelCompare", "Switch to Compare mode")
    };
    initialMode = normalizeMode(readValue("initialMode", "split"));
    currentMode = initialMode;
    rootEl.dataset.mode = currentMode;

    const view = {
      center: config.center || parseCenter(data.center, [8.7241, 47.4987]),
      zoom: parseNumber(readValue("zoom"), 17),
      bearing: parseNumber(readValue("bearing"), 0),
      pitch: parseNumber(readValue("pitch"), 0),
      hash: false,
      pitchWithRotate: parseBoolean(readValue("pitchWithRotate"), true)
    };
    stateEnabled = parseBoolean(readValue("hash"), true);
    if (stateEnabled && moduleState.urlState) {
      const parsedState = moduleState.urlState.parse(window.location.search);
      if (parsedState.camera) {
        Object.assign(view, parsedState.camera);
      }
      if (parsedState.mode) {
        initialMode = normalizeMode(parsedState.mode, initialMode);
      }
      if (parsedState.basemapId) {
        moduleState.basemapState?.setActiveBasemapId?.(parsedState.basemapId);
      }
      if (parsedState.searchQuery) {
        moduleState.searchState.query = parsedState.searchQuery;
      }
      parseControlState(parsedState.visibleControls);
    }

    try {
      await baseMap.ensureLibraries(config);
    } catch (error) {
      console.error(error);
      return;
    }

    const asArray = (value) => (Array.isArray(value) ? value : [value]);
    asArray(compareCss).forEach((href) => baseMap.loadCss(href));
    let loaded = false;
    for (const src of asArray(compareJs)) {
      try {
        await baseMap.loadScript(src);
        loaded = true;
        break;
      } catch (error) {
        console.warn(error);
      }
    }
    if (!loaded) {
      console.error("MapLibre Compare konnte nicht geladen werden.");
      return;
    }

    if (!window.maplibregl || !maplibregl.Compare) {
      console.error("MapLibre Compare konnte nicht geladen werden.");
      return;
    }

    normalMap = await baseMap.createMap({
      container: "normalMap",
      styleUrl: styleLeft,
      attributionControl: false,
      controls: controlsInteractive,
      fullscreenContainer: rootEl,
      ...view
    });
    beforeMap = await baseMap.createMap({
      container: "before",
      styleUrl: styleLeft,
      attributionControl: false,
      controls: controlsLeft,
      ...view
    });
    afterMap = await baseMap.createMap({
      container: "after",
      styleUrl: styleRight,
      attributionControl: false,
      controls: controlsInteractive,
      fullscreenContainer: rootEl,
      ...view
    });

    if (!normalMap || !beforeMap || !afterMap) {
      return;
    }

    normalMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );
    beforeMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );
    afterMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    splitCompare = new maplibregl.Compare(
      beforeMap,
      afterMap,
      "#splitContainer"
    );
    bindSplitPositionVariable();
    splitCompare.on("slideend", updateSplitPositionVariable);

    const stopDragging = () => {
      splitDragActive = false;
      updateSplitPositionVariable();
    };

    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchend", stopDragging);
    document.addEventListener("touchcancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    rootEl.addEventListener("mousedown", () => {
      splitDragActive = true;
    });
    rootEl.addEventListener("touchstart", () => {
      splitDragActive = true;
    });
    rootEl.addEventListener("mousemove", () => {
      if (splitDragActive) {
        scheduleSplitPositionSync();
      }
    });
    rootEl.addEventListener("touchmove", () => {
      if (splitDragActive) {
        scheduleSplitPositionSync();
      }
    });
    rootEl.addEventListener("selectstart", (event) => {
      if (splitDragActive) {
        event.preventDefault();
      }
    });
    window.addEventListener("resize", () => {
      if (currentMode === "split") {
        centerSplitSlider();
      }
    });

    cmpLeft = await baseMap.createMap({
      container: "cmpMapLeft",
      styleUrl: styleLeft,
      attributionControl: false,
      controls: controlsLeft,
      ...view
    });
    cmpRight = await baseMap.createMap({
      container: "cmpMapRight",
      styleUrl: styleRight,
      attributionControl: false,
      controls: controlsInteractive,
      fullscreenContainer: rootEl,
      ...view
    });

    if (!cmpLeft || !cmpRight) {
      return;
    }

    cmpLeft.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );
    cmpRight.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    let syncing = false;
    const sync = (src, target) => {
      if (syncing || !src || !target) {
        return;
      }
      syncing = true;
      target.jumpTo({
        center: src.getCenter(),
        zoom: src.getZoom(),
        bearing: src.getBearing(),
        pitch: src.getPitch()
      });
      syncing = false;
    };

    cmpLeft.on("move", () => sync(cmpLeft, cmpRight));
    cmpRight.on("move", () => sync(cmpRight, cmpLeft));

    const allMaps = [normalMap, beforeMap, afterMap, cmpLeft, cmpRight];
    [normalMap, afterMap, cmpRight].forEach((sourceMap) => {
      registerGeolocateMirrors(
        sourceMap,
        allMaps.filter((map) => map !== sourceMap)
      );
    });
    [normalMap, afterMap, cmpRight].forEach((map) => {
      map.on("moveend", () => {
        if (map === getActiveMap()) {
          updateUrlState();
        }
      });
    });
    window.addEventListener("vectormap:basemap-change", () => {
      updateUrlState();
    });
    window.addEventListener("vectormap:search-change", () => {
      updateUrlState();
    });
    window.addEventListener("vectormap:ogc-overlays-change", () => {
      updateUrlState();
    });

    applyMode(initialMode, { preserveCamera: false });
    updateUrlState();
    updateToggleButtons();
    window.dispatchEvent(
      new CustomEvent("vectormap:maps-ready", {
        detail: {
          maps: allMaps.map((m) => m?.getContainer?.()?.id).filter(Boolean)
        }
      })
    );
  };

  init();
})();
