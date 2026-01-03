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
      <button id="modeBtn" type="button">${labelSplit}</button>
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
      #modeBtn {
        position: absolute;
        bottom: 10px;
        left: 10px;
        z-index: 10;
        padding: 8px 14px;
        border: none;
        border-radius: 5px;
        background: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .mode-container { position: absolute; inset: 0; display: none; }
      #splitContainer { display: block; }
      #before, #after { position: absolute; top: 0; bottom: 0; width: 100%; }
      #cmpMapLeft, #cmpMapRight { position: absolute; top: 0; bottom: 0; width: 50%; }
      #cmpMapLeft { left: 0; }
      #cmpMapRight { right: 0; }
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

    if (maplibregl.FullscreenControl) {
      afterMap.addControl(new maplibregl.FullscreenControl({ container: rootEl }));
    }

    const splitCompare = new maplibregl.Compare(
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

    const cmpLeft = await baseMap.createMap({
      container: "cmpMapLeft",
      styleUrl: styleLeft,
      attributionControl: false,
      controls,
      ...view
    });
    const cmpRight = await baseMap.createMap({
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
      cmpRight.addControl(new maplibregl.FullscreenControl({ container: rootEl }));
    }

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

    let splitMode = true;
    const button = document.getElementById("modeBtn");

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
      button.textContent = splitMode ? labelSplit : labelCompare;

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

    button.addEventListener("click", toggleMode);

  };

  init();
})();
