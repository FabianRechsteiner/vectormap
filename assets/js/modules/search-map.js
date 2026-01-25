(() => {
  const config = window.vectormapSearchConfig || {};
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  const defaults = {
    mapContainer: "map",
    panelId: "vectormap-search",
    apiUrl: "https://api3.geo.admin.ch/rest/services/ech/SearchServer",
    fallbackApiUrl: "https://api3.geo.admin.ch/rest/services/api/SearchServer",
    lang: "de",
    types: "locations",
    origins: "",
    limit: 8,
    sr: 4326,
    minChars: 3,
    debounceMs: 250,
    resultZoom: 16,
    fitPadding: 60,
    flyDuration: 1200,
    fitDuration: 1200,
    returnGeometry: true,
    geometryFormat: "geojson",
    placeholder: "Adresse oder Ort",
    buttonLabel: "Suche",
    labelText: "Suche",
    idleMessage: "Suchbegriff eingeben.",
    loadingMessage: "Suche laeuft...",
    emptyMessage: "Keine Treffer.",
    errorMessage: "Suche fehlgeschlagen.",
    markerImage: "../assets/images/logo_v.png",
    markerSize: 34,
    markerAnchor: "bottom",
    showMarker: true,
    controls: { navigation: true, fullscreen: true, scale: false }
  };

  const settings = { ...defaults, ...config };
  settings.controls = { ...defaults.controls, ...(config.controls || {}) };
  const mapContainerIds = Array.isArray(settings.mapContainer)
    ? settings.mapContainer
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : typeof settings.mapContainer === "string"
      ? [settings.mapContainer]
      : [];
  const primaryMapContainer = Array.isArray(settings.mapContainer)
    ? mapContainerIds[0] || defaults.mapContainer
    : settings.mapContainer;
  const mapOptions = {
    container: primaryMapContainer,
    controls: settings.controls,
    ...(config.mapOptions || {})
  };

  const matchesMapContainer = (map) => {
    const container = map?.getContainer?.();
    if (!container) {
      return false;
    }
    if (mapContainerIds.length) {
      return mapContainerIds.includes(container.id);
    }
    if (
      settings.mapContainer &&
      typeof settings.mapContainer !== "string" &&
      container === settings.mapContainer
    ) {
      return true;
    }
    return typeof settings.mapContainer === "string"
      ? container.id === settings.mapContainer
      : false;
  };

  const ensureStyles = () => {
    if (document.getElementById("vectormap-search-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "vectormap-search-style";
    style.textContent = `
      .maplibregl-marker {
        position: absolute;
        top: 0;
        left: 0;
        will-change: transform;
      }
      .vectormap-search-ctrl {
        position: relative;
        display: block;
        overflow: visible;
        margin-bottom: 8px;
      }
      .vectormap-search-ctrl .vectormap-search-panel {
        position: absolute;
        top: -1px;
        right: calc(100% + 6px);
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        pointer-events: none;
        z-index: 1;
      }
      .vectormap-search-ctrl.is-open .vectormap-search-panel {
        pointer-events: auto;
      }
      .vectormap-search-input {
        height: 29px;
        width: 0;
        opacity: 0;
        padding: 0;
        border: 0;
        margin: 0;
        border-radius: 4px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
        transition: width 0.24s ease, opacity 0.18s ease;
        pointer-events: none;
        font: 13px/1.2 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: #1b2a23;
        position: relative;
        z-index: 2;
        box-sizing: border-box;
        appearance: none;
        -webkit-appearance: none;
      }
      .vectormap-search-input::-webkit-search-decoration,
      .vectormap-search-input::-webkit-search-cancel-button,
      .vectormap-search-input::-webkit-search-results-button,
      .vectormap-search-input::-webkit-search-results-decoration {
        display: none;
      }
      .vectormap-search-ctrl.is-open .vectormap-search-input {
        width: min(60vw, 220px);
        opacity: 1;
        padding: 0 10px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        pointer-events: auto;
      }
      .vectormap-search-input:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(27, 42, 35, 0.2);
      }
      .vectormap-search-toggle.maplibregl-ctrl-icon {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231f1f1f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='7'/><line x1='20' y1='20' x2='16.5' y2='16.5'/></svg>");
        background-size: 18px 18px;
        background-repeat: no-repeat;
        background-position: center;
      }
      .vectormap-search-dropdown {
        width: min(86vw, 320px);
        background: rgba(255, 255, 255, 0.96);
        border-radius: 10px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        box-shadow: 0 12px 28px rgba(16, 24, 19, 0.16);
        padding: 10px;
        opacity: 0;
        max-height: 0;
        transform: translateY(-4px);
        transition: opacity 0.18s ease, max-height 0.2s ease, transform 0.18s ease;
        pointer-events: none;
        overflow: hidden;
        z-index: 1;
      }
      .vectormap-search-ctrl.is-open .vectormap-search-dropdown {
        opacity: 1;
        max-height: 320px;
        transform: translateY(0);
        pointer-events: auto;
      }
      .vectormap-search-status {
        margin-bottom: 8px;
        font-size: 12px;
        color: #4c5a52;
      }
      .vectormap-search-results {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 6px;
        max-height: 200px;
        overflow: auto;
      }
      .vectormap-search-dropdown .vectormap-search-result {
        width: 100%;
        text-align: left;
        background: #fff;
        border: 1px solid #e0e8e2;
        border-radius: 10px;
        padding: 8px 10px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        height: auto;
        line-height: 1.3;
        font: 13px/1.3 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        box-sizing: border-box;
        cursor: pointer;
        display: block;
      }
      .vectormap-search-dropdown .vectormap-search-result.is-active {
        border-color: #1b2a23;
        box-shadow: 0 6px 16px rgba(27, 42, 35, 0.16);
      }
      .vectormap-search-dropdown .vectormap-search-result .result-label {
        display: block;
        font-weight: 600;
      }
      .vectormap-search-dropdown .vectormap-search-result .result-meta {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: #6a7a71;
      }
      .vectormap-search-marker {
        width: var(--marker-size, 34px);
        height: var(--marker-size, 34px);
        background-color: transparent;
        background-image: var(--marker-image);
        background-repeat: no-repeat;
        background-position: center bottom;
        background-size: contain;
      }
      @media (max-width: 600px) {
        .vectormap-search-dropdown {
          width: min(92vw, 300px);
        }
      }
    `;
    document.head.appendChild(style);
  };

  const buildControl = (panelId) => {
    const resolvedPanelId = panelId || settings.panelId;
    if (resolvedPanelId) {
      const existing = document.getElementById(resolvedPanelId);
      if (existing) {
        existing.remove();
      }
    }

    const container = document.createElement("div");
    if (resolvedPanelId) {
      container.id = resolvedPanelId;
    }
    container.className =
      "maplibregl-ctrl maplibregl-ctrl-group vectormap-search-ctrl";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "maplibregl-ctrl-icon vectormap-search-toggle";
    button.setAttribute("aria-label", settings.buttonLabel);
    button.setAttribute("title", settings.buttonLabel);
    button.setAttribute("aria-expanded", "false");

    const panel = document.createElement("div");
    panel.className = "vectormap-search-panel";

    const input = document.createElement("input");
    input.type = "search";
    input.className = "vectormap-search-input";
    input.placeholder = settings.placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", settings.labelText);

    const dropdown = document.createElement("div");
    dropdown.className = "vectormap-search-dropdown";

    const status = document.createElement("div");
    status.className = "vectormap-search-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const results = document.createElement("ul");
    results.className = "vectormap-search-results";
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Suchergebnisse");

    dropdown.append(status, results);
    panel.append(input, dropdown);
    container.append(button, panel);

    return { container, panel, input, button, status, results };
  };

  const normalizeCsv = (value) => {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(",");
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return "";
  };

  const buildSearchUrl = (baseUrl, query, options = {}) => {
    const url = new URL(baseUrl, window.location.href);
    const params = new URLSearchParams();
    params.set("searchText", query);
    if (settings.lang) {
      params.set("lang", settings.lang);
    }
    const limit = toNumber(settings.limit);
    if (limit !== null && limit > 0) {
      params.set("limit", String(limit));
    }
    const sr = toNumber(settings.sr);
    if (sr !== null && sr > 0) {
      params.set("sr", String(sr));
    }
    const types = normalizeCsv(settings.types);
    if (types) {
      params.set("type", types);
    }
    const origins = normalizeCsv(settings.origins);
    if (origins) {
      params.set("origins", origins);
    }
    if (Array.isArray(settings.bbox) && settings.bbox.length === 4) {
      params.set("bbox", settings.bbox.join(","));
    }
    const includeGeometry =
      options.includeGeometry !== undefined
        ? options.includeGeometry
        : settings.returnGeometry;
    if (includeGeometry) {
      params.set("returnGeometry", "true");
    }
    if (includeGeometry && settings.geometryFormat) {
      params.set("geometryFormat", settings.geometryFormat);
    }
    url.search = params.toString();
    return url.toString();
  };

  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const swissToWgs84 = (easting, northing) => {
    let e = easting;
    let n = northing;
    if (e > 1000000 && n > 1000000) {
      e -= 2000000;
      n -= 1000000;
    }
    const e1 = (e - 600000) / 1000000;
    const n1 = (n - 200000) / 1000000;

    let lat =
      16.9023892 +
      3.238272 * n1 -
      0.270978 * e1 * e1 -
      0.002528 * n1 * n1 -
      0.0447 * e1 * e1 * n1 -
      0.0140 * n1 * n1 * n1;
    let lon =
      2.6779094 +
      4.728982 * e1 +
      0.791484 * e1 * n1 +
      0.1306 * e1 * n1 * n1 -
      0.0436 * e1 * e1 * e1;

    lat = (lat * 100) / 36;
    lon = (lon * 100) / 36;
    return [lon, lat];
  };

  const normalizeLngLat = (coords) => {
    if (!coords) {
      return null;
    }
    let lng;
    let lat;
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = toNumber(coords[0]);
      lat = toNumber(coords[1]);
    } else if (typeof coords === "object") {
      lng = toNumber(coords.lng ?? coords.lon ?? coords.x);
      lat = toNumber(coords.lat ?? coords.y);
    } else {
      return null;
    }
    if (lng === null || lat === null) {
      return null;
    }
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      return swissToWgs84(lng, lat);
    }
    return [lng, lat];
  };

  const normalizeBounds = (bounds) => {
    if (!Array.isArray(bounds) || bounds.length !== 2) {
      return null;
    }
    const sw = normalizeLngLat(bounds[0]);
    const ne = normalizeLngLat(bounds[1]);
    if (!sw || !ne) {
      return null;
    }
    return [sw, ne];
  };

  const ensureLngLat = (value) => {
    if (!value) {
      return null;
    }
    return normalizeLngLat(value);
  };

  const isValidLngLat = (value) =>
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]);

  const isValidBounds = (value) =>
    Array.isArray(value) &&
    value.length === 2 &&
    isValidLngLat(value[0]) &&
    isValidLngLat(value[1]);

  const toMaplibreLngLat = (value) => {
    const normalized = normalizeLngLat(value);
    if (!normalized) {
      return null;
    }
    return normalized;
  };

  const parseBoxString = (value) => {
    if (!value || typeof value !== "string") {
      return null;
    }
    const match = value.match(
      /BOX\\(([-0-9.]+) ([-0-9.]+),\\s*([-0-9.]+) ([-0-9.]+)\\)/
    );
    if (!match) {
      return null;
    }
    const numbers = match.slice(1).map(Number);
    if (numbers.some((num) => !Number.isFinite(num))) {
      return null;
    }
    return [
      [numbers[0], numbers[1]],
      [numbers[2], numbers[3]]
    ];
  };

  const parseCsvBBox = (value) => {
    if (!value || typeof value !== "string" || !value.includes(",")) {
      return null;
    }
    const parts = value.split(",").map((item) => toNumber(item.trim()));
    if (parts.length !== 4 || parts.some((num) => num === null)) {
      return null;
    }
    return [
      [parts[0], parts[1]],
      [parts[2], parts[3]]
    ];
  };

  const parseBBox = (value) => {
    if (!value) {
      return null;
    }
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      Array.isArray(value[0]) &&
      Array.isArray(value[1])
    ) {
      return normalizeBounds(value);
    }
    if (Array.isArray(value) && value.length === 4) {
      const numbers = value.map((item) => toNumber(item));
      if (numbers.some((num) => num === null)) {
        return null;
      }
      return normalizeBounds([
        [numbers[0], numbers[1]],
        [numbers[2], numbers[3]]
      ]);
    }
    if (
      value &&
      typeof value === "object" &&
      ["xmin", "ymin", "xmax", "ymax"].every((key) => key in value)
    ) {
      const numbers = [
        toNumber(value.xmin),
        toNumber(value.ymin),
        toNumber(value.xmax),
        toNumber(value.ymax)
      ];
      if (numbers.some((num) => num === null)) {
        return null;
      }
      return normalizeBounds([
        [numbers[0], numbers[1]],
        [numbers[2], numbers[3]]
      ]);
    }
    const box = parseBoxString(value) || parseCsvBBox(value);
    return normalizeBounds(box);
  };

  const extractPoint = (source) => {
    if (!source || typeof source !== "object") {
      return null;
    }
    if (Array.isArray(source.center) && source.center.length >= 2) {
      return normalizeLngLat(source.center);
    }
    if (Array.isArray(source.coords) && source.coords.length >= 2) {
      return normalizeLngLat(source.coords);
    }
    const lon = source.lon ?? source.lng ?? source.x;
    const lat = source.lat ?? source.y;
    const normalized = normalizeLngLat([lon, lat]);
    if (normalized) {
      return normalized;
    }
    return null;
  };

  const extractGeometry = (result, attrs) => {
    const geojsonString =
      attrs.geom_st_asgeojson ||
      attrs.geom_asgeojson ||
      attrs.geom_geojson ||
      attrs.geom_geojson_4326;
    let geometry =
      result.geometry ||
      result.geom ||
      attrs.geometry ||
      attrs.geom ||
      attrs.geom_4326 ||
      attrs.geom_st;
    if (!geometry && geojsonString) {
      try {
        const parsed = JSON.parse(geojsonString);
        geometry = parsed.geometry || parsed;
      } catch (error) {
        geometry = null;
      }
    }
    if (!geometry && typeof attrs.geom_st_astext === "string") {
      const match = attrs.geom_st_astext.match(
        /POINT\\s*\\(([-0-9.]+)\\s+([-0-9.]+)\\)/i
      );
      if (match) {
        geometry = {
          type: "Point",
          coordinates: [Number(match[1]), Number(match[2])]
        };
      }
    }
    return geometry;
  };

  const deriveBoundsFromGeometry = (geometry) => {
    if (!geometry || !geometry.coordinates) {
      return null;
    }
    const coords = [];
    const collect = (value) => {
      if (!Array.isArray(value)) {
        return;
      }
      if (value.length >= 2 && value.every((item) => typeof item === "number")) {
        coords.push(value);
        return;
      }
      value.forEach(collect);
    };
    collect(geometry.coordinates);
    if (!coords.length) {
      return null;
    }
    const bounds = coords.reduce(
      (acc, coord) => {
        const normalized = normalizeLngLat(coord);
        if (!normalized) {
          return acc;
        }
        const [lng, lat] = normalized;
        acc.minLng = Math.min(acc.minLng, lng);
        acc.minLat = Math.min(acc.minLat, lat);
        acc.maxLng = Math.max(acc.maxLng, lng);
        acc.maxLat = Math.max(acc.maxLat, lat);
        return acc;
      },
      {
        minLng: Infinity,
        minLat: Infinity,
        maxLng: -Infinity,
        maxLat: -Infinity
      }
    );
    if (
      Number.isFinite(bounds.minLng) &&
      Number.isFinite(bounds.minLat) &&
      Number.isFinite(bounds.maxLng) &&
      Number.isFinite(bounds.maxLat)
    ) {
      return [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat]
      ];
    }
    return null;
  };

  const extractLocation = (result) => {
    if (!result || typeof result !== "object") {
      return { center: null, bbox: null };
    }
    const props = result.properties || {};
    const attrs = result.attrs || props;
    const geometry = extractGeometry(result, attrs) || result.geometry;
    let bbox =
      parseBBox(attrs.geom_st_box2d_4326) ||
      parseBBox(attrs.geom_st_box2d) ||
      parseBBox(attrs.bbox) ||
      parseBBox(result.bbox) ||
      parseBBox(result.geom_st_box2d);
    let center = extractPoint(attrs) || extractPoint(result);
    if (!center && geometry && geometry.type === "Point") {
      center = normalizeLngLat(geometry.coordinates);
    }
    if (!bbox && geometry) {
      bbox = deriveBoundsFromGeometry(geometry);
    }
    if (!center && bbox) {
      center = [
        (bbox[0][0] + bbox[1][0]) / 2,
        (bbox[0][1] + bbox[1][1]) / 2
      ];
    }
    return { center, bbox };
  };

  const stripHtml = (value) => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value !== "string") {
      return String(value);
    }
    if (!value.includes("<")) {
      return value;
    }
    const temp = document.createElement("div");
    temp.innerHTML = value;
    return temp.textContent || "";
  };

  const normalizeText = (value) =>
    stripHtml(value).replace(/\\s+/g, " ").trim();

  const getResultLabel = (result) => {
    const attrs = result?.attrs || result?.properties || {};
    const label =
      result?.label ||
      attrs.label ||
      attrs.name ||
      result?.id ||
      "Treffer";
    return normalizeText(label) || "Treffer";
  };

  const getResultMeta = (result) => {
    const attrs = result?.attrs || result?.properties || {};
    const parts = [
      normalizeText(result?.origin || attrs.origin),
      normalizeText(result?.type || attrs.type)
    ].filter(Boolean);
    return parts.join(" - ");
  };

  const getKnownMap = () => {
    if (moduleState.map) {
      return moduleState.map;
    }
    if (Array.isArray(moduleState.maps) && moduleState.maps.length) {
      return moduleState.maps.find((map) => matchesMapContainer(map)) ||
        moduleState.maps[0];
    }
    return null;
  };

  const waitForMap = (timeoutMs = 6000) =>
    new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const existingMap = getKnownMap();
        if (existingMap) {
          resolve(existingMap);
          return;
        }
        if (performance.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

  const ensureMap = async () => {
    if (config.map) {
      if (baseMap && typeof baseMap.registerMap === "function") {
        baseMap.registerMap(config.map, mapOptions);
      }
      return config.map;
    }
    const knownMap = getKnownMap();
    if (knownMap) {
      return knownMap;
    }
    if (!baseMap) {
      console.error("Base map module fehlt.");
      return null;
    }
    const existing = await waitForMap();
    if (existing) {
      return existing;
    }
    try {
      const map = await baseMap.createMap(mapOptions);
      moduleState.map = map;
      return map;
    } catch (error) {
      console.error("Karte konnte nicht initialisiert werden.", error);
      return null;
    }
  };

  const createMarkerElement = () => {
    if (!settings.markerImage) {
      return null;
    }
    const el = document.createElement("div");
    el.className = "vectormap-search-marker";
    el.style.setProperty("--marker-size", `${settings.markerSize || 30}px`);
    el.style.setProperty("--marker-image", `url("${settings.markerImage}")`);
    return el;
  };

  const getPanelId = (map) => {
    const mapContainerId = map?.getContainer?.()?.id;
    if (mapContainerId && mapContainerIds.length > 1) {
      return `${settings.panelId}-${mapContainerId}`;
    }
    return settings.panelId;
  };

  const createSearchControl = (map) => {
    const panelId = getPanelId(map);
    const existingControls = panelId
      ? map.getContainer().querySelectorAll(`#${panelId}`)
      : map.getContainer().querySelectorAll(".vectormap-search-ctrl");
    existingControls.forEach((control) => control.remove());

    const { container, input, button, status, results } = buildControl(panelId);
    const control = {
      onAdd() {
        return container;
      },
      onRemove() {
        container.remove();
      }
    };

    let marker = null;
    let activeButton = null;
    let debounceId = null;
    let lastQuery = "";
    let abortController = null;
    let isOpen = false;
    let lastRendered = [];

    const setOpen = (nextOpen) => {
      isOpen = nextOpen;
      container.classList.toggle("is-open", isOpen);
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (isOpen) {
        input.focus();
      }
    };

    const clearMarker = () => {
      if (marker) {
        marker.remove();
        marker = null;
      }
    };

    const setStatus = (text) => {
      status.textContent = text;
    };

    const clearResults = () => {
      results.innerHTML = "";
      activeButton = null;
      lastRendered = [];
    };

    const moveToResult = (result, buttonEl) => {
      if (activeButton) {
        activeButton.classList.remove("is-active");
      }
      activeButton = buttonEl;
      if (activeButton) {
        activeButton.classList.add("is-active");
      }

      const { center, bbox } = extractLocation(result);
      const props = result?.properties || result?.attrs || {};
      const candidateCenters = [
        result?.geometry?.coordinates,
        [props.lon ?? props.lng ?? props.x, props.lat ?? props.y],
        center
      ];
      let resolvedCenter = null;
      for (const candidate of candidateCenters) {
        const normalized = toMaplibreLngLat(candidate);
        if (isValidLngLat(normalized)) {
          resolvedCenter = normalized;
          break;
        }
      }
      let resolvedBounds = bbox ? normalizeBounds(bbox) : null;
      if (!isValidBounds(resolvedBounds)) {
        resolvedBounds = null;
      }
      const hasBounds =
        resolvedBounds &&
        (resolvedBounds[0][0] !== resolvedBounds[1][0] ||
          resolvedBounds[0][1] !== resolvedBounds[1][1]);
      const hasLocation = hasBounds || Boolean(resolvedCenter);
      const applyMove = () => {
        if (hasBounds) {
          map.fitBounds(resolvedBounds, {
            padding: settings.fitPadding,
            maxZoom: settings.resultZoom,
            duration: settings.fitDuration,
            essential: true
          });
          return;
        }
        if (resolvedCenter) {
          try {
            map.flyTo({
              center: resolvedCenter,
              zoom: settings.resultZoom,
              duration: settings.flyDuration,
              essential: true
            });
          } catch (error) {
            map.jumpTo({ center: resolvedCenter, zoom: settings.resultZoom });
          }
          return;
        }
        clearMarker();
        setStatus("Keine Koordinaten im Resultat.");
      };

      if (!map.isStyleLoaded()) {
        map.once("load", applyMove);
      } else {
        applyMove();
      }

      if (settings.showMarker && resolvedCenter && window.maplibregl) {
        if (!marker) {
          const markerElement = createMarkerElement();
          const markerOptions = markerElement
            ? { element: markerElement, anchor: settings.markerAnchor || "bottom" }
            : {};
          marker = new maplibregl.Marker(markerOptions);
          marker.setLngLat(resolvedCenter);
          marker.addTo(map);
        }
        if (marker) {
          marker.setLngLat(resolvedCenter);
        }
      }

      if (hasLocation) {
        setStatus(`Auswahl: ${getResultLabel(result)}`);
      }
    };

    const renderResults = (items) => {
      clearResults();
      if (!items.length) {
        setStatus(settings.emptyMessage);
        return [];
      }
      setOpen(true);
      setStatus(`Treffer: ${items.length}`);
      const fragment = document.createDocumentFragment();
      const entries = [];
      items.forEach((item) => {
        const listItem = document.createElement("li");
        const resultButton = document.createElement("button");
        resultButton.type = "button";
        resultButton.className = "vectormap-search-result";

        const label = document.createElement("span");
        label.className = "result-label";
        label.textContent = getResultLabel(item);
        const meta = document.createElement("span");
        meta.className = "result-meta";
        meta.textContent = getResultMeta(item);

        resultButton.append(label, meta);
        resultButton.addEventListener("click", () => moveToResult(item, resultButton));
        listItem.appendChild(resultButton);
        fragment.appendChild(listItem);
        entries.push({ item, button: resultButton });
      });
      results.appendChild(fragment);
      lastRendered = entries;
      return entries;
    };

    const requestSearch = async (baseUrl, includeGeometry) => {
      const response = await fetch(
        buildSearchUrl(baseUrl, input.value.trim(), { includeGeometry }),
        {
          signal: abortController.signal,
          headers: { accept: "application/json" }
        }
      );
      if (!response.ok) {
        throw new Error("Search request failed");
      }
      return response.json();
    };

    const performSearch = async (query, options = {}) => {
      const { autoSelect = false } = options;
      const trimmed = query.trim();
      if (trimmed.length < settings.minChars) {
        lastQuery = "";
        clearResults();
        setStatus(settings.idleMessage);
        return;
      }
      if (trimmed === lastQuery) {
        if (autoSelect && lastRendered.length) {
          moveToResult(lastRendered[0].item, lastRendered[0].button);
        }
        return;
      }
      lastQuery = trimmed;
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      setStatus(settings.loadingMessage);

      try {
        const baseUrls = [settings.apiUrl, settings.fallbackApiUrl].filter(Boolean);
        const geometryAttempts =
          settings.returnGeometry === false ? [false] : [true, false];
        let data = null;
        let lastError = null;
        for (const baseUrl of baseUrls) {
          for (const includeGeometry of geometryAttempts) {
            try {
              data = await requestSearch(baseUrl, includeGeometry);
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (data) {
            break;
          }
        }
        if (!data) {
          throw lastError || new Error("Search request failed");
        }
        const items = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data.features)
            ? data.features.map((feature) => ({
                ...feature,
                attrs: feature.properties || feature.attrs || {}
              }))
            : [];
        const entries = renderResults(items);
        if (autoSelect && entries.length) {
          moveToResult(entries[0].item, entries[0].button);
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }
        console.error("Suche fehlgeschlagen.", error);
        lastQuery = "";
        clearResults();
        setStatus(settings.errorMessage);
      }
    };

    const scheduleSearch = (autoSelect) => {
      if (debounceId) {
        window.clearTimeout(debounceId);
      }
      if (autoSelect) {
        performSearch(input.value, { autoSelect: true });
        return;
      }
      debounceId = window.setTimeout(
        () => performSearch(input.value),
        settings.debounceMs
      );
    };

    button.addEventListener("click", () => {
      if (isOpen) {
        setOpen(false);
        input.value = "";
        clearResults();
        clearMarker();
        setStatus(settings.idleMessage);
        return;
      }
      setOpen(true);
    });
    input.addEventListener("focus", () => setOpen(true));
    input.addEventListener("input", () => {
      setOpen(true);
      scheduleSearch(false);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        scheduleSearch(true);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (!input.value.trim()) {
          setOpen(false);
        }
        input.blur();
      }
    });
    document.addEventListener("click", (event) => {
      if (container.contains(event.target)) {
        return;
      }
      if (!input.value.trim()) {
        setOpen(false);
      }
    });

    setStatus(settings.idleMessage);
    setOpen(false);

    return control;
  };

  const registerSearchControl = () => {
    if (!baseMap || typeof baseMap.registerControl !== "function") {
      console.error("Base map module fehlt.");
      return;
    }
    if (moduleState.searchControlRegistered) {
      return;
    }
    moduleState.searchControlRegistered = true;
    baseMap.registerControl({
      key: "search",
      position: "top-right",
      applyTo: (map) => {
        if (config.map && map === config.map) {
          return true;
        }
        return matchesMapContainer(map);
      },
      create: createSearchControl
    });
  };

  const init = async () => {
    ensureStyles();
    registerSearchControl();
    await ensureMap();
  };

  init();
})();
