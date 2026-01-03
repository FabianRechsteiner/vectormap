(() => {
  const config = window.vectormapExampleConfig || {};
  const container = config.container || "map";
  const styleUrl = config.style || "../styles/ch.vectormap.lightbasemap.json";
  const maplibreCss =
    config.maplibreCss ||
    "https://unpkg.com/maplibre-gl@5.14.0/dist/maplibre-gl.css";
  const maplibreJs =
    config.maplibreJs ||
    "https://unpkg.com/maplibre-gl@5.14.0/dist/maplibre-gl.js";
  const pmtilesJs =
    config.pmtilesJs || "https://unpkg.com/pmtiles@4.3.0/dist/pmtiles.js";

  const loadCss = (href) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  const loadScript = (src) =>
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
    });

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

  const ensureLibraries = async () => {
    loadCss(maplibreCss);

    const tasks = [];
    if (!window.maplibregl) {
      tasks.push(loadScript(maplibreJs));
    }
    if (!window.pmtiles) {
      tasks.push(loadScript(pmtilesJs));
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  };

  const initMap = async () => {
    try {
      await ensureLibraries();
    } catch (error) {
      console.error(error);
      return;
    }

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

    let style;
    try {
      const resolvedStyleUrl = new URL(styleUrl, window.location.href);
      const response = await fetch(resolvedStyleUrl.toString());
      style = sanitizeStyle(await response.json());
    } catch (error) {
      console.error("Style konnte nicht geladen werden.", error);
      return;
    }

    const map = new maplibregl.Map({
      container,
      style,
      center: config.center || [8.7241, 47.4987],
      zoom: config.zoom ?? 15,
      bearing: config.bearing ?? 0,
      pitch: config.pitch ?? 0
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    if (maplibregl.FullscreenControl) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }

    window.vectormapModules.map = map;
  };

  initMap();
})();
