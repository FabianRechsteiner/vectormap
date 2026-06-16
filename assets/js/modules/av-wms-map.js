(() => {
  const config = window.vectormapAvWmsConfig || {};
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;
  const moduleUrl = document.currentScript?.src || window.location.href;
  const defaultStyleUrl = new URL(
    "../../../styles/ch.vectormap.lightbasemap.json",
    moduleUrl
  ).href;

  if (!baseMap) {
    console.error("Base map module fehlt.");
    return;
  }

  const paneDefinitions = [
    {
      id: "av-map-1",
      label: "Vectormap",
      type: "map",
      styleUrl: config.styleUrl || defaultStyleUrl,
      controls: {
        navigation: false,
        geolocate: false,
        fullscreen: false,
        scale: false
      }
    },
    {
      id: "av-map-2",
      label: "swisstopo",
      type: "map",
      styleUrl:
        "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json",
      controls: {
        navigation: true,
        geolocate: true,
        fullscreen: true,
        scale: false
      },
      primary: true
    },
    {
      id: "av-wms-1",
      label: "Farbig",
      type: "wms",
      endpoint: "https://wms.geo.sh.ch/av_wms_farbig_umfrage_2026",
      layer: "Farbig | couleur"
    },
    {
      id: "av-wms-2",
      label: "Graustufen",
      type: "wms",
      endpoint: "https://wms.geo.sh.ch/av_wms_graustufen_umfrage_2026",
      layer: "Graustufen | niveaux de gris"
    },
    {
      id: "av-wms-3",
      label: "Schwarz-Weiss",
      type: "wms",
      endpoint: "https://wms.geo.sh.ch/av_wms_schwarzweiss_umfrage_2026",
      layer: "Schwarz-Weiss | noir-blanc"
    },
    {
      id: "av-wms-4",
      label: "Dark Mode",
      type: "wms",
      endpoint: "https://wms.geo.sh.ch/av_wms_darkmode_umfrage_2026",
      layer: "Dark Mode | mode sombre"
    }
  ];

  const rootId = config.containerId || "av-wms-root";
  const geolocateMirrorState = new WeakMap();
  let rootEl = null;
  let gridEl = null;
  let primaryMap = null;
  let vectorMaps = [];
  let wmsPanes = [];
  let syncLocked = false;
  let wmsUpdateTimer = null;
  let wmsPreviewFrame = 0;
  let wmsPreviewQueuedMap = null;
  let currentGeolocation = null;

  const defaultView = {
    center: Array.isArray(config.center)
      ? config.center
      : [6.0686560550293, 46.2287681654191],
    zoom: Number.isFinite(config.zoom) ? config.zoom : 17,
    bearing: Number.isFinite(config.bearing) ? config.bearing : 0,
    pitch: Number.isFinite(config.pitch) ? config.pitch : 0,
    hash: Boolean(config.hash),
    pitchWithRotate: Boolean(config.pitchWithRotate),
    minZoom: Number.isFinite(config.minZoom) ? config.minZoom : 15,
    maxZoom: Number.isFinite(config.maxZoom) ? config.maxZoom : 20
  };

  const ensureLayout = () => {
    rootEl = document.getElementById(rootId);
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = rootId;
      document.body.appendChild(rootEl);
    }

    rootEl.innerHTML = "";
    gridEl = document.createElement("div");
    gridEl.className = "av-wms-grid";
    rootEl.appendChild(gridEl);

    paneDefinitions.forEach((pane) => {
      const paneEl = document.createElement("section");
      paneEl.className = `av-wms-pane av-wms-pane--${pane.type}`;
      paneEl.dataset.paneId = pane.id;

      const surface = document.createElement("div");
      surface.className = "av-wms-surface";
      surface.id = pane.id;
      paneEl.appendChild(surface);

      if (pane.type === "wms") {
        const image = document.createElement("img");
        image.className = "av-wms-image";
        image.alt = `${pane.label} WMS`;
        image.decoding = "async";
        image.loading = "eager";
        image.draggable = false;
        image.referrerPolicy = "no-referrer";
        surface.appendChild(image);

        const locationMarker = document.createElement("div");
        locationMarker.className = "av-wms-location-marker";
        surface.appendChild(locationMarker);

        pane.image = image;
        pane.locationMarker = locationMarker;
      }

      const label = document.createElement("div");
      label.className = "av-wms-label";
      label.textContent = pane.label;
      paneEl.appendChild(label);

      gridEl.appendChild(paneEl);
      pane.element = paneEl;
      pane.surface = surface;
    });
  };

  const ensureStyles = () => {
    if (document.getElementById("av-wms-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "av-wms-style";
    style.textContent = `
      html, body {
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #ffffff;
      }
      #${rootId} {
        position: fixed;
        inset: 0;
        background: #ffffff;
      }
      .av-wms-grid {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
        gap: 1px;
        padding: 1px;
        background: #ffffff;
        box-sizing: border-box;
      }
      .av-wms-pane {
        position: relative;
        overflow: hidden;
        background: #eef2f6;
      }
      .av-wms-surface,
      .av-wms-surface .maplibregl-map,
      .av-wms-surface .maplibregl-canvas-container,
      .av-wms-surface canvas,
      .av-wms-image {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .av-wms-image {
        object-fit: cover;
        object-position: center;
        user-select: none;
        pointer-events: none;
        transform-origin: 50% 50%;
        will-change: transform, opacity;
      }
      .av-wms-pane--wms .av-wms-surface {
        cursor: grab;
        touch-action: none;
      }
      .av-wms-pane--wms .av-wms-surface.is-dragging {
        cursor: grabbing;
      }
      .av-wms-label {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 3;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.92);
        color: #13202f;
        font: 700 14px/1.1 "Segoe UI", Arial, sans-serif;
        letter-spacing: 0.01em;
        pointer-events: none;
      }
      .av-wms-pane--wms .av-wms-label {
        background: rgba(255, 255, 255, 0.96);
      }
      .av-wms-location-marker {
        position: absolute;
        width: 14px;
        height: 14px;
        margin-left: -7px;
        margin-top: -7px;
        border: 2px solid #ffffff;
        border-radius: 999px;
        background: #2c7ef8;
        box-shadow: 0 0 0 3px rgba(44, 126, 248, 0.22);
        pointer-events: none;
        opacity: 0;
        z-index: 2;
      }
      #av-map-1 .maplibregl-ctrl-top-left,
      #av-map-1 .maplibregl-ctrl-top-right {
        display: none;
      }
      .av-wms-pane .maplibregl-ctrl-group:not(:last-child) {
        margin-bottom: 8px;
      }
      .av-wms-pane .maplibregl-ctrl-top-right {
        top: 12px;
        right: 12px;
      }
      .av-wms-pane .maplibregl-ctrl-top-left {
        top: 12px;
        left: 12px;
      }
      .maplibregl-canvas {
        outline: none;
      }
      @media (max-width: 900px), (orientation: portrait) {
        .av-wms-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(3, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
  };

  const toSwiss = (lng, lat) => {
    const latSec = lat * 3600;
    const lngSec = lng * 3600;
    const latAux = (latSec - 169028.66) / 10000;
    const lngAux = (lngSec - 26782.5) / 10000;

    const easting =
      2600072.37 +
      211455.93 * lngAux -
      10938.51 * lngAux * latAux -
      0.36 * lngAux * latAux * latAux -
      44.54 * lngAux * lngAux * lngAux;

    const northing =
      1200147.07 +
      308807.95 * latAux +
      3745.25 * lngAux * lngAux +
      76.63 * latAux * latAux -
      194.56 * lngAux * lngAux * latAux +
      119.79 * latAux * latAux * latAux;

    return [easting, northing];
  };

  const sortBbox = (first, second) => {
    const minX = Math.min(first[0], second[0]);
    const minY = Math.min(first[1], second[1]);
    const maxX = Math.max(first[0], second[0]);
    const maxY = Math.max(first[1], second[1]);
    return [minX, minY, maxX, maxY];
  };

  const clampDimension = (value) =>
    Math.max(256, Math.min(2048, Math.round(value)));

  const clampZoom = (value) =>
    Math.max(defaultView.minZoom, Math.min(defaultView.maxZoom, value));

  const getMapRect = () => primaryMap?.getContainer?.().getBoundingClientRect();

  const getPanePoint = (pane, clientX, clientY) => {
    const rect = pane.surface.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const getMapAroundPoint = (pane, clientX, clientY) => {
    const rect = pane.surface.getBoundingClientRect();
    const mapRect = getMapRect();
    if (!mapRect || !rect.width || !rect.height) {
      return primaryMap.getCenter();
    }

    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    return primaryMap.unproject([
      xRatio * mapRect.width,
      yRatio * mapRect.height
    ]);
  };

  const buildWmsUrl = (map, pane) => {
    const bounds = map.getBounds();
    const southWest = toSwiss(bounds.getWest(), bounds.getSouth());
    const northEast = toSwiss(bounds.getEast(), bounds.getNorth());
    const bbox = sortBbox(southWest, northEast);
    const rect = pane.surface.getBoundingClientRect();
    const width = clampDimension(rect.width * (window.devicePixelRatio || 1));
    const height = clampDimension(rect.height * (window.devicePixelRatio || 1));
    const url = new URL(pane.endpoint);

    url.searchParams.set("SERVICE", "WMS");
    url.searchParams.set("REQUEST", "GetMap");
    url.searchParams.set("VERSION", "1.3.0");
    url.searchParams.set("LAYERS", pane.layer);
    url.searchParams.set("STYLES", "");
    url.searchParams.set("FORMAT", "image/png");
    url.searchParams.set("TRANSPARENT", "true");
    url.searchParams.set("CRS", "EPSG:2056");
    url.searchParams.set("WIDTH", String(width));
    url.searchParams.set("HEIGHT", String(height));
    url.searchParams.set("BBOX", bbox.join(","));
    return url.toString();
  };

  const applyWmsPreviewTransforms = (referenceMap = primaryMap) => {
    if (!referenceMap) {
      return;
    }

    const mapRect = getMapRect();
    if (!mapRect || !mapRect.width || !mapRect.height) {
      return;
    }

    const currentZoom = referenceMap.getZoom();

    wmsPanes.forEach((pane) => {
      if (!pane.image || !pane.renderState) {
        return;
      }

      const paneRect = pane.surface.getBoundingClientRect();
      if (!paneRect.width || !paneRect.height) {
        return;
      }

      const referencePoint = referenceMap.project(pane.renderState.center);
      const translateX =
        (referencePoint.x - mapRect.width / 2) * (paneRect.width / mapRect.width);
      const translateY =
        (referencePoint.y - mapRect.height / 2) * (paneRect.height / mapRect.height);
      const scale = Math.pow(2, currentZoom - pane.renderState.zoom);

      pane.image.style.transform =
        `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px) ` +
        `scale(${scale.toFixed(5)})`;
      pane.image.style.opacity = "1";
    });

    updateWmsLocationMarkers();
  };

  const queueWmsPreview = (referenceMap = primaryMap) => {
    wmsPreviewQueuedMap = referenceMap;
    if (wmsPreviewFrame) {
      return;
    }

    wmsPreviewFrame = window.requestAnimationFrame(() => {
      wmsPreviewFrame = 0;
      applyWmsPreviewTransforms(wmsPreviewQueuedMap || primaryMap);
      wmsPreviewQueuedMap = null;
    });
  };

  const updateWmsLocationMarkers = () => {
    wmsPanes.forEach((pane) => {
      if (!pane.locationMarker) {
        return;
      }
      if (!currentGeolocation) {
        pane.locationMarker.style.opacity = "0";
        return;
      }

      const bounds = primaryMap?.getBounds?.();
      if (!bounds) {
        pane.locationMarker.style.opacity = "0";
        return;
      }

      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const lngSpan = east - west;
      const latSpan = north - south;

      if (!lngSpan || !latSpan) {
        pane.locationMarker.style.opacity = "0";
        return;
      }

      const x = ((currentGeolocation[0] - west) / lngSpan) * 100;
      const y = ((north - currentGeolocation[1]) / latSpan) * 100;
      const visible = x >= 0 && x <= 100 && y >= 0 && y <= 100;

      pane.locationMarker.style.left = `${x}%`;
      pane.locationMarker.style.top = `${y}%`;
      pane.locationMarker.style.opacity = visible ? "1" : "0";
    });
  };

  const scheduleWmsUpdate = (referenceMap) => {
    if (wmsUpdateTimer) {
      window.clearTimeout(wmsUpdateTimer);
    }
    wmsUpdateTimer = window.setTimeout(() => {
      updateWmsPanes(referenceMap);
    }, 160);
  };

  const updateWmsPanes = (referenceMap = primaryMap) => {
    if (!referenceMap) {
      return;
    }

    wmsPanes.forEach((pane) => {
      const nextUrl = buildWmsUrl(referenceMap, pane);
      if (pane.currentUrl === nextUrl) {
        return;
      }
      const viewSnapshot = {
        center: referenceMap.getCenter(),
        zoom: referenceMap.getZoom()
      };
      const requestId = (pane.requestId || 0) + 1;
      pane.requestId = requestId;
      pane.currentUrl = nextUrl;

      const preload = new Image();
      preload.decoding = "async";
      preload.referrerPolicy = "no-referrer";
      preload.onload = () => {
        if (pane.requestId !== requestId) {
          return;
        }
        pane.image.src = nextUrl;
        pane.image.style.transform = "translate(0px, 0px) scale(1)";
        pane.renderState = viewSnapshot;
        queueWmsPreview(referenceMap);
      };
      preload.src = nextUrl;
    });

    updateWmsLocationMarkers();
  };

  const disableRotation = (map) => {
    map.dragRotate.disable();
    if (map.touchZoomRotate?.disableRotation) {
      map.touchZoomRotate.disableRotation();
    }
    map.setPitch(0);
    map.setBearing(0);
  };

  const syncVectorMaps = (sourceMap) => {
    if (syncLocked) {
      return;
    }
    syncLocked = true;

    const nextView = {
      center: sourceMap.getCenter(),
      zoom: sourceMap.getZoom(),
      bearing: 0,
      pitch: 0
    };

    vectorMaps.forEach((map) => {
      if (map === sourceMap) {
        return;
      }
      map.jumpTo(nextView);
    });

    syncLocked = false;
    queueWmsPreview(sourceMap);
  };

  const bindMapSync = (map) => {
    map.on("move", () => syncVectorMaps(map));
    map.on("zoom", () => queueWmsPreview(map));
    map.on("moveend", () => scheduleWmsUpdate(map));
    map.on("zoomend", () => scheduleWmsUpdate(map));
    map.on("resize", () => scheduleWmsUpdate(map));
  };

  const getPinchState = (pane) => {
    if (!pane.interaction) {
      pane.interaction = {
        pointers: new Map(),
        lastMidpoint: null,
        lastDistance: 0
      };
    }
    return pane.interaction;
  };

  const resetPinchState = (pane) => {
    const state = getPinchState(pane);
    state.lastMidpoint = null;
    state.lastDistance = 0;
  };

  const getMidpoint = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  });

  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const attachWmsInteractions = (pane) => {
    const surface = pane.surface;
    const state = getPinchState(pane);

    const endInteraction = () => {
      if (!state.pointers.size) {
        surface.classList.remove("is-dragging");
      }
      if (state.pointers.size < 2) {
        resetPinchState(pane);
      }
      scheduleWmsUpdate(primaryMap);
    };

    surface.addEventListener("pointerdown", (event) => {
      if (!primaryMap) {
        return;
      }
      surface.setPointerCapture(event.pointerId);
      surface.classList.add("is-dragging");
      state.pointers.set(event.pointerId, getPanePoint(pane, event.clientX, event.clientY));
      if (state.pointers.size < 2) {
        resetPinchState(pane);
      }
    });

    surface.addEventListener("pointermove", (event) => {
      if (!primaryMap || !state.pointers.has(event.pointerId)) {
        return;
      }

      const nextPoint = getPanePoint(pane, event.clientX, event.clientY);
      const previousPoint = state.pointers.get(event.pointerId);
      state.pointers.set(event.pointerId, nextPoint);

      if (state.pointers.size === 1 && previousPoint) {
        primaryMap.panBy(
          [previousPoint.x - nextPoint.x, previousPoint.y - nextPoint.y],
          { animate: false }
        );
        return;
      }

      if (state.pointers.size < 2) {
        return;
      }

      const [first, second] = Array.from(state.pointers.values());
      const midpoint = getMidpoint(first, second);
      const distance = getDistance(first, second);

      if (!state.lastMidpoint || !state.lastDistance) {
        state.lastMidpoint = midpoint;
        state.lastDistance = distance;
        return;
      }

      primaryMap.panBy(
        [
          state.lastMidpoint.x - midpoint.x,
          state.lastMidpoint.y - midpoint.y
        ],
        { animate: false }
      );

      if (distance > 0 && state.lastDistance > 0) {
        const zoomDelta = Math.log2(distance / state.lastDistance);
        if (Number.isFinite(zoomDelta) && Math.abs(zoomDelta) > 0.0001) {
          primaryMap.zoomTo(clampZoom(primaryMap.getZoom() + zoomDelta), {
            around: getMapAroundPoint(pane, event.clientX, event.clientY),
            duration: 0,
            animate: false
          });
        }
      }

      state.lastMidpoint = midpoint;
      state.lastDistance = distance;
    });

    const releasePointer = (event) => {
      state.pointers.delete(event.pointerId);
      endInteraction();
    };

    surface.addEventListener("pointerup", releasePointer);
    surface.addEventListener("pointercancel", releasePointer);
    surface.addEventListener("lostpointercapture", releasePointer);

    surface.addEventListener(
      "wheel",
      (event) => {
        if (!primaryMap) {
          return;
        }
        event.preventDefault();
        const delta = -event.deltaY / 320;
        if (!delta) {
          return;
        }
        primaryMap.zoomTo(clampZoom(primaryMap.getZoom() + delta), {
          around: getMapAroundPoint(pane, event.clientX, event.clientY),
          duration: 0,
          animate: false
        });
        scheduleWmsUpdate(primaryMap);
      },
      { passive: false }
    );

    surface.addEventListener("dblclick", (event) => {
      if (!primaryMap) {
        return;
      }
      primaryMap.zoomTo(clampZoom(primaryMap.getZoom() + 1), {
        around: getMapAroundPoint(pane, event.clientX, event.clientY),
        duration: 0,
        animate: false
      });
      scheduleWmsUpdate(primaryMap);
    });
  };

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
    geolocateMirrorState.set(map, state);
    return state;
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

  const clearGeolocation = () => {
    currentGeolocation = null;
    updateWmsLocationMarkers();
  };

  const registerGeolocateMirrors = () => {
    const control = primaryMap?.__vectormapGeolocateControl;
    if (!control || typeof control.on !== "function") {
      return;
    }

    control.on("geolocate", (event) => {
      const center = toLngLat(event);
      if (!center) {
        return;
      }
      currentGeolocation = center;
      vectorMaps.forEach((map) => {
        if (map !== primaryMap) {
          mirrorGeolocation(map, event);
        }
      });
      updateWmsLocationMarkers();
    });

    control.on("outofmaxbounds", clearGeolocation);
    control.on("error", clearGeolocation);
  };

  const createMaps = async () => {
    try {
      await baseMap.ensureLibraries(config);
    } catch (error) {
      console.error(error);
      return;
    }

    for (const pane of paneDefinitions) {
      if (pane.type !== "map") {
        wmsPanes.push(pane);
        attachWmsInteractions(pane);
        continue;
      }

      const map = await baseMap.createMap({
        container: pane.id,
        styleUrl: pane.styleUrl,
        controls: pane.controls,
        fullscreenContainer: rootEl,
        center: defaultView.center,
        zoom: defaultView.zoom,
        bearing: 0,
        pitch: 0,
        hash: false,
        pitchWithRotate: false,
        minZoom: defaultView.minZoom,
        maxZoom: defaultView.maxZoom,
        attributionControl: false
      });

      if (!map) {
        continue;
      }

      disableRotation(map);
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      vectorMaps.push(map);
      pane.map = map;
      if (pane.primary) {
        primaryMap = map;
      }
    }

    if (!primaryMap) {
      primaryMap = vectorMaps[0] || null;
    }

    vectorMaps.forEach((map) => bindMapSync(map));
    registerGeolocateMirrors();

    const resizeAll = () => {
      vectorMaps.forEach((map) => map.resize());
      queueWmsPreview(primaryMap);
      scheduleWmsUpdate(primaryMap);
    };

    window.addEventListener("resize", resizeAll);
    window.setTimeout(resizeAll, 250);
    window.setTimeout(resizeAll, 1000);
    scheduleWmsUpdate(primaryMap);
  };

  const init = async () => {
    ensureStyles();
    ensureLayout();
    await createMaps();
  };

  init();
})();
