(() => {
  const config = window.vectormapCompareConfig || {};
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap) {
    console.error("Base map module fehlt.");
    return;
  }

  const rootId = config.containerId || "compare-root";
  const controlsLeft = { navigation: true, scale: false, fullscreen: false };
  const controlsRight = { navigation: true, scale: false, fullscreen: true };
  let rootEl = null;
  let labelSplit = "Zum Comparison-Modus";
  let labelCompare = "Zum Split-Modus";
  let splitMode = true;
  let beforeMap = null;
  let afterMap = null;
  let cmpLeft = null;
  let cmpRight = null;
  let splitCompare = null;
  const toggleButtons = [];

  const updateToggleButtons = () => {
    const label = splitMode ? labelSplit : labelCompare;
    const nextClass = splitMode ? "is-compare" : "is-split";
    const removeClass = splitMode ? "is-split" : "is-compare";
    toggleButtons.forEach((button) => {
      button.classList.remove(removeClass);
      button.classList.add(nextClass);
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  };

  const toggleMode = () => {
    if (!beforeMap || !afterMap || !rootEl) {
      return;
    }
    if (splitMode && (!cmpLeft || !cmpRight)) {
      return;
    }
    const active = splitMode ? beforeMap : cmpLeft;
    if (!active) {
      return;
    }
    const cam = {
      center: active.getCenter(),
      zoom: active.getZoom(),
      bearing: active.getBearing(),
      pitch: active.getPitch()
    };

    const splitContainer = document.getElementById("splitContainer");
    const cmpContainer = document.getElementById("cmpContainer");
    if (!splitContainer || !cmpContainer) {
      return;
    }

    splitContainer.style.display = splitMode ? "none" : "block";
    cmpContainer.style.display = splitMode ? "block" : "none";
    splitMode = !splitMode;
    updateToggleButtons();

    if (splitMode) {
      [beforeMap, afterMap].forEach((map) => {
        map.jumpTo(cam);
        map.resize();
      });
      if (splitCompare && typeof splitCompare.setSlider === "function") {
        const bounds = afterMap.getContainer().getBoundingClientRect();
        splitCompare.setSlider(bounds.width / 2);
      }
      if (splitCompare && typeof splitCompare._onResize === "function") {
        splitCompare._onResize();
      }
    } else if (cmpLeft && cmpRight) {
      [cmpLeft, cmpRight].forEach((map) => {
        map.jumpTo(cam);
        map.resize();
      });
    }
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
          (container.id === "after" || container.id === "cmpMapRight")
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
      #splitContainer { display: block; }
      #before, #after { position: absolute; top: 0; bottom: 0; width: 100%; }
      #cmpMapLeft, #cmpMapRight { position: absolute; top: 0; bottom: 0; width: 50%; }
      #cmpMapLeft { left: 0; }
      #cmpMapRight { right: 0; }
      .vectormap-compare-toggle {
        background-repeat: no-repeat;
        background-position: center;
        background-size: 16px 16px;
      }
      .vectormap-compare-toggle.is-compare {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6'><rect x='2' y='3' width='7' height='14' rx='1.5'/><rect x='11' y='3' width='7' height='14' rx='1.5'/></svg>");
      }
      .vectormap-compare-toggle.is-split {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><line x1='10' y1='3' x2='10' y2='17'/><polyline points='6,7 3,10 6,13'/><polyline points='14,7 17,10 14,13'/></svg>");
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
      "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
    );
    const styleRight = readValue(
      "styleRight",
      "../styles/ch.vectormap.lightbasemap.json"
    );
    labelSplit = readValue("labelSplit", "Zum Comparison-Modus");
    labelCompare = readValue("labelCompare", "Zum Split-Modus");

    const view = {
      center: config.center || parseCenter(data.center, [8.7241, 47.4987]),
      zoom: parseNumber(readValue("zoom"), 15),
      bearing: parseNumber(readValue("bearing"), 0),
      pitch: parseNumber(readValue("pitch"), 0),
      hash: parseBoolean(readValue("hash"), true),
      pitchWithRotate: parseBoolean(readValue("pitchWithRotate"), true)
    };

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
      controls: controlsRight,
      fullscreenContainer: rootEl,
      ...view
    });

    if (!beforeMap || !afterMap) {
      return;
    }

    splitMode = true;

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

    let isDragging = false;
    const stopDragging = () => {
      isDragging = false;
      if (splitCompare && typeof splitCompare._onMouseUp === "function") {
        splitCompare._onMouseUp();
      }
      if (splitCompare && typeof splitCompare._onTouchEnd === "function") {
        splitCompare._onTouchEnd();
      }
    };

    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchend", stopDragging);
    document.addEventListener("touchcancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    rootEl.addEventListener("mousedown", () => {
      isDragging = true;
    });
    rootEl.addEventListener("touchstart", () => {
      isDragging = true;
    });
    rootEl.addEventListener("selectstart", (event) => {
      if (isDragging) {
        event.preventDefault();
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
      controls: controlsRight,
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
    const sync = (src) => {
      if (syncing) {
        return;
      }
      syncing = true;
      const cfg = {
        center: src.getCenter(),
        zoom: src.getZoom(),
        bearing: src.getBearing(),
        pitch: src.getPitch()
      };
      (src === cmpLeft ? cmpRight : cmpLeft).jumpTo(cfg);
      syncing = false;
    };

    cmpLeft.on("move", () => sync(cmpLeft));
    cmpRight.on("move", () => sync(cmpRight));

    updateToggleButtons();

  };

  init();
})();
