(() => {
  const config = window.vectormapOgcControlConfig || {};
  const moduleState = (window.vectormapModules = window.vectormapModules || {});
  const baseMap = moduleState.baseMap;
  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.ogcControlRegistered) {
    return;
  }
  moduleState.ogcControlRegistered = true;

  const defaults = {
    position: "top-right",
    managerPosition: "top-left",
    mapContainerIds: ["normalMap", "after", "cmpMapRight"],
    title: "OGC-Layer hinzufügen",
    panelTitle: "Geodaten suchen",
    searchPlaceholder: "Suchbegriff oder WMS/WMTS-URL",
    searchButtonLabel: "Katalog suchen",
    addServiceButtonLabel: "Dienst laden",
    addLayerButtonLabel: "Layer hinzufügen",
    requestTimeoutMs: 12000,
    searchDebounceMs: 400,
    maxCatalogResults: 15,
    maxLayerResults: 120,
    geocat: {
      enabled: true,
      searchEndpoint: "https://www.geocat.ch/geonetwork/srv/api/search/records/_search"
    }
  };

  const settings = {
    ...defaults,
    ...config,
    geocat: { ...defaults.geocat, ...(config.geocat || {}) }
  };

  const targetIds = new Set(
    (Array.isArray(settings.mapContainerIds) ? settings.mapContainerIds : [])
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
  );
  const safeText = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const normalizeOpacity = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      return 1;
    }
    return Math.max(0, Math.min(1, Number(n.toFixed(2))));
  };
  const slug = (v) =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 54) || "ogc-layer";
  const toBase64 = (value) => btoa(unescape(encodeURIComponent(value)));
  const fromBase64 = (value) => decodeURIComponent(escape(atob(value)));

  const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }
    const timeout = window.setTimeout(() => controller.abort(), settings.requestTimeoutMs);
    const { signal, ...rest } = options;
    try {
      return await fetch(url, { ...rest, signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const mapId = (map) => map?.getContainer?.()?.id || "";
  const getTargetMaps = () =>
    (Array.isArray(moduleState.maps) ? moduleState.maps : []).filter((map) =>
      targetIds.has(mapId(map))
    );

  const normalizeCapabilitiesUrl = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      if (/WMTSCapabilities\.xml/i.test(parsed.pathname)) {
        return parsed.toString();
      }
      const params = parsed.searchParams;
      if (!params.get("REQUEST")) {
        params.set("REQUEST", "GetCapabilities");
      }
      if (!params.get("SERVICE")) {
        params.set("SERVICE", /wmts/i.test(url) ? "WMTS" : "WMS");
      }
      parsed.search = params.toString();
      return parsed.toString();
    } catch (error) {
      return String(url || "");
    }
  };
  const toServiceBaseUrl = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.search = "";
      return parsed.toString();
    } catch (error) {
      return String(url || "");
    }
  };
  const parseXml = (text) => new DOMParser().parseFromString(text, "text/xml");
  const xmlText = (node, selector) => safeText(node?.querySelector(selector)?.textContent || "");

  const extractWmsLayers = (xml) => {
    const nodes = [...xml.querySelectorAll("Capability > Layer > Layer, Layer Layer")];
    const seen = new Set();
    const out = [];
    nodes.forEach((node) => {
      const layerId = xmlText(node, "Name");
      if (!layerId || seen.has(layerId)) {
        return;
      }
      seen.add(layerId);
      out.push({
        serviceType: "WMS",
        layerId,
        title: xmlText(node, "Title") || layerId,
        abstract: xmlText(node, "Abstract"),
        format: "image/png"
      });
    });
    return out.slice(0, settings.maxLayerResults);
  };

  const extractWmtsLayers = (xml) => {
    const nodes = [...xml.querySelectorAll("Contents > Layer, wmts\\:Contents > wmts\\:Layer")];
    const seen = new Set();
    const out = [];
    nodes.forEach((node) => {
      const layerId = xmlText(node, "Identifier, ows\\:Identifier");
      if (!layerId || seen.has(layerId)) {
        return;
      }
      seen.add(layerId);
      const style =
        xmlText(
          node,
          "Style[isDefault='true'] Identifier, Style Identifier, wmts\\:Style[isDefault='true'] ows\\:Identifier, wmts\\:Style ows\\:Identifier"
        ) || "default";
      const tileTemplate =
        node
          .querySelector("ResourceURL[resourceType='tile'], wmts\\:ResourceURL[resourceType='tile']")
          ?.getAttribute("template") || "";
      out.push({
        serviceType: "WMTS",
        layerId,
        title: xmlText(node, "Title, ows\\:Title") || layerId,
        abstract: xmlText(node, "Abstract, ows\\:Abstract"),
        format: xmlText(node, "Format, wmts\\:Format") || "image/png",
        style,
        tileTemplate,
        tileMatrixSet: "3857"
      });
    });
    return out.slice(0, settings.maxLayerResults);
  };

  const parseCapabilities = async (url) => {
    try {
      const res = await fetchWithTimeout(normalizeCapabilitiesUrl(url), {
        headers: { accept: "application/xml,text/xml,*/*" }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} beim Dienst.`);
      }
      const xml = parseXml(await res.text());
      if (xml.querySelector("WMS_Capabilities, WMT_MS_Capabilities")) {
        return { serviceType: "WMS", layers: extractWmsLayers(xml) };
      }
      if (xml.querySelector("Capabilities, wmts\\:Capabilities")) {
        return { serviceType: "WMTS", layers: extractWmtsLayers(xml) };
      }
      throw new Error("Kein gültiges WMS/WMTS GetCapabilities.");
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Zeitüberschreitung beim Laden des Dienstes.");
      }
      if (/Failed to fetch/i.test(String(error?.message || ""))) {
        throw new Error("Netzwerk- oder CORS-Fehler beim Dienst.");
      }
      throw error;
    }
  };

  const detectServiceType = (url) => {
    const text = String(url || "");
    if (/service=WMS/i.test(text) || /\/wms\b/i.test(text)) {
      return "WMS";
    }
    if (/service=WMTS/i.test(text) || /WMTSCapabilities\.xml/i.test(text) || /\/wmts\b/i.test(text)) {
      return "WMTS";
    }
    if (/service=WFS/i.test(text) || /\/wfs\b/i.test(text)) {
      return "WFS";
    }
    return "OGC";
  };
  const pickRecordExtent = (src) => {
    const candidate = src?.geom?.[0] || src?.shape || null;
    if (!candidate?.type || !candidate?.coordinates) {
      return null;
    }
    return { type: candidate.type, coordinates: candidate.coordinates };
  };
  const extractCapabilitiesCandidates = (record) => {
    const links = Array.isArray(record?.links) ? record.links : [];
    return links
      .map((x) => String(x?.url || x || ""))
      .filter((url) => /^https?:\/\//i.test(url))
      .map((url) => ({ url, serviceType: detectServiceType(url) }))
      .filter((link, idx, all) => all.findIndex((x) => x.url === link.url) === idx);
  };
  const pickLoadableCandidate = (candidates) =>
    candidates.find(
      (link) =>
        link.serviceType === "WMS" ||
        link.serviceType === "WMTS" ||
        /GetCapabilities/i.test(link.url)
    ) || null;
  const buildMetadataUrl = (id) => {
    const clean = safeText(id);
    return clean ? `https://www.geocat.ch/datahub/dataset/${encodeURIComponent(clean)}` : "";
  };

  const escapeLucene = (value) =>
    String(value || "").replace(/([+\-=&|><!(){}\[\]^"~*?:\\/])/g, "\\$1");
  const buildGeocatTextQuery = (query) => {
    const tokens = safeText(query)
      .split(/\s+/)
      .map(escapeLucene)
      .filter(Boolean);
    if (!tokens.length) {
      return "";
    }
    return tokens.map((token) => `+anytext:${token}*`).join(" ");
  };

  const buildGeocatPayload = (query, map, useMapBbox = false) => {
    let bboxFilter = null;
    if (useMapBbox) {
      try {
        const b = map?.getBounds?.();
        if (b) {
          bboxFilter = {
            geo_shape: {
              geom: {
                shape: {
                  type: "envelope",
                  coordinates: [
                    [Number(b.getWest()), Number(b.getNorth())],
                    [Number(b.getEast()), Number(b.getSouth())]
                  ]
                },
                relation: "intersects"
              }
            }
          };
        }
      } catch (error) {
        bboxFilter = null;
      }
    }

    const filter = [
      { term: { isTemplate: { value: "n" } } },
      {
        bool: {
          should: [
            { exists: { field: "linkUrl" } },
            { exists: { field: "link.url" } },
            { exists: { field: "link.href" } }
          ],
          minimum_should_match: 1
        }
      }
    ];
    if (bboxFilter) {
      filter.push(bboxFilter);
    }

    return {
      from: 0,
      size: settings.maxCatalogResults,
      sort: [{ _score: "desc" }],
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: buildGeocatTextQuery(query)
              }
            }
          ],
          filter
        }
      }
    };
  };

  const discoverGeocat = async (query, map, options = {}) => {
    const q = safeText(query);
    if (!q) {
      return [];
    }
    const payload = buildGeocatPayload(q, map, options.useMapBbox === true);
    let data;
    try {
      const res = await fetchWithTimeout(settings.geocat.searchEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: options.signal
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} beim Katalog.`);
      }
      data = await res.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Katalogsuche hat das Zeitlimit erreicht.");
      }
      if (/Failed to fetch/i.test(String(error?.message || ""))) {
        throw new Error("Katalog nicht erreichbar (Netzwerk/CORS).");
      }
      throw error;
    }
    const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
    const mapped = hits.map((hit, index) => {
      const src = hit?._source || {};
      const links = []
        .concat(src?.link || [])
        .concat(src?.links || [])
        .concat(src?.linkUrl || [])
        .concat(src?.onlineResource || [])
        .concat(src?.onlineResources || [])
        .concat(src?.references || [])
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          return item?.url || item?.href || item?.linkURL || item?.value || "";
        })
        .filter(Boolean)
        .map(String);
      const id = safeText(src?.uuid || src?.id || hit?._id || `geocat-${index}`);
      return {
        id,
        title:
          safeText(src?.resourceTitleObject?.default) ||
          safeText(src?.title) ||
          safeText(src?.resourceTitle) ||
          "Ohne Titel",
        abstract:
          safeText(src?.resourceAbstractObject?.default) ||
          safeText(src?.abstract) ||
          safeText(src?.description),
        organization: safeText(
          src?.OrgForResource ||
            src?.orgName ||
            src?.organisation ||
            src?.contactOrg ||
            src?.ownername
        ),
        metadataUrl: buildMetadataUrl(id),
        links,
        extentGeometry: pickRecordExtent(src)
      };
    });
    return mapped.filter((record) => extractCapabilitiesCandidates(record).length > 0);
  };

  const buildWmsTileUrl = (overlay) => {
    const base = toServiceBaseUrl(overlay.capabilitiesUrl || "");
    const q = new URLSearchParams();
    q.set("SERVICE", "WMS");
    q.set("REQUEST", "GetMap");
    q.set("VERSION", "1.1.1");
    q.set("LAYERS", overlay.layerId);
    q.set("STYLES", "");
    q.set("FORMAT", overlay.format || "image/png");
    q.set("TRANSPARENT", "true");
    q.set("WIDTH", "256");
    q.set("HEIGHT", "256");
    q.set("SRS", "EPSG:3857");
    q.set("BBOX", "{bbox-epsg-3857}");
    return `${base}?${q.toString().replace("BBOX=%7Bbbox-epsg-3857%7D", "BBOX={bbox-epsg-3857}")}`;
  };
  const buildWmtsTileUrl = (overlay) => {
    if (overlay.tileTemplate) {
      return overlay.tileTemplate
        .replace(/\{TileMatrix\}/g, "{z}")
        .replace(/\{TileCol\}/g, "{x}")
        .replace(/\{TileRow\}/g, "{y}")
        .replace(/\{Style\}/g, overlay.style || "default")
        .replace(/\{TileMatrixSet\}/g, overlay.tileMatrixSet || "3857")
        .replace(/\{layer\}/g, overlay.layerId)
        .replace(/\{Layer\}/g, overlay.layerId);
    }
    const base = toServiceBaseUrl(overlay.capabilitiesUrl || "");
    const q = new URLSearchParams();
    q.set("SERVICE", "WMTS");
    q.set("REQUEST", "GetTile");
    q.set("VERSION", "1.0.0");
    q.set("LAYER", overlay.layerId);
    q.set("STYLE", overlay.style || "default");
    q.set("FORMAT", overlay.format || "image/png");
    q.set("TILEMATRIXSET", overlay.tileMatrixSet || "3857");
    q.set("TILEMATRIX", "{z}");
    q.set("TILEROW", "{y}");
    q.set("TILECOL", "{x}");
    return `${base}?${q
      .toString()
      .replace("TILEMATRIX=%7Bz%7D", "TILEMATRIX={z}")
      .replace("TILEROW=%7By%7D", "TILEROW={y}")
      .replace("TILECOL=%7Bx%7D", "TILECOL={x}")}`;
  };

  const overlaySourceId = (overlay) => `ogc-src-${overlay.id}`;
  const overlayLayerId = (overlay) => `ogc-lyr-${overlay.id}`;
  moduleState.ogcState = moduleState.ogcState || {};
  const ogcState = moduleState.ogcState;
  ogcState.overlays = ogcState.overlays || [];

  const emitChange = () => {
    window.dispatchEvent(
      new CustomEvent("vectormap:ogc-overlays-change", {
        detail: { overlays: ogcState.overlays.slice() }
      })
    );
  };
  const getOverlayTargets = (overlay) => {
    const raw = Array.isArray(overlay?.targetContainerIds) ? overlay.targetContainerIds : [];
    const ids = raw.filter((id) => typeof id === "string" && id.trim());
    return ids.length ? ids : [...targetIds];
  };
  const isOverlayOnMap = (overlay, map) => getOverlayTargets(overlay).includes(mapId(map));

  const ensureOverlayOnMap = (map, overlay) => {
    const sid = overlaySourceId(overlay);
    const lid = overlayLayerId(overlay);
    if (!map.getSource(sid)) {
      map.addSource(sid, {
        type: "raster",
        tiles: [overlay.serviceType === "WMTS" ? buildWmtsTileUrl(overlay) : buildWmsTileUrl(overlay)],
        tileSize: 256
      });
    }
    if (!map.getLayer(lid)) {
      map.addLayer({
        id: lid,
        type: "raster",
        source: sid,
        paint: { "raster-opacity": normalizeOpacity(overlay.opacity) }
      });
    }
    map.setLayoutProperty(lid, "visibility", overlay.visible ? "visible" : "none");
    map.setPaintProperty(lid, "raster-opacity", normalizeOpacity(overlay.opacity));
  };
  const removeOverlayFromMap = (map, overlay) => {
    const sid = overlaySourceId(overlay);
    const lid = overlayLayerId(overlay);
    if (map.getLayer(lid)) {
      map.removeLayer(lid);
    }
    if (map.getSource(sid)) {
      map.removeSource(sid);
    }
  };
  const applyOrder = (map) => {
    for (let i = ogcState.overlays.length - 1; i >= 0; i -= 1) {
      const lid = overlayLayerId(ogcState.overlays[i]);
      if (map.getLayer(lid)) {
        map.moveLayer(lid);
      }
    }
  };
  const applyAll = () => {
    getTargetMaps().forEach((map) => {
      ogcState.overlays.forEach((overlay) => {
        try {
          if (isOverlayOnMap(overlay, map)) {
            ensureOverlayOnMap(map, overlay);
          } else {
            removeOverlayFromMap(map, overlay);
          }
        } catch (error) {
          console.warn("OGC overlay konnte nicht angewendet werden.", error);
        }
      });
      applyOrder(map);
    });
  };

  const encodeOverlay = (overlay) =>
    `ogc:${toBase64(
      JSON.stringify({
        id: overlay.id,
        title: overlay.title,
        metadataUrl: overlay.metadataUrl || "",
        serviceType: overlay.serviceType,
        layerId: overlay.layerId,
        capabilitiesUrl: overlay.capabilitiesUrl,
        format: overlay.format,
        style: overlay.style,
        tileTemplate: overlay.tileTemplate,
        tileMatrixSet: overlay.tileMatrixSet,
        targetContainerIds: getOverlayTargets(overlay),
        opacity: normalizeOpacity(overlay.opacity),
        visible: overlay.visible !== false
      })
    )}`;
  const decodeOverlay = (value) => {
    if (typeof value !== "string" || !value.startsWith("ogc:")) {
      return null;
    }
    try {
      const parsed = JSON.parse(fromBase64(value.slice(4)));
      if (!parsed?.layerId || !parsed?.serviceType || !parsed?.capabilitiesUrl) {
        return null;
      }
      return {
        ...parsed,
        opacity: normalizeOpacity(parsed.opacity),
        visible: parsed.visible !== false
      };
    } catch (error) {
      return null;
    }
  };

  ogcState.serializeOverlayIds = () => ogcState.overlays.map(encodeOverlay);
  ogcState.getOverlays = () => ogcState.overlays.slice();
  ogcState.addOverlay = (overlay) => {
    const idx = ogcState.overlays.findIndex((x) => x.id === overlay.id);
    const next = {
      ...overlay,
      opacity: normalizeOpacity(overlay.opacity),
      visible: overlay.visible !== false
    };
    if (idx >= 0) {
      ogcState.overlays[idx] = next;
    } else {
      ogcState.overlays.push(next);
    }
    applyAll();
    emitChange();
  };
  ogcState.removeOverlay = (overlayId) => {
    const ov = ogcState.overlays.find((x) => x.id === overlayId);
    if (!ov) {
      return;
    }
    getTargetMaps().forEach((map) => removeOverlayFromMap(map, ov));
    ogcState.overlays = ogcState.overlays.filter((x) => x.id !== overlayId);
    applyAll();
    emitChange();
  };
  ogcState.reorderOverlays = (orderedIds) => {
    const order = new Map();
    orderedIds.forEach((id, i) => order.set(id, i));
    ogcState.overlays.sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
    applyAll();
    emitChange();
  };
  ogcState.updateOverlayVisibility = (overlayId, visible) => {
    const idx = ogcState.overlays.findIndex((x) => x.id === overlayId);
    if (idx < 0) {
      return;
    }
    ogcState.overlays[idx] = { ...ogcState.overlays[idx], visible: Boolean(visible) };
    applyAll();
    emitChange();
  };
  ogcState.updateOverlayOpacity = (overlayId, opacity) => {
    const idx = ogcState.overlays.findIndex((x) => x.id === overlayId);
    if (idx < 0) {
      return;
    }
    ogcState.overlays[idx] = { ...ogcState.overlays[idx], opacity: normalizeOpacity(opacity) };
    applyAll();
    emitChange();
  };

  const restoreOverlaysFromUrl = () => {
    const parsed = moduleState.urlState?.parse?.(window.location.search);
    const values = Array.isArray(parsed?.overlayIds) ? parsed.overlayIds : [];
    values.forEach((value) => {
      const ov = decodeOverlay(value);
      if (ov) {
        ogcState.addOverlay(ov);
      }
    });
  };

  const ensureStyle = () => {
    if (document.getElementById("vectormap-ogc-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "vectormap-ogc-style";
    style.textContent = `
      .vectormap-ogc-ctrl { position: relative; display: block; margin-bottom: 8px; }
      .vectormap-ogc-toggle.maplibregl-ctrl-icon { position: relative; background-image: none; }
      .vectormap-ogc-toggle.maplibregl-ctrl-icon::after { content: ""; position: absolute; inset: 6px; background: center/14px 14px no-repeat url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2317302a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='6'/><path d='M20 20l-4-4'/></svg>"); }
      .vectormap-ogc-panel { position: absolute; right: calc(100% + 10px); top: -1px; width: min(90vw, 440px); max-height: min(74vh, 700px); overflow: hidden; display: none; z-index: 3; border: 1px solid rgba(0,0,0,.12); border-radius: 12px; background: rgba(255,255,255,.82); backdrop-filter: blur(3px); box-shadow: 0 16px 30px rgba(0,0,0,.2); padding: 10px; }
      .vectormap-ogc-ctrl.is-open .vectormap-ogc-panel { display: block; }
      .vectormap-ogc-body { display: flex; flex-direction: column; gap: 6px; height: 100%; max-height: calc(min(74vh, 700px) - 20px); }
      .vectormap-ogc-search-top { flex: 0 0 auto; }
      .vectormap-ogc-service-results { flex: 1 1 auto; min-height: 120px; overflow: auto; padding-right: 2px; }
      .vectormap-ogc-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; margin: 6px 0; }
      .vectormap-ogc-input { min-width: 0; height: 34px; border: 1px solid #b8d4cb; border-radius: 9px; padding: 0 10px; font: 13px/1.2 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-btn { height: 34px; border-radius: 9px; border: 1px solid #8cc9c4; background: #fff; color: #0f4e4b; padding: 0 10px; font: 600 12px/1.2 "Segoe UI", Arial, sans-serif; cursor: pointer; width: auto; min-width: 0; }
      .vectormap-ogc-btn--primary { background: #fff; border-color: #8cc9c4; color: #0f4e4b; }
      .vectormap-ogc-options { display: flex; gap: 8px; margin-top: 6px; align-items: center; flex-wrap: wrap; }
      .vectormap-ogc-options label { display: inline-flex; align-items: center; gap: 6px; font: 12px/1.2 "Segoe UI", Arial, sans-serif; color: #2f5f55; }
      .vectormap-ogc-status { margin-top: 8px; font: 12px/1.3 "Segoe UI", Arial, sans-serif; color: #2f5f55; }
      .vectormap-ogc-list { display: grid; gap: 6px; margin: 6px 0; }
      .vectormap-ogc-item { border: 1px solid #d2e7df; border-radius: 10px; background: rgba(255,255,255,.9); padding: 7px; transition: border-color .15s ease, box-shadow .15s ease; }
      .vectormap-ogc-item:hover { border-color: #4ea48f; box-shadow: 0 0 0 1px rgba(78,164,143,.35); }
      .vectormap-ogc-title { font: 700 12px/1.3 "Segoe UI", Arial, sans-serif; color: #103a31; }
      .vectormap-ogc-meta { margin-top: 3px; color: #4d6e63; font: 11px/1.35 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
      .vectormap-ogc-actions .vectormap-ogc-btn { height: 38px; padding: 0 12px; font: 600 13px/1.2 "Segoe UI", Arial, sans-serif; white-space: nowrap; width: fit-content; min-width: max-content; flex: 0 0 auto; }
      .vectormap-ogc-tag { display: inline-block; margin-top: 6px; padding: 2px 7px; border-radius: 999px; background: #ecf7f3; color: #24584b; font: 600 10px/1.2 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-services { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .vectormap-ogc-service-badge { border-radius: 999px; padding: 2px 8px; font: 600 10px/1.2 "Segoe UI", Arial, sans-serif; border: 1px solid #b7d8cf; background: #f0faf6; color: #1f5b4d; }
      .vectormap-ogc-active { flex: 0 0 auto; margin-top: 2px; border-top: 1px solid rgba(0,0,0,.08); padding-top: 8px; }
      .vectormap-ogc-active-title { margin: 0 0 5px; font: 700 12px/1.2 "Segoe UI", Arial, sans-serif; color: #153e34; }
      .vectormap-ogc-layer-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; border: 1px solid #d7e8e1; border-radius: 8px; padding: 4px 6px; background: rgba(255,255,255,.92); }
      .vectormap-ogc-layer-row span { font: 12px/1.2 "Segoe UI", Arial, sans-serif; color: #173e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vectormap-ogc-layer-row button { width: 28px; height: 24px; border: 1px solid #bad8cf; border-radius: 6px; background: #fff; color: #1b584c; cursor: pointer; font: 600 10px/1 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-layer-row input[type='range'] { grid-column: 1 / -1; width: 100%; accent-color: #00a7b3; }
      @media (max-width: 760px) {
        .vectormap-ogc-panel { position: fixed; right: 10px; left: 10px; top: 66px; width: auto; max-height: 72vh; }
        .vectormap-ogc-row { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  };

  const overlayFromLayer = (layer, capabilitiesUrl, metadataUrl, map) => ({
    id: slug(`${layer.serviceType}|${capabilitiesUrl}|${layer.layerId}`),
    title: layer.title || layer.layerId,
    metadataUrl: safeText(metadataUrl || ""),
    serviceType: layer.serviceType,
    layerId: layer.layerId,
    capabilitiesUrl,
    format: layer.format || "image/png",
    style: layer.style || "default",
    tileTemplate: layer.tileTemplate || "",
    tileMatrixSet: layer.tileMatrixSet || "3857",
    targetContainerIds: [mapId(map)].filter(Boolean),
    opacity: 1,
    visible: true
  });

  const createSearchControl = () => {
    let lastQuery = "";
    let searchDebounceTimer = null;
    let activeSearchController = null;
    let isPanelOpen = false;
    let maybeAutoRefresh = () => {};
    let renderActiveLayers = () => {};
    let clearHoverGeometry = () => {};
    return ({
    onAdd(map) {
      const root = document.createElement("div");
      root.className = "maplibregl-ctrl maplibregl-ctrl-group vectormap-ogc-ctrl";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "maplibregl-ctrl-icon vectormap-ogc-toggle";
      toggle.title = settings.title;
      toggle.setAttribute("aria-label", settings.title);

      const panel = document.createElement("div");
      panel.className = "vectormap-ogc-panel";
      panel.innerHTML = `
        <div class="vectormap-ogc-body">
          <div class="vectormap-ogc-search-top">
            <div class="vectormap-ogc-head">
              <h4>${safeText(settings.panelTitle)}</h4>
              <p style="margin:4px 0 0;font:12px/1.3 'Segoe UI',Arial,sans-serif;color:#36554b;">Suche in geocat.ch oder lade eine WMS/WMTS-URL direkt.</p>
            </div>
            <div class="vectormap-ogc-row">
              <input type="text" class="vectormap-ogc-input" placeholder="${safeText(settings.searchPlaceholder)}" />
              <button type="button" class="vectormap-ogc-btn vectormap-ogc-btn--primary vectormap-ogc-search">In geocat suchen</button>
              <button type="button" class="vectormap-ogc-btn vectormap-ogc-add-service">GetCapabilities laden</button>
            </div>
            <div class="vectormap-ogc-options">
              <label><input type="checkbox" class="vectormap-ogc-use-bbox" /> Nur aktueller Kartenausschnitt</label>
            </div>
            <div class="vectormap-ogc-status">Bereit.</div>
          </div>
          <div class="vectormap-ogc-service-results">
            <div class="vectormap-ogc-list vectormap-ogc-records"></div>
            <div class="vectormap-ogc-list vectormap-ogc-layers"></div>
          </div>
          <div class="vectormap-ogc-active">
            <div class="vectormap-ogc-active-title">Aktive Layer</div>
            <div class="vectormap-ogc-list vectormap-ogc-active-layers"></div>
          </div>
        </div>
      `;

      const inputEl = panel.querySelector(".vectormap-ogc-input");
      const searchBtn = panel.querySelector(".vectormap-ogc-search");
      const addBtn = panel.querySelector(".vectormap-ogc-add-service");
      const statusEl = panel.querySelector(".vectormap-ogc-status");
      const bboxEl = panel.querySelector(".vectormap-ogc-use-bbox");
      const recordsEl = panel.querySelector(".vectormap-ogc-records");
      const layersEl = panel.querySelector(".vectormap-ogc-layers");
      const activeEl = panel.querySelector(".vectormap-ogc-active-layers");
      const hoverSourceId = `ogc-hover-src-${mapId(map) || "map"}`;
      const hoverFillLayerId = `ogc-hover-fill-${mapId(map) || "map"}`;
      const hoverLayerId = `ogc-hover-lyr-${mapId(map) || "map"}`;
      const setStatus = (text) => {
        statusEl.textContent = text;
      };
      const ensureHoverLayer = () => {
        if (!map.getSource(hoverSourceId)) {
          map.addSource(hoverSourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] }
          });
        }
        if (!map.getLayer(hoverFillLayerId)) {
          map.addLayer({
            id: hoverFillLayerId,
            type: "fill",
            source: hoverSourceId,
            paint: {
              "fill-color": "#1e9f6e",
              "fill-opacity": 0.18
            }
          });
        }
        if (!map.getLayer(hoverLayerId)) {
          map.addLayer({
            id: hoverLayerId,
            type: "line",
            source: hoverSourceId,
            paint: {
              "line-color": "#0d8d73",
              "line-width": 2,
              "line-opacity": 0.9
            }
          });
        }
      };
      clearHoverGeometry = () => {
        const source = map.getSource(hoverSourceId);
        if (source) {
          source.setData({ type: "FeatureCollection", features: [] });
        }
      };
      const showHoverGeometry = (geometry) => {
        if (!geometry) {
          clearHoverGeometry();
          return;
        }
        ensureHoverLayer();
        const source = map.getSource(hoverSourceId);
        source?.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry, properties: {} }]
        });
      };
      renderActiveLayers = () => {
        activeEl.innerHTML = "";
        const overlays = ogcState.getOverlays().filter((overlay) => isOverlayOnMap(overlay, map));
        if (!overlays.length) {
          const empty = document.createElement("div");
          empty.className = "vectormap-ogc-meta";
          empty.textContent = "Keine aktiven Layer.";
          activeEl.appendChild(empty);
          return;
        }
        overlays.forEach((overlay) => {
          const row = document.createElement("div");
          row.className = "vectormap-ogc-layer-row";
          const label = document.createElement("span");
          label.textContent = overlay.title || overlay.layerId;
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.title = overlay.visible ? "Layer ausblenden" : "Layer einblenden";
          toggleBtn.textContent = overlay.visible ? "AN" : "AUS";
          toggleBtn.addEventListener("click", () => ogcState.updateOverlayVisibility(overlay.id, !overlay.visible));
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.title = "Layer entfernen";
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => ogcState.removeOverlay(overlay.id));
          const opacity = document.createElement("input");
          opacity.type = "range";
          opacity.min = "0";
          opacity.max = "1";
          opacity.step = "0.05";
          opacity.value = String(normalizeOpacity(overlay.opacity));
          opacity.title = "Transparenz";
          opacity.addEventListener("pointerdown", (event) => event.stopPropagation());
          opacity.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
          opacity.addEventListener("input", () => ogcState.updateOverlayOpacity(overlay.id, opacity.value));
          row.append(label, toggleBtn, removeBtn, opacity);
          activeEl.appendChild(row);
        });
      };
      renderActiveLayers();
      window.addEventListener("vectormap:ogc-overlays-change", renderActiveLayers);
      const addOverlay = (layer, capabilitiesUrl, metadataUrl) => {
        ogcState.addOverlay(overlayFromLayer(layer, capabilitiesUrl, metadataUrl, map));
      };

      const renderLayerList = (parsed, capabilitiesUrl, metadataUrl) => {
        layersEl.innerHTML = "";
        const summary = document.createElement("div");
        summary.className = "vectormap-ogc-meta";
        summary.textContent = `${parsed.layers.length} Layer verfügbar (${parsed.serviceType}).`;
        layersEl.appendChild(summary);
        const actions = document.createElement("div");
        actions.className = "vectormap-ogc-actions";
        const addAll = document.createElement("button");
        addAll.type = "button";
        addAll.className = "vectormap-ogc-btn";
        addAll.textContent = "Alle Layer hinzufügen";
        addAll.addEventListener("click", () => {
          parsed.layers.forEach((layer) => addOverlay(layer, capabilitiesUrl, metadataUrl));
          setStatus(`${parsed.layers.length} Layer hinzugefügt.`);
        });
        actions.appendChild(addAll);
        layersEl.appendChild(actions);

        parsed.layers.forEach((layer) => {
          const item = document.createElement("div");
          item.className = "vectormap-ogc-item";
          const title = document.createElement("div");
          title.className = "vectormap-ogc-title";
          title.textContent = layer.title || layer.layerId;
          const meta = document.createElement("div");
          meta.className = "vectormap-ogc-meta";
          meta.textContent = `${layer.serviceType} | ${layer.layerId}`;
          const actionsRow = document.createElement("div");
          actionsRow.className = "vectormap-ogc-actions";
          const one = document.createElement("button");
          one.type = "button";
            one.className = "vectormap-ogc-btn";
            one.textContent = safeText(settings.addLayerButtonLabel);
            one.addEventListener("click", () => {
              addOverlay(layer, capabilitiesUrl, metadataUrl);
            setStatus(`Hinzugefügt: ${layer.title || layer.layerId}`);
          });
          actionsRow.appendChild(one);
          item.append(title, meta, actionsRow);
          layersEl.appendChild(item);
        });
      };

      const loadCapabilities = async (url, metadataUrl = "") => {
        const capUrl = safeText(url);
        if (!capUrl) {
          setStatus("Bitte gültige Service-URL eingeben.");
          return;
        }
        layersEl.innerHTML = "";
        setStatus("Lade GetCapabilities...");
        try {
          const parsed = await parseCapabilities(capUrl);
          if (!parsed.layers.length) {
            setStatus("Keine Layer im Dienst gefunden.");
            return;
          }
          renderLayerList(parsed, capUrl, metadataUrl);
          setStatus(`${parsed.layers.length} Layer geladen.`);
        } catch (error) {
          console.error(error);
          setStatus(`Dienstfehler: ${error.message}`);
        }
      };

      const renderRecords = (records, context = {}) => {
        recordsEl.innerHTML = "";
        layersEl.innerHTML = "";
        if (!records.length) {
          setStatus(
            context.useMapBbox
              ? "Keine OGC-fähigen Datensätze im aktuellen Kartenausschnitt gefunden."
              : "Keine OGC-fähigen Datensätze gefunden."
          );
          return;
        }
        records.forEach((record) => {
          const candidates = extractCapabilitiesCandidates(record);
          if (!candidates.length) {
            return;
          }
          const loadable = pickLoadableCandidate(candidates);
          const item = document.createElement("div");
          item.className = "vectormap-ogc-item";
          const title = document.createElement("div");
          title.className = "vectormap-ogc-title";
          title.textContent = record.title || "Ohne Titel";
          const meta = document.createElement("div");
          meta.className = "vectormap-ogc-meta";
          meta.textContent = [record.organization ? `Herausgeber: ${record.organization}` : "", record.abstract]
            .filter(Boolean)
            .join(" | ");
          const tag = document.createElement("span");
          tag.className = "vectormap-ogc-tag";
          tag.textContent = `${candidates.length} Service-Link${candidates.length > 1 ? "s" : ""}`;
          const services = document.createElement("div");
          services.className = "vectormap-ogc-services";
          [...new Set(candidates.map((x) => x.serviceType))].forEach((serviceType) => {
            const badge = document.createElement("span");
            badge.className = "vectormap-ogc-service-badge";
            badge.textContent = serviceType;
            services.appendChild(badge);
          });
          const actions = document.createElement("div");
          actions.className = "vectormap-ogc-actions";

          const list = document.createElement("button");
          list.type = "button";
          list.className = "vectormap-ogc-btn";
          list.textContent = "Layer prüfen";
          list.disabled = !loadable;
          list.addEventListener("click", () => {
            if (loadable) {
              void loadCapabilities(loadable.url, record.metadataUrl);
            }
          });
          const addService = document.createElement("button");
          addService.type = "button";
          addService.className = "vectormap-ogc-btn";
          addService.textContent = "Alle Layer hinzufügen";
          addService.disabled = !loadable;
          addService.addEventListener("click", async () => {
            if (!loadable) {
              setStatus("Für diesen Dienst ist aktuell nur die Typ-Erkennung verfügbar.");
              return;
            }
            try {
              const parsed = await parseCapabilities(loadable.url);
              parsed.layers.forEach((layer) => addOverlay(layer, loadable.url, record.metadataUrl));
              setStatus(`${parsed.layers.length} Layer hinzugefügt.`);
            } catch (error) {
              console.error(error);
              setStatus(`Dienstfehler: ${error.message}`);
            }
          });

          const metaBtn = document.createElement("button");
          metaBtn.type = "button";
          metaBtn.className = "vectormap-ogc-btn";
          metaBtn.textContent = "Metadaten";
          metaBtn.disabled = !record.metadataUrl;
          metaBtn.addEventListener("click", () => {
            if (record.metadataUrl) {
              window.open(record.metadataUrl, "_blank", "noopener");
            }
          });
          actions.append(list, addService, metaBtn);
          item.append(title, meta, tag, services, actions);
          item.addEventListener("mouseenter", () => showHoverGeometry(record.extentGeometry));
          item.addEventListener("mouseleave", clearHoverGeometry);
          recordsEl.appendChild(item);
        });
        setStatus(`${records.length} OGC-fähige Datensätze gefunden.`);
      };

      const runSearch = async (opts = {}) => {
        if (!settings.geocat?.enabled) {
          setStatus("Katalogsuche ist deaktiviert.");
          return;
        }
        const query = safeText(inputEl.value);
        if (!query) {
          setStatus("Bitte Suchbegriff eingeben.");
          return;
        }
        lastQuery = query;
        const useMapBbox = Boolean(bboxEl?.checked);
        const isAuto = opts.trigger === "auto";
        if (!isAuto) {
          setStatus("Suche in geocat.ch läuft...");
        }
        if (activeSearchController) {
          activeSearchController.abort();
        }
        activeSearchController = new AbortController();
        try {
          const records = await discoverGeocat(query, map, {
            useMapBbox,
            signal: activeSearchController.signal
          });
          renderRecords(records, { useMapBbox });
          if (isAuto) {
            setStatus(`${records.length} Treffer aktualisiert (${useMapBbox ? "mit BBox" : "ohne BBox"}).`);
          }
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }
          console.error(error);
          setStatus(`${error.message} Du kannst direkt eine WMS/WMTS-URL laden.`);
        } finally {
          activeSearchController = null;
        }
      };
      const scheduleSearch = (opts = {}) => {
        if (searchDebounceTimer) {
          window.clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = window.setTimeout(
          () => void runSearch(opts),
          Math.max(0, Number(settings.searchDebounceMs) || 0)
        );
      };
      maybeAutoRefresh = () => {
        if (!isPanelOpen || !lastQuery) {
          return;
        }
        scheduleSearch({ trigger: "auto" });
      };
      const runManualAdd = async () => {
        const url = safeText(inputEl.value);
        if (!/^https?:\/\//i.test(url)) {
          setStatus("Bitte gültige WMS/WMTS-URL eingeben.");
          return;
        }
        recordsEl.innerHTML = "";
        await loadCapabilities(url);
      };

      toggle.addEventListener("click", () => {
        const open = !root.classList.contains("is-open");
        root.classList.toggle("is-open", open);
        isPanelOpen = open;
        if (open) {
          inputEl.focus();
        }
      });
      panel.addEventListener("click", (event) => event.stopPropagation());
      document.addEventListener("click", (event) => {
        if (!root.contains(event.target)) {
          root.classList.remove("is-open");
          isPanelOpen = false;
        }
      });
      bboxEl?.addEventListener("change", () => {
        if (lastQuery) {
          scheduleSearch({ trigger: "auto" });
        }
      });
      searchBtn.addEventListener("click", () => void runSearch());
      addBtn.addEventListener("click", () => void runManualAdd());
      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        if (/^https?:\/\//i.test(safeText(inputEl.value))) {
          void runManualAdd();
        } else {
          void runSearch();
        }
      });
      map.on("moveend", maybeAutoRefresh);
      map.on("zoomend", maybeAutoRefresh);

      root.append(toggle, panel);
      return root;
    },
    onRemove(map) {
      if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
      }
      if (activeSearchController) {
        activeSearchController.abort();
      }
      window.removeEventListener("vectormap:ogc-overlays-change", renderActiveLayers);
      clearHoverGeometry();
      map?.off?.("moveend", maybeAutoRefresh);
      map?.off?.("zoomend", maybeAutoRefresh);
    }
  });
  };

  const appliesTo = (map) => targetIds.has(mapId(map));
  ensureStyle();
  baseMap.registerControl({
    key: "ogc",
    position: settings.position,
    applyTo: appliesTo,
    create: createSearchControl
  });

  restoreOverlaysFromUrl();
  window.addEventListener("vectormap:maps-ready", applyAll);
  window.setTimeout(applyAll, 1200);
})();
