(() => {
  const config = window.vectormapExampleConfig || {};
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

  const resolveConfig = (overrides = {}) => ({
    ...defaults,
    ...config,
    ...overrides
  });

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

  const applyControls = (map, controls = {}) => {
    const resolved = {
      navigation: true,
      fullscreen: false,
      scale: false,
      ...controls
    };

    if (resolved.navigation) {
      map.addControl(new maplibregl.NavigationControl(), "top-right");
    }
    if (resolved.fullscreen && maplibregl.FullscreenControl) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }
    if (resolved.scale) {
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    }
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
      pitchWithRotate: options.pitchWithRotate ?? resolved.pitchWithRotate
    });

    applyControls(map, options.controls || resolved.controls);
    return map;
  };

  baseMap.loadCss = loadCss;
  baseMap.loadScript = loadScript;
  baseMap.ensureLibraries = ensureLibraries;
  baseMap.ensureProtocol = ensureProtocol;
  baseMap.loadStyle = loadStyle;
  baseMap.createMap = createMap;
  baseMap.sanitizeStyle = sanitizeStyle;

  if (config.autoInit !== false) {
    createMap({
      controls: { navigation: true, fullscreen: true, scale: false }
    }).then((map) => {
      if (map) {
        moduleState.map = map;
      }
    });
  }
})();
