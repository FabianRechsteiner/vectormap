(() => {
  const config = window.vectormapExampleConfig || {};
  const defaultControls = {
    navigation: true,
    fullscreen: true,
    scale: false
  };
  const defaults = {
    container: "map",
    styleUrl: "../styles/ch.vectormap.lightbasemap.json",
    center: [8.7241, 47.4987],
    zoom: 15,
    bearing: 0,
    pitch: 0,
    attributionControl: true,
    maplibreCss: "https://unpkg.com/maplibre-gl@5.14.0/dist/maplibre-gl.css",
    maplibreJs: "https://unpkg.com/maplibre-gl@5.14.0/dist/maplibre-gl.js",
    pmtilesJs: "https://unpkg.com/pmtiles@4.3.0/dist/pmtiles.js"
  };

  window.vectormapModules = window.vectormapModules || {};
  const moduleState = window.vectormapModules;
  const baseMap = moduleState.baseMap || {};
  moduleState.baseMap = baseMap;
  moduleState.controlQueue = moduleState.controlQueue || [];
  moduleState.controlCounter = moduleState.controlCounter || 0;
  moduleState.maps = moduleState.maps || [];

  const resolveConfig = (overrides = {}) => ({
    ...defaults,
    ...config,
    ...overrides
  });

  const resolveControls = (overrides = {}) => ({
    ...defaultControls,
    ...(config.controls || {}),
    ...(overrides || {})
  });

  const resolveControlOptions = (overrides = {}) => {
    const merged = { ...(config.controlOptions || {}), ...(overrides || {}) };
    if (config.controlOptions?.fullscreen || overrides?.fullscreen) {
      merged.fullscreen = {
        ...(config.controlOptions?.fullscreen || {}),
        ...(overrides?.fullscreen || {})
      };
    }
    return merged;
  };

  const ensureMapControlState = (map) => {
    if (!map.__vectormapControlIds) {
      map.__vectormapControlIds = new Set();
    }
  };

  const shouldApplyControl = (map, entry) => {
    if (typeof entry.applyTo === "function" && !entry.applyTo(map)) {
      return false;
    }
    if (entry.key && map.__vectormapControlConfig) {
      if (
        Object.prototype.hasOwnProperty.call(
          map.__vectormapControlConfig,
          entry.key
        )
      ) {
        return Boolean(map.__vectormapControlConfig[entry.key]);
      }
    }
    return true;
  };

  const addControlToMap = (map, entry) => {
    ensureMapControlState(map);
    if (map.__vectormapControlIds.has(entry.id)) {
      return;
    }
    if (!shouldApplyControl(map, entry)) {
      return;
    }
    const control = entry.create ? entry.create(map) : null;
    if (!control) {
      return;
    }
    map.addControl(control, entry.position || "top-right");
    map.__vectormapControlIds.add(entry.id);
  };

  const applyControlQueue = (map) => {
    moduleState.controlQueue.forEach((entry) => addControlToMap(map, entry));
  };

  const registerControl = (entry = {}) => {
    if (typeof entry.create !== "function") {
      console.error("Control registration requires a create() function.");
      return null;
    }
    const id =
      entry.id || `${entry.key || "control"}-${moduleState.controlCounter++}`;
    const normalized = {
      id,
      key: entry.key,
      position: entry.position || "top-right",
      create: entry.create,
      applyTo: entry.applyTo
    };
    moduleState.controlQueue.push(normalized);
    moduleState.maps.forEach((map) => addControlToMap(map, normalized));
    return id;
  };

  const loadCss =
    baseMap.loadCss ||
    ((href) => {
      if (document.querySelector(`link[href="${href}"]`)) {
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });

  const loadScript =
    baseMap.loadScript ||
    ((src) =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () =>
          reject(new Error(`Script konnte nicht geladen werden: ${src}`));
        document.head.appendChild(script);
      }));

  const hasDataExpression = (value) => {
    if (!Array.isArray(value)) {
      return false;
    }

    const op = value[0];
    if (typeof op === "string") {
      if (op === "literal" || op === "zoom") {
        return false;
      }
      if (
        [
          "get",
          "has",
          "in",
          "match",
          "case",
          "coalesce",
          "feature-state",
          "properties",
          "geometry-type",
          "id"
        ].includes(op)
      ) {
        return true;
      }
    }

    return value.some(hasDataExpression);
  };

  const sanitizeStyle = (style) => {
    if (!style || !Array.isArray(style.layers)) {
      return style;
    }

    style.layers.forEach((layer) => {
      if (!layer.paint || !layer.paint["line-dasharray"]) {
        return;
      }

      if (hasDataExpression(layer.paint["line-dasharray"])) {
        delete layer.paint["line-dasharray"];
      }
    });

    return style;
  };

  const ensureLibraries = async (overrides) => {
    const resolved = resolveConfig(overrides);
    loadCss(resolved.maplibreCss);
    const tasks = [];
    if (!window.maplibregl) {
      tasks.push(loadScript(resolved.maplibreJs));
    }
    if (!window.pmtiles) {
      tasks.push(loadScript(resolved.pmtilesJs));
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  };

  const ensureProtocol = () => {
    if (!window.maplibregl || !window.pmtiles) {
      return;
    }

    if (!moduleState.pmtilesProtocol) {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      moduleState.pmtilesProtocol = protocol;
    }
  };

  const loadStyle = async (styleUrl) => {
    let style;
    try {
      const resolvedStyleUrl = new URL(styleUrl, window.location.href);
      const response = await fetch(resolvedStyleUrl.toString());
      style = sanitizeStyle(await response.json());
    } catch (error) {
      console.error("Style konnte nicht geladen werden.", error);
      return null;
    }
    return style;
  };

  const registerMapInstance = (map, controlConfig, controlOptions) => {
    map.__vectormapControlConfig = controlConfig;
    map.__vectormapControlOptions = controlOptions;
    if (!moduleState.maps.includes(map)) {
      moduleState.maps.push(map);
    }
    applyControlQueue(map);
  };

  const registerMap = (map, options = {}) => {
    if (!map) {
      return null;
    }
    const controlConfig = resolveControls(options.controls);
    const controlOptions = resolveControlOptions(options.controlOptions);
    if (options.fullscreenContainer) {
      controlOptions.fullscreen = {
        ...(controlOptions.fullscreen || {}),
        container: options.fullscreenContainer
      };
    }
    registerMapInstance(map, controlConfig, controlOptions);
    return map;
  };

  const createMap = async (options = {}) => {
    const resolved = resolveConfig(options);
    const container = options.container || resolved.container;
    const containerEl =
      typeof container === "string" ? document.getElementById(container) : container;
    if (!containerEl) {
      console.error(`Container nicht gefunden: ${container}`);
      return null;
    }

    try {
      await ensureLibraries(options);
    } catch (error) {
      console.error(error);
      return null;
    }

    if (!window.maplibregl) {
      console.error("MapLibre GL JS is missing.");
      return null;
    }

    if (!window.pmtiles) {
      console.error("PMTiles is missing.");
      return null;
    }

    ensureProtocol();

    let style = options.style;
    if (!style) {
      style = await loadStyle(options.styleUrl || resolved.styleUrl);
    }
    if (!style) {
      return null;
    }

    const map = new maplibregl.Map({
      container: containerEl,
      style,
      center: options.center || resolved.center,
      zoom: options.zoom ?? resolved.zoom,
      bearing: options.bearing ?? resolved.bearing,
      pitch: options.pitch ?? resolved.pitch,
      attributionControl:
        options.attributionControl ?? resolved.attributionControl,
      hash: options.hash ?? resolved.hash,
      pitchWithRotate: options.pitchWithRotate ?? resolved.pitchWithRotate,
      minZoom: options.minZoom ?? resolved.minZoom,
      maxZoom: options.maxZoom ?? resolved.maxZoom,
      maxBounds: options.maxBounds ?? resolved.maxBounds
    });

    registerMap(map, options);
    return map;
  };

  baseMap.loadCss = loadCss;
  baseMap.loadScript = loadScript;
  baseMap.ensureLibraries = ensureLibraries;
  baseMap.ensureProtocol = ensureProtocol;
  baseMap.loadStyle = loadStyle;
  baseMap.createMap = createMap;
  baseMap.sanitizeStyle = sanitizeStyle;
  baseMap.registerControl = registerControl;
  baseMap.applyControlQueue = applyControlQueue;
  baseMap.registerMap = registerMap;

  if (config.autoInit !== false) {
    createMap({
      controls: resolveControls()
    }).then((map) => {
      if (map) {
        moduleState.map = map;
      }
    });
  }
})();
