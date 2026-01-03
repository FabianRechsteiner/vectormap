(() => {
  const config = window.vectormapCompareConfig || {};
  const baseMap = window.vectormapModules && window.vectormapModules.baseMap;

  if (!baseMap) {
    console.error("Base map module fehlt.");
    return;
  }

  const rootId = config.containerId || "compare-root";
  const compareCss = config.compareCss || "css/maplibre-gl-compare.css";
  const compareJs = config.compareJs || "js/maplibre-gl-compare.js";
  const styleLeft =
    config.styleLeft ||
    "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json";
  const styleRight =
    config.styleRight || "../styles/ch.vectormap.lightbasemap.json";
  const view = {
    center: config.center || [8.7241, 47.4987],
    zoom: config.zoom ?? 15,
    bearing: config.bearing ?? 0,
    pitch: config.pitch ?? 0,
    hash: config.hash ?? true,
    pitchWithRotate: config.pitchWithRotate ?? true
  };
  const labelSplit = config.labelSplit || "Zum Comparison-Modus";
  const labelCompare = config.labelCompare || "Zum Split-Modus";

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
    const rootEl = document.getElementById(rootId);

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

    const controls = { navigation: true, scale: true, fullscreen: false };

    const beforeMap = await baseMap.createMap({
      container: "before",
      styleUrl: styleLeft,
      attributionControl: false,
      controls,
      ...view
    });
    const afterMap = await baseMap.createMap({
      container: "after",
      styleUrl: styleRight,
      attributionControl: false,
      controls,
      ...view
    });

    if (!beforeMap || !afterMap) {
      return;
    }

    beforeMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );
    afterMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    let splitMode = true;
    let cmpLeft;
    let cmpRight;
    let splitCompare;
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
      const active = splitMode ? beforeMap : cmpLeft;
      const cam = {
        center: active.getCenter(),
        zoom: active.getZoom(),
        bearing: active.getBearing(),
        pitch: active.getPitch()
      };

      document.getElementById("splitContainer").style.display = splitMode
        ? "none"
        : "block";
      document.getElementById("cmpContainer").style.display = splitMode
        ? "block"
        : "none";
      splitMode = !splitMode;
      updateToggleButtons();

      if (splitMode) {
        [beforeMap, afterMap].forEach((map) => {
          map.jumpTo(cam);
          map.resize();
        });
        if (splitCompare && typeof splitCompare._onResize === "function") {
          splitCompare._onResize();
        }
      } else {
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

    splitCompare = new maplibregl.Compare(
      beforeMap,
      afterMap,
      "#splitContainer"
    );

    const stopDragging = () => {
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

    cmpLeft = await baseMap.createMap({
      container: "cmpMapLeft",
      styleUrl: styleLeft,
      attributionControl: false,
      controls,
      ...view
    });
    cmpRight = await baseMap.createMap({
      container: "cmpMapRight",
      styleUrl: styleRight,
      attributionControl: false,
      controls,
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

    if (maplibregl.FullscreenControl) {
      afterMap.addControl(new maplibregl.FullscreenControl({ container: rootEl }));
      cmpRight.addControl(new maplibregl.FullscreenControl({ container: rootEl }));
    }

    afterMap.addControl(createToggleControl(), "top-right");
    cmpRight.addControl(createToggleControl(), "top-right");

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
