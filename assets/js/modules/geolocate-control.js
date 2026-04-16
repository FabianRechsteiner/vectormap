(() => {
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;
  const defaultPositionOptions = {
    enableHighAccuracy: false,
    maximumAge: 60000,
    timeout: 12000
  };
  const fallbackPositionOptions = {
    enableHighAccuracy: false,
    maximumAge: 300000,
    timeout: 20000
  };

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.geolocateControlRegistered) {
    return;
  }
  moduleState.geolocateControlRegistered = true;

  baseMap.registerControl({
    key: "geolocate",
    position: "top-right",
    create: () => {
      if (!window.maplibregl || !maplibregl.GeolocateControl) {
        return null;
      }

      return new maplibregl.GeolocateControl({
        positionOptions: defaultPositionOptions,
        trackUserLocation: false,
        showUserHeading: true
      });
    },
    onAdd: (map, control) => {
      map.__vectormapGeolocateControl = control;
      if (
        !control ||
        typeof control.on !== "function" ||
        !window.navigator?.geolocation
      ) {
        return;
      }

      let retryPending = false;

      control.on("error", (event) => {
        const geolocationError = event?.error || event?.data || event;
        if (!geolocationError || retryPending || geolocationError.code === 1) {
          return;
        }

        retryPending = true;
        window.navigator.geolocation.getCurrentPosition(
          (position) => {
            retryPending = false;
            if (typeof control._onSuccess === "function") {
              control._onSuccess(position);
              return;
            }
            if (map?.flyTo) {
              map.flyTo({
                center: [position.coords.longitude, position.coords.latitude],
                zoom: Math.max(map.getZoom?.() || 0, 15),
                essential: true
              });
            }
          },
          () => {
            retryPending = false;
          },
          fallbackPositionOptions
        );
      });
    }
  });
})();
