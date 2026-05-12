(() => {
  const moduleState = (window.vectormapModules = window.vectormapModules || {});
  const urlState = moduleState.urlState || {};
  moduleState.urlState = urlState;

  const CAMERA_KEYS = {
    lng: "lng",
    lat: "lat",
    zoom: "z",
    bearing: "br",
    pitch: "pt"
  };

  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toArray = (value) =>
    (Array.isArray(value) ? value : [])
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim());

  const parseList = (params, key) => {
    const value = params.get(key);
    if (!value) {
      return [];
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const parseHashCamera = () => {
    const value = window.location.hash.replace(/^#/, "");
    if (!value) {
      return null;
    }
    const parts = value.split("/").map((item) => Number(item));
    if (parts.length < 3 || parts.some((item) => !Number.isFinite(item))) {
      return null;
    }
    const [zoom, lat, lng, bearing = 0, pitch = 0] = parts;
    return { center: [lng, lat], zoom, bearing, pitch };
  };

  const parse = (search = window.location.search) => {
    const params = new URLSearchParams(search || "");
    const lng = toNumber(params.get(CAMERA_KEYS.lng));
    const lat = toNumber(params.get(CAMERA_KEYS.lat));
    const zoom = toNumber(params.get(CAMERA_KEYS.zoom));
    const bearing = toNumber(params.get(CAMERA_KEYS.bearing));
    const pitch = toNumber(params.get(CAMERA_KEYS.pitch));

    let camera = null;
    if (
      lng !== null &&
      lat !== null &&
      zoom !== null &&
      Math.abs(lng) <= 180 &&
      Math.abs(lat) <= 90
    ) {
      camera = { center: [lng, lat], zoom, bearing: bearing ?? 0, pitch: pitch ?? 0 };
    } else {
      camera = parseHashCamera();
    }

    const month = params.get("m");
    const basemapId = params.get("bm");
    const mode = params.get("mode");
    const searchQuery = params.get("q");

    return {
      camera,
      basemapId: basemapId || null,
      overlayIds: parseList(params, "ov"),
      visibleControls: parseList(params, "ctl"),
      month: month || null,
      mode: mode || null,
      searchQuery: searchQuery || null
    };
  };

  const serialize = (state = {}) => {
    const params = new URLSearchParams();
    const camera = state.camera || null;
    if (camera && Array.isArray(camera.center) && camera.center.length >= 2) {
      const [lng, lat] = camera.center;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        params.set(CAMERA_KEYS.lng, lng.toFixed(5));
        params.set(CAMERA_KEYS.lat, lat.toFixed(5));
      }
      if (Number.isFinite(camera.zoom)) {
        params.set(CAMERA_KEYS.zoom, camera.zoom.toFixed(2));
      }
      if (Number.isFinite(camera.bearing)) {
        params.set(CAMERA_KEYS.bearing, camera.bearing.toFixed(2));
      }
      if (Number.isFinite(camera.pitch)) {
        params.set(CAMERA_KEYS.pitch, camera.pitch.toFixed(2));
      }
    }

    if (typeof state.basemapId === "string" && state.basemapId.trim()) {
      params.set("bm", state.basemapId.trim());
    }

    const overlays = toArray(state.overlayIds);
    if (overlays.length) {
      params.set("ov", overlays.join(","));
    }

    const controls = toArray(state.visibleControls);
    if (controls.length) {
      params.set("ctl", controls.join(","));
    }

    if (typeof state.month === "string" && /^\d{4}-\d{2}$/.test(state.month)) {
      params.set("m", state.month);
    }
    if (typeof state.mode === "string" && state.mode.trim()) {
      params.set("mode", state.mode.trim());
    }
    if (typeof state.searchQuery === "string" && state.searchQuery.trim()) {
      params.set("q", state.searchQuery.trim());
    }

    return params;
  };

  const cameraFromMap = (map) => {
    if (!map) {
      return null;
    }
    return {
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch()
    };
  };

  const applyCameraToMap = (map, camera) => {
    if (!map || !camera) {
      return;
    }
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch
    });
  };

  const replaceUrl = (state = {}) => {
    const params = serialize(state);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` === nextUrl) {
      return;
    }
    window.history.replaceState(null, "", nextUrl);
  };

  urlState.parse = parse;
  urlState.serialize = serialize;
  urlState.replaceUrl = replaceUrl;
  urlState.cameraFromMap = cameraFromMap;
  urlState.applyCameraToMap = applyCameraToMap;
})();
