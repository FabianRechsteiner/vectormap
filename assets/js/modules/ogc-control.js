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
    layerSearchPlaceholder: "Layer im Dienst filtern",
    addServiceButtonLabel: "Dienst laden",
    addLayerButtonLabel: "Layer hinzufügen",
    requestTimeoutMs: 12000,
    searchDebounceMs: 400,
    maxCatalogResults: 15,
    maxLayerResults: 120,
    geocat: {
      enabled: true,
      searchEndpoint: "https://www.geocat.ch/geonetwork/srv/api/search/records/_search",
      groupEndpoint: "https://www.geocat.ch/geonetwork/srv/api/groups"
    }
  };

  const settings = {
    ...defaults,
    ...config,
    geocat: { ...defaults.geocat, ...(config.geocat || {}) }
  };
  const featureCursorUrl = new URL(
    "../../../assets/images/cursor_vectormap.png",
    document.currentScript?.src || window.location.href
  ).href;
  const featureCursor = `url("${featureCursorUrl}") 16 31, pointer`;

  const targetIds = new Set(
    (Array.isArray(settings.mapContainerIds) ? settings.mapContainerIds : [])
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
  );
  const safeText = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const sanitizeHtml = (input) => {
    const raw = String(input || "");
    if (!raw) {
      return "";
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${raw}</div>`, "text/html");
    const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "P", "BR", "UL", "OL", "LI", "A"]);
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    const remove = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!allowedTags.has(el.tagName)) {
        remove.push(el);
        continue;
      }
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (el.tagName === "A" && (name === "href" || name === "target" || name === "rel")) {
          return;
        }
        el.removeAttribute(attr.name);
      });
      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) {
          el.removeAttribute("href");
        } else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener");
        }
      }
    }
    remove.forEach((el) => el.replaceWith(...el.childNodes));
    return doc.body.innerHTML;
  };
  const groupNameCache = new Map();
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
  const hashString = (value) => {
    const input = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
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
  const looksLikeCapabilitiesInput = (value) => {
    const raw = safeText(value);
    if (!raw || !/^https?:\/\//i.test(raw)) {
      return false;
    }
    return (
      /getcapabilities/i.test(raw) ||
      /service=(wms|wmts|wfs)/i.test(raw) ||
      /wms\b/i.test(raw) ||
      /wmts\b/i.test(raw) ||
      /WMTSCapabilities\.xml/i.test(raw)
    );
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

  const parseWmsQueryable = (node, inherited = false) => {
    if (!node) {
      return inherited;
    }
    const attr = safeText(node.getAttribute("queryable"));
    if (!attr) {
      return inherited;
    }
    return attr === "1" || /^true$/i.test(attr);
  };
  const extractWmsInfoFormats = (xml) =>
    [...xml.querySelectorAll("Request > GetFeatureInfo > Format, Capability > Request > GetFeatureInfo > Format")]
      .map((node) => safeText(node.textContent))
      .filter(Boolean);
  const extractWmsLayers = (xml) => {
    const root =
      xml.querySelector("WMS_Capabilities > Capability > Layer, Capability > Layer") || null;
    const seen = new Set();
    const out = [];
    const walk = (node, inheritedQueryable = false) => {
      if (!node || out.length >= settings.maxLayerResults) {
        return;
      }
      const queryable = parseWmsQueryable(node, inheritedQueryable);
      const directName = [...node.children].find((child) => /:?(Name)$/i.test(child.tagName));
      const directTitle = [...node.children].find((child) => /:?(Title)$/i.test(child.tagName));
      const directAbstract = [...node.children].find((child) => /:?(Abstract)$/i.test(child.tagName));
      const layerId = safeText(directName?.textContent || "");
      if (layerId && !seen.has(layerId)) {
        seen.add(layerId);
        out.push({
          serviceType: "WMS",
          layerId,
          title: safeText(directTitle?.textContent || "") || layerId,
          abstract: safeText(directAbstract?.textContent || ""),
          format: "image/png",
          queryable
        });
      }
      [...node.children]
        .filter((child) => /:?(Layer)$/i.test(child.tagName))
        .forEach((child) => walk(child, queryable));
    };
    walk(root, false);
    return out.slice(0, settings.maxLayerResults);
  };
  const extractWmsServiceLayerId = (xml) =>
    safeText(
      xml.querySelector("Capability > Layer > Name, WMS_Capabilities > Capability > Layer > Name")
        ?.textContent || ""
    );

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
        return {
          serviceType: "WMS",
          layers: extractWmsLayers(xml),
          serviceLayerId: extractWmsServiceLayerId(xml),
          queryable: parseWmsQueryable(
            xml.querySelector("WMS_Capabilities > Capability > Layer, Capability > Layer"),
            false
          ),
          infoFormats: extractWmsInfoFormats(xml),
          version:
            safeText(
              xml.querySelector("WMS_Capabilities, WMT_MS_Capabilities")?.getAttribute("version")
            ) || "1.1.1"
        };
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
      .filter((link) => link.serviceType === "WMS")
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
  const resolveGroupOwnerName = async (groupOwnerId) => {
    const id = safeText(groupOwnerId);
    if (!id) {
      return "";
    }
    if (groupNameCache.has(id)) {
      return groupNameCache.get(id);
    }
    try {
      const endpoint = `${String(settings.geocat.groupEndpoint || "").replace(/\/+$/, "")}/${encodeURIComponent(id)}`;
      const res = await fetchWithTimeout(endpoint, {
        headers: { accept: "application/json" }
      });
      if (!res.ok) {
        groupNameCache.set(id, id);
        return id;
      }
      const data = await res.json();
      const name =
        safeText(data?.label?.ger) ||
        safeText(data?.label?.deu) ||
        safeText(data?.label?.default) ||
        safeText(data?.name) ||
        id;
      groupNameCache.set(id, name);
      return name;
    } catch (error) {
      groupNameCache.set(id, id);
      return id;
    }
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
        abstractHtml:
          String(src?.resourceAbstractObject?.default || "") ||
          String(src?.abstract || "") ||
          String(src?.description || ""),
        organization: safeText(
          src?.OrgForResource ||
            src?.orgName ||
            src?.organisation ||
            src?.contactOrg ||
            src?.ownername
        ),
        groupOwner: safeText(src?.groupOwner),
        groupOwnerName: "",
        metadataUrl: buildMetadataUrl(id),
        links,
        extentGeometry: pickRecordExtent(src)
      };
    });
    const ownerIds = [...new Set(mapped.map((r) => safeText(r.groupOwner)).filter(Boolean))];
    const ownerNameMap = new Map();
    await Promise.all(
      ownerIds.map(async (id) => {
        ownerNameMap.set(id, await resolveGroupOwnerName(id));
      })
    );
    return mapped
      .map((record) => ({
        ...record,
        groupOwnerName: ownerNameMap.get(record.groupOwner) || record.groupOwner || ""
      }))
      .filter((record) => extractCapabilitiesCandidates(record).length > 0);
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
  moduleState.ogcInteractionState = moduleState.ogcInteractionState || {
    popup: null,
    popupOverlayIds: [],
    popupMap: null
  };
  const ogcInteractionState = moduleState.ogcInteractionState;

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
  const getInteractiveOverlays = (map) =>
    ogcState.overlays.filter(
      (overlay) =>
        overlay.visible !== false &&
        overlay.serviceType === "WMS" &&
        overlay.queryable === true &&
        isOverlayOnMap(overlay, map)
    );

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

  const closeFeaturePopup = () => {
    const popup = ogcInteractionState.popup;
    ogcInteractionState.popup = null;
    ogcInteractionState.popupOverlayIds = [];
    ogcInteractionState.popupMap = null;
    if (popup) {
      popup.remove();
    }
  };
  const syncFeaturePopupVisibility = () => {
    if (!ogcInteractionState.popupOverlayIds.length) {
      return;
    }
    const allPopupOverlaysUsable = ogcInteractionState.popupOverlayIds.every((overlayId) => {
      const overlay = ogcState.overlays.find((candidate) => candidate.id === overlayId);
      return (
        overlay &&
        overlay.visible !== false &&
        (!ogcInteractionState.popupMap || isOverlayOnMap(overlay, ogcInteractionState.popupMap))
      );
    });
    if (!allPopupOverlaysUsable) {
      closeFeaturePopup();
    }
  };
  const chooseInfoFormat = (overlay) => {
    const formats = Array.isArray(overlay.infoFormats) ? overlay.infoFormats : [];
    const preferred = [
      "application/json",
      "application/geo+json",
      "application/vnd.ogc.gml/3.1.1",
      "application/vnd.ogc.gml",
      "text/xml",
      "application/xml",
      "text/html",
      "text/plain"
    ];
    return preferred.find((format) => formats.includes(format)) || formats[0] || "application/json";
  };
  const projectBounds3857 = (map) => {
    const bounds = map.getBounds();
    const sw = maplibregl.MercatorCoordinate.fromLngLat(bounds.getSouthWest());
    const ne = maplibregl.MercatorCoordinate.fromLngLat(bounds.getNorthEast());
    const halfWorld = 20037508.342789244;
    return {
      minX: sw.x * 2 * halfWorld - halfWorld,
      minY: sw.y * -2 * halfWorld + halfWorld,
      maxX: ne.x * 2 * halfWorld - halfWorld,
      maxY: ne.y * -2 * halfWorld + halfWorld
    };
  };
  const buildFeatureInfoUrl = (overlay, map, point, options = {}) => {
    const base = toServiceBaseUrl(overlay.capabilitiesUrl || "");
    const width = Math.max(1, Math.round(map.getCanvas().clientWidth || map.getCanvas().width || 1));
    const height = Math.max(
      1,
      Math.round(map.getCanvas().clientHeight || map.getCanvas().height || 1)
    );
    const bbox = projectBounds3857(map);
    const version = overlay.version || "1.1.1";
    const isWms13 = /^1\.3(?:\.|$)/.test(version);
    const q = new URLSearchParams();
    q.set("SERVICE", "WMS");
    q.set("REQUEST", "GetFeatureInfo");
    q.set("VERSION", version);
    q.set("LAYERS", overlay.layerId);
    q.set("QUERY_LAYERS", overlay.layerId);
    q.set("STYLES", "");
    q.set("FORMAT", overlay.format || "image/png");
    q.set("TRANSPARENT", "true");
    q.set("FEATURE_COUNT", String(options.featureCount || 20));
    q.set(isWms13 ? "CRS" : "SRS", "EPSG:3857");
    q.set("BBOX", `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`);
    q.set("WIDTH", String(width));
    q.set("HEIGHT", String(height));
    q.set(isWms13 ? "I" : "X", String(Math.round(point.x)));
    q.set(isWms13 ? "J" : "Y", String(Math.round(point.y)));
    q.set("INFO_FORMAT", chooseInfoFormat(overlay));
    return `${base}?${q.toString()}`;
  };
  const formatFeatureValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }
    if (Array.isArray(value)) {
      return value.map(formatFeatureValue).filter(Boolean).join(", ");
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return String(value);
  };
  const normalizeFeatureAttributes = (properties) =>
    Object.entries(properties || {})
      .map(([key, value]) => [safeText(key), safeText(formatFeatureValue(value))])
      .filter(([key, value]) => key && value);
  const extractJsonFeatureInfo = (payload) => {
    if (Array.isArray(payload?.features)) {
      return payload.features.map((feature) => ({
        properties: feature?.properties || {},
        geometry: feature?.geometry || null
      }));
    }
    if (Array.isArray(payload?.results)) {
      return payload.results.map((item) => ({ properties: item || {}, geometry: null }));
    }
    if (Array.isArray(payload)) {
      return payload.map((item) => ({ properties: item || {}, geometry: null }));
    }
    if (payload && typeof payload === "object") {
      return [{ properties: payload, geometry: null }];
    }
    return [];
  };
  const isGeometryPropertyName = (name) =>
    /^(boundedBy|geom|geometry|the_geom|shape|point|linestring|polygon|multipoint|multilinestring|multipolygon|coordinates|pos|posList)$/i.test(
      safeText(name)
    );
  const collectXmlProperties = (node, properties, prefix = "") => {
    if (!node || isGeometryPropertyName(node.localName || node.tagName)) {
      return;
    }
    [...node.attributes].forEach((attr) => {
      if (/^xmlns/i.test(attr.name)) {
        return;
      }
      const key = prefix ? `${prefix}.${attr.name}` : attr.name;
      const value = safeText(attr.value);
      if (key && value) {
        properties[key] = value;
      }
    });
    const children = [...node.children].filter(
      (child) => !isGeometryPropertyName(child.localName || child.tagName)
    );
    if (!children.length) {
      const key = prefix || node.localName || node.tagName;
      const value = safeText(node.textContent);
      if (key && value) {
        properties[key] = value;
      }
      return;
    }
    children.forEach((child) => {
      const name = safeText(child.localName || child.tagName);
      const childElements = [...child.children].filter(
        (grandchild) => !isGeometryPropertyName(grandchild.localName || grandchild.tagName)
      );
      const value = safeText(child.textContent);
      if (!childElements.length && name && value) {
        properties[name] = value;
        return;
      }
      collectXmlProperties(child, properties, prefix && name ? `${prefix}.${name}` : name);
    });
  };
  const extractXmlFeatureInfo = (text) => {
    const xml = parseXml(text);
    const featureMembers = [
      ...xml.querySelectorAll(
        "featureMember, gml\\:featureMember, featureMembers > *, gml\\:featureMembers > *"
      )
    ];
    if (featureMembers.length) {
      return featureMembers
        .map((member) => {
          const properties = {};
          const isWrapper = /featureMember$/i.test(member.localName || member.tagName);
          const featureNode = isWrapper
            ? [...member.children].find(
                (child) => !isGeometryPropertyName(child.localName || child.tagName)
              ) || member
            : member;
          collectXmlProperties(featureNode, properties);
          return { properties, geometry: null };
        })
        .filter((feature) => normalizeFeatureAttributes(feature.properties).length);
    }
    return [...xml.querySelectorAll("FIELDS, FeatureInfo > *")]
      .map((node) => {
        const properties = {};
        [...node.attributes].forEach((attr) => {
          const value = safeText(attr.value);
          if (value) {
            properties[attr.name] = value;
          }
        });
        [...node.children].forEach((child) => {
          const value = safeText(child.textContent);
          if (value) {
            properties[child.localName || child.tagName] = value;
          }
        });
        return { properties, geometry: null };
      })
      .filter((feature) => normalizeFeatureAttributes(feature.properties).length);
  };
  const extractHtmlFeatureInfo = (text) => {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return [...doc.querySelectorAll("table")]
      .map((table) => {
        const properties = {};
        [...table.querySelectorAll("tr")].forEach((row) => {
          const cells = row.querySelectorAll("th,td");
          if (cells.length >= 2) {
            const key = safeText(cells[0].textContent);
            const value = safeText(cells[1].textContent);
            if (key && value) {
              properties[key] = value;
            }
          }
        });
        return { properties, geometry: null };
      })
      .filter((feature) => normalizeFeatureAttributes(feature.properties).length);
  };
  const parseFeatureInfoResponse = async (response) => {
    const contentType = safeText(response.headers.get("content-type")).toLowerCase();
    if (contentType.includes("json")) {
      return extractJsonFeatureInfo(await response.json());
    }
    const text = await response.text();
    if (/^\s*[{[]/.test(text)) {
      try {
        return extractJsonFeatureInfo(JSON.parse(text));
      } catch (error) {
        // Fall through to XML/HTML parsing.
      }
    }
    if (contentType.includes("html")) {
      return extractHtmlFeatureInfo(text);
    }
    const xmlFeatures = extractXmlFeatureInfo(text);
    return xmlFeatures.length ? xmlFeatures : extractHtmlFeatureInfo(text);
  };
  const queryFeatureInfoForOverlay = async (overlay, map, point, signal, options = {}) => {
    const response = await fetchWithTimeout(buildFeatureInfoUrl(overlay, map, point, options), {
      headers: {
        accept: `${chooseInfoFormat(overlay)},application/json,text/xml,text/html,*/*`
      },
      signal
    });
    if (!response.ok) {
      return [];
    }
    return (await parseFeatureInfoResponse(response))
      .map((feature) => ({
        overlay,
        properties: feature.properties || {},
        geometry: feature.geometry || null
      }))
      .filter((feature) => normalizeFeatureAttributes(feature.properties).length);
  };
  const createPopupContent = (hits) => {
    const root = document.createElement("div");
    root.className = "vectormap-ogc-popup";
    hits.forEach((hit) => {
      const section = document.createElement("section");
      section.className = "vectormap-ogc-popup-section";
      const heading = document.createElement(hit.overlay.metadataUrl ? "a" : "div");
      heading.className = "vectormap-ogc-popup-title";
      heading.textContent = hit.overlay.title || hit.overlay.layerId;
      if (hit.overlay.metadataUrl) {
        heading.href = hit.overlay.metadataUrl;
        heading.target = "_blank";
        heading.rel = "noopener";
      }
      const grid = document.createElement("div");
      grid.className = "vectormap-ogc-popup-grid";
      normalizeFeatureAttributes(hit.properties).forEach(([key, value]) => {
        const keyEl = document.createElement("div");
        keyEl.className = "vectormap-ogc-popup-key";
        keyEl.textContent = key;
        const valueEl = document.createElement("div");
        valueEl.className = "vectormap-ogc-popup-value";
        valueEl.textContent = String(value);
        grid.append(keyEl, valueEl);
      });
      section.append(heading, grid);
      root.appendChild(section);
    });
    return root;
  };
  const openFeaturePopup = (map, lngLat, hits) => {
    closeFeaturePopup();
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: "420px"
    })
      .setLngLat(lngLat)
      .setDOMContent(createPopupContent(hits))
      .addTo(map);
    ogcInteractionState.popup = popup;
    ogcInteractionState.popupMap = map;
    ogcInteractionState.popupOverlayIds = [...new Set(hits.map((hit) => hit.overlay.id))];
    popup.on("close", () => {
      if (ogcInteractionState.popup === popup) {
        closeFeaturePopup();
      }
    });
  };
  const setMapCursor = (map, isSelectable) => {
    const canvas = map?.getCanvas?.();
    const container = map?.getContainer?.();
    const canvasContainer = container?.querySelector?.(".maplibregl-canvas-container");
    if (!canvas || !container) {
      return;
    }
    container.classList.toggle("vectormap-ogc-feature-hover", isSelectable);
    canvasContainer?.classList.toggle("vectormap-ogc-feature-hover", isSelectable);
    if (isSelectable) {
      canvas.style.cursor = featureCursor;
      return;
    }
    if (canvas.style.cursor === featureCursor) {
      canvas.style.cursor = "";
    }
  };
  const clearMapHoverState = (map) => {
    setMapCursor(map, false);
  };
  const queryVisibleOverlayHits = async (map, point, signal, options = {}) => {
    const overlays = getInteractiveOverlays(map);
    if (!overlays.length) {
      return [];
    }
    const results = await Promise.all(
      overlays.map((overlay) =>
        queryFeatureInfoForOverlay(overlay, map, point, signal, {
          featureCount: options.featureCount || 20
        }).catch(() => [])
      )
    );
    return results.flat();
  };
  const bindFeatureInfoInteractions = (map) => {
    if (!appliesTo(map) || map.__vectormapOgcFeatureInfoBound) {
      return;
    }
    map.__vectormapOgcFeatureInfoBound = true;
    map.on("mousemove", () => {
      setMapCursor(map, getInteractiveOverlays(map).length > 0);
    });
    map.on("mouseleave", () => {
      clearMapHoverState(map);
    });
    map.on("click", async (event) => {
      clearMapHoverState(map);
      if (!getInteractiveOverlays(map).length) {
        closeFeaturePopup();
        return;
      }
      try {
        const controller = new AbortController();
        const hits = await queryVisibleOverlayHits(map, event.point, controller.signal);
        if (!hits.length) {
          closeFeaturePopup();
          return;
        }
        openFeaturePopup(map, event.lngLat, hits);
      } catch (error) {
        closeFeaturePopup();
      }
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
        abstract: overlay.abstract || "",
        format: overlay.format,
        style: overlay.style,
        tileTemplate: overlay.tileTemplate,
        tileMatrixSet: overlay.tileMatrixSet,
        version: overlay.version || "1.1.1",
        queryable: overlay.queryable === true,
        infoFormats: Array.isArray(overlay.infoFormats) ? overlay.infoFormats : [],
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
      visible: overlay.visible !== false,
      queryable: overlay.queryable === true,
      infoFormats: Array.isArray(overlay.infoFormats) ? overlay.infoFormats : [],
      version: overlay.version || "1.1.1"
    };
    if (idx >= 0) {
      ogcState.overlays[idx] = next;
    } else {
      ogcState.overlays.push(next);
    }
    applyAll();
    emitChange();
    syncFeaturePopupVisibility();
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
    syncFeaturePopupVisibility();
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
    syncFeaturePopupVisibility();
  };
  ogcState.updateOverlayVisibility = (overlayId, visible) => {
    const idx = ogcState.overlays.findIndex((x) => x.id === overlayId);
    if (idx < 0) {
      return;
    }
    ogcState.overlays[idx] = { ...ogcState.overlays[idx], visible: Boolean(visible) };
    applyAll();
    emitChange();
    syncFeaturePopupVisibility();
  };
  ogcState.updateOverlayOpacity = (overlayId, opacity, options = {}) => {
    const idx = ogcState.overlays.findIndex((x) => x.id === overlayId);
    if (idx < 0) {
      return;
    }
    ogcState.overlays[idx] = { ...ogcState.overlays[idx], opacity: normalizeOpacity(opacity) };
    applyAll();
    if (options.emitChange !== false) {
      emitChange();
    }
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
      .vectormap-ogc-toggle.maplibregl-ctrl-icon {
        position: relative;
        background-image: none;
      }
      .vectormap-ogc-toggle.maplibregl-ctrl-icon::after {
        content: "";
        position: absolute;
        inset: 0;
        margin: auto;
        width: 18px;
        height: 18px;
        background: center/18px 18px no-repeat url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231f1f1f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 8l8-4 8 4-8 4-8-4z'/><path d='M4 12l8 4 8-4'/><path d='M4 16l8 4 8-4'/></svg>");
      }
      .vectormap-ogc-toggle.maplibregl-ctrl-icon:hover,
      .vectormap-ogc-toggle.maplibregl-ctrl-icon:focus-visible {
        background-color: rgba(30, 122, 93, 0.08);
      }
      .vectormap-ogc-panel { position: absolute; right: calc(100% + 10px); top: -1px; width: min(90vw, 440px); max-height: min(74vh, 700px); overflow: hidden; display: none; z-index: 3; border: 1px solid rgba(0,0,0,.12); border-radius: 12px; background: rgba(255,255,255,.82); backdrop-filter: blur(3px); box-shadow: 0 16px 30px rgba(0,0,0,.2); padding: 10px; }
      .vectormap-ogc-ctrl.is-open .vectormap-ogc-panel { display: block; }
      .vectormap-ogc-body { display: flex; flex-direction: column; gap: 6px; height: 100%; max-height: calc(min(74vh, 700px) - 20px); }
      .vectormap-ogc-search-top { flex: 0 0 auto; }
      .vectormap-ogc-service-results { flex: 1 1 auto; min-height: 120px; overflow: auto; padding-right: 2px; }
      .vectormap-ogc-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin: 6px 0; }
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
      .vectormap-ogc-actions .vectormap-ogc-input { flex: 1 1 210px; min-width: 180px; }
      .vectormap-ogc-tag { display: inline-block; margin-top: 6px; padding: 2px 7px; border-radius: 999px; background: #ecf7f3; color: #24584b; font: 600 10px/1.2 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-services { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .vectormap-ogc-service-badge { border-radius: 999px; padding: 2px 8px; font: 600 10px/1.2 "Segoe UI", Arial, sans-serif; border: 1px solid #b7d8cf; background: #f0faf6; color: #1f5b4d; }
      .vectormap-ogc-active { flex: 0 0 auto; margin-top: 2px; border-top: 1px solid rgba(0,0,0,.08); padding-top: 8px; }
      .vectormap-ogc-active-title { margin: 0 0 5px; font: 700 12px/1.2 "Segoe UI", Arial, sans-serif; color: #153e34; }
      .vectormap-ogc-layer-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 6px; align-items: center; border: 1px solid #d7e8e1; border-radius: 8px; padding: 4px 6px; background: rgba(255,255,255,.92); cursor: grab; }
      .vectormap-ogc-layer-row.is-dragging { opacity: .6; }
      .vectormap-ogc-layer-row.is-drop-target { outline: 2px dashed #4ea48f; outline-offset: 1px; }
      .vectormap-ogc-layer-main { display: grid; grid-template-columns: minmax(0,1fr) 88px; gap: 6px; align-items: center; min-width: 0; }
      .vectormap-ogc-layer-main span { font: 12px/1.2 "Segoe UI", Arial, sans-serif; color: #173e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vectormap-ogc-layer-row button { width: 28px; height: 24px; border: 1px solid #bad8cf; border-radius: 6px; background: #fff; color: #1b584c; cursor: pointer; font: 600 10px/1 "Segoe UI", Arial, sans-serif; }
      .vectormap-ogc-layer-row button.is-active { border-color: #1f8f78; background: #e7f7f1; color: #0f4e4b; }
      .vectormap-ogc-layer-row input[type='range'] { width: 88px; accent-color: #00a7b3; cursor: pointer; }
      .vectormap-ogc-layer-details { display: none; margin-top: 8px; border: 1px solid #c7dfd7; border-radius: 8px; background: rgba(255,255,255,.96); padding: 9px; color: #1e453b; box-shadow: inset 0 1px 0 rgba(255,255,255,.7); max-height: min(42vh, 360px); overflow: auto; overscroll-behavior: contain; }
      .vectormap-ogc-layer-details.is-open { display: block; }
      .vectormap-ogc-layer-details-title { margin: 0 0 5px; font: 700 13px/1.3 "Segoe UI", Arial, sans-serif; color: #103a31; overflow-wrap: anywhere; }
      .vectormap-ogc-layer-details-title a { color: inherit; text-decoration: none; }
      .vectormap-ogc-layer-details-title a:hover { text-decoration: underline; }
      .vectormap-ogc-layer-details-description { margin: 0 0 7px; font: 12px/1.4 "Segoe UI", Arial, sans-serif; color: #315c52; overflow-wrap: anywhere; }
      .vectormap-ogc-layer-details-meta { display: grid; gap: 3px; margin: 0 0 7px; font: 11px/1.35 "Segoe UI", Arial, sans-serif; color: #466b60; }
      .vectormap-ogc-layer-details-body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #1e453b; }
      .vectormap-ogc-layer-details-body p { margin: 0 0 6px; }
      .vectormap-ogc-layer-details-body ul,
      .vectormap-ogc-layer-details-body ol { margin: 0 0 6px 18px; padding: 0; }
      .vectormap-ogc-feature-hover .maplibregl-canvas,
      .maplibregl-canvas-container.vectormap-ogc-feature-hover,
      .maplibregl-canvas-container.vectormap-ogc-feature-hover .maplibregl-canvas { cursor: ${featureCursor} !important; }
      .vectormap-ogc-popup { width: fit-content; max-width: min(420px, calc(100vw - 48px)); color: #173e35; }
      .vectormap-ogc-popup-section + .vectormap-ogc-popup-section { margin-top: 10px; padding-top: 10px; border-top: 1px solid #d7e8e1; }
      .vectormap-ogc-popup-title { display: inline-block; margin-bottom: 6px; font: 700 13px/1.3 "Segoe UI", Arial, sans-serif; color: #0f4e4b; text-decoration: none; }
      .vectormap-ogc-popup-title:hover { text-decoration: underline; }
      .vectormap-ogc-popup-grid { display: grid; grid-template-columns: max-content minmax(120px, 1fr); gap: 4px 10px; align-items: start; width: fit-content; max-width: 100%; }
      .vectormap-ogc-popup-key { font: 600 12px/1.35 "Segoe UI", Arial, sans-serif; color: #24584b; white-space: nowrap; }
      .vectormap-ogc-popup-value { font: 12px/1.35 "Segoe UI", Arial, sans-serif; color: #173e35; overflow-wrap: anywhere; min-width: 0; }
      @media (max-width: 760px) {
        .vectormap-ogc-panel { position: fixed; right: 10px; left: 10px; top: 66px; width: auto; max-height: 72vh; }
        .vectormap-ogc-row { grid-template-columns: 1fr; }
        .vectormap-ogc-popup-grid { grid-template-columns: minmax(88px, max-content) minmax(0, 1fr); width: 100%; }
      }
    `;
    document.head.appendChild(style);
  };

  const overlayFromLayer = (layer, capabilitiesUrl, metadataUrl, map, metadata = {}) => ({
    id: `ogc-${hashString(`${safeText(layer.serviceType).toUpperCase()}|${normalizeCapabilitiesUrl(capabilitiesUrl || "")}|${safeText(layer.layerId).toLowerCase()}`)}`,
    title: layer.title || layer.layerId,
    metadataUrl: safeText(metadataUrl || ""),
    serviceType: layer.serviceType,
    layerId: layer.layerId,
    capabilitiesUrl,
    format: layer.format || "image/png",
    style: layer.style || "default",
    tileTemplate: layer.tileTemplate || "",
    tileMatrixSet: layer.tileMatrixSet || "3857",
    version: layer.version || "1.1.1",
    queryable: layer.queryable === true,
    infoFormats: Array.isArray(layer.infoFormats) ? layer.infoFormats.slice() : [],
    targetContainerIds: [mapId(map)].filter(Boolean),
    abstract: safeText(layer.abstract || metadata.abstract || ""),
    organization: safeText(metadata.organization || ""),
    groupOwner: safeText(metadata.groupOwner || ""),
    abstractHtml: String(metadata.abstractHtml || ""),
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
              <button type="button" class="vectormap-ogc-btn vectormap-ogc-btn--primary vectormap-ogc-search">Suchen</button>
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
            <div class="vectormap-ogc-layer-details" aria-live="polite"></div>
          </div>
        </div>
      `;

      const inputEl = panel.querySelector(".vectormap-ogc-input");
      const searchBtn = panel.querySelector(".vectormap-ogc-search");
      const statusEl = panel.querySelector(".vectormap-ogc-status");
      const bboxEl = panel.querySelector(".vectormap-ogc-use-bbox");
      const recordsEl = panel.querySelector(".vectormap-ogc-records");
      const layersEl = panel.querySelector(".vectormap-ogc-layers");
      const activeEl = panel.querySelector(".vectormap-ogc-active-layers");
      const layerDetailsEl = panel.querySelector(".vectormap-ogc-layer-details");
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
      let selectedLayerInfoId = "";
      const clearLayerDetails = () => {
        selectedLayerInfoId = "";
        layerDetailsEl.classList.remove("is-open");
        layerDetailsEl.innerHTML = "";
        [...activeEl.querySelectorAll("button.is-active")].forEach((button) =>
          button.classList.remove("is-active")
        );
      };
      const renderLayerDetails = (overlay) => {
        if (!overlay || selectedLayerInfoId === overlay.id) {
          clearLayerDetails();
          return;
        }
        selectedLayerInfoId = overlay.id;
        const html = sanitizeHtml(overlay.abstractHtml || "");
        const metadataUrl = safeText(overlay.metadataUrl || "");
        layerDetailsEl.innerHTML = "";
        const title = document.createElement("h5");
        title.className = "vectormap-ogc-layer-details-title";
        if (metadataUrl) {
          const titleLink = document.createElement("a");
          titleLink.href = metadataUrl;
          titleLink.target = "_blank";
          titleLink.rel = "noopener";
          titleLink.textContent = safeText(overlay.title || overlay.layerId);
          title.appendChild(titleLink);
        } else {
          title.textContent = safeText(overlay.title || overlay.layerId);
        }
        layerDetailsEl.appendChild(title);
        const descriptionText = safeText(overlay.abstract || "");
        if (descriptionText) {
          const description = document.createElement("div");
          description.className = "vectormap-ogc-layer-details-description";
          description.textContent = descriptionText;
          layerDetailsEl.appendChild(description);
        }
        const meta = document.createElement("div");
        meta.className = "vectormap-ogc-layer-details-meta";
        [
          `Layer: ${safeText(overlay.layerId || "-")}`,
          `Dienst: ${safeText(overlay.serviceType || "-")}`,
          `Herausgeber: ${safeText(overlay.organization || "-")}`,
          `Katalog: ${safeText(overlay.groupOwner || "-")}`
        ].forEach((line) => {
          const item = document.createElement("div");
          item.textContent = line;
          meta.appendChild(item);
        });
        layerDetailsEl.appendChild(meta);
        if (html) {
          const body = document.createElement("div");
          body.className = "vectormap-ogc-layer-details-body";
          body.innerHTML = html;
          layerDetailsEl.appendChild(body);
        }
        layerDetailsEl.classList.add("is-open");
        [...activeEl.querySelectorAll("button.is-active")].forEach((button) =>
          button.classList.remove("is-active")
        );
        activeEl
          .querySelector(`[data-overlay-id="${CSS.escape(overlay.id)}"] .vectormap-ogc-info-btn`)
          ?.classList.add("is-active");
      };
      renderActiveLayers = () => {
        activeEl.innerHTML = "";
        const overlays = ogcState.getOverlays().filter((overlay) => isOverlayOnMap(overlay, map));
        if (selectedLayerInfoId && !overlays.some((overlay) => overlay.id === selectedLayerInfoId)) {
          clearLayerDetails();
        }
        if (!overlays.length) {
          const empty = document.createElement("div");
          empty.className = "vectormap-ogc-meta";
          empty.textContent = "Keine aktiven Layer.";
          activeEl.appendChild(empty);
          return;
        }
        let dragId = null;
        overlays.forEach((overlay) => {
          const row = document.createElement("div");
          row.className = "vectormap-ogc-layer-row";
          row.setAttribute("draggable", "true");
          row.dataset.overlayId = overlay.id;
          const main = document.createElement("div");
          main.className = "vectormap-ogc-layer-main";
          const label = document.createElement("span");
          label.textContent = overlay.title || overlay.layerId;
          const opacity = document.createElement("input");
          opacity.type = "range";
          opacity.min = "0";
          opacity.max = "1";
          opacity.step = "0.05";
          opacity.value = String(normalizeOpacity(overlay.opacity));
          opacity.title = "Transparenz";
          const enableRowDrag = () => {
            row.setAttribute("draggable", "true");
          };
          const disableRowDrag = () => {
            row.setAttribute("draggable", "false");
            window.addEventListener("pointerup", enableRowDrag, { once: true });
            window.addEventListener("pointercancel", enableRowDrag, { once: true });
          };
          opacity.addEventListener("pointerdown", (event) => {
            disableRowDrag();
            event.stopPropagation();
          });
          opacity.addEventListener("blur", enableRowDrag);
          opacity.addEventListener("touchstart", (event) => {
            disableRowDrag();
            event.stopPropagation();
          }, { passive: true });
          opacity.addEventListener("input", () =>
            ogcState.updateOverlayOpacity(overlay.id, opacity.value, { emitChange: false })
          );
          opacity.addEventListener("change", () => ogcState.updateOverlayOpacity(overlay.id, opacity.value));
          main.append(label, opacity);
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.title = overlay.visible ? "Layer ausblenden" : "Layer einblenden";
          toggleBtn.textContent = overlay.visible ? "AN" : "AUS";
          toggleBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
          toggleBtn.addEventListener("click", () => ogcState.updateOverlayVisibility(overlay.id, !overlay.visible));
          const infoBtn = document.createElement("button");
          infoBtn.type = "button";
          infoBtn.className = "vectormap-ogc-info-btn";
          infoBtn.title = "Information";
          infoBtn.textContent = "i";
          infoBtn.disabled = !overlay.metadataUrl && !overlay.abstractHtml && !overlay.abstract;
          infoBtn.classList.toggle("is-active", selectedLayerInfoId === overlay.id);
          infoBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
          infoBtn.addEventListener("click", () => {
            renderLayerDetails(overlay);
          });
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.title = "Layer entfernen";
          removeBtn.textContent = "×";
          removeBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
          removeBtn.addEventListener("click", () => {
            if (selectedLayerInfoId === overlay.id) {
              clearLayerDetails();
            }
            ogcState.removeOverlay(overlay.id);
          });
          row.addEventListener("dragstart", (event) => {
            if (event.target?.closest?.("button,input")) {
              event.preventDefault();
              return;
            }
            dragId = overlay.id;
            row.classList.add("is-dragging");
          });
          row.addEventListener("dragend", () => {
            row.classList.remove("is-dragging");
            [...activeEl.children].forEach((child) => child.classList.remove("is-drop-target"));
          });
          row.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (dragId && dragId !== overlay.id) {
              row.classList.add("is-drop-target");
            }
          });
          row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
          row.addEventListener("drop", (event) => {
            event.preventDefault();
            row.classList.remove("is-drop-target");
            if (!dragId || dragId === overlay.id) {
              return;
            }
            const ids = overlays.map((x) => x.id);
            const from = ids.indexOf(dragId);
            const to = ids.indexOf(overlay.id);
            if (from < 0 || to < 0) {
              return;
            }
            ids.splice(to, 0, ids.splice(from, 1)[0]);
            ogcState.reorderOverlays(ids);
          });
          row.append(main, toggleBtn, infoBtn, removeBtn);
          activeEl.appendChild(row);
        });
      };
      renderActiveLayers();
      window.addEventListener("vectormap:ogc-overlays-change", renderActiveLayers);
      let activeRecordMetadata = {};
      const addOverlay = (layer, capabilitiesUrl, metadataUrl, metadata = activeRecordMetadata) => {
        ogcState.addOverlay(overlayFromLayer(layer, capabilitiesUrl, metadataUrl, map, metadata || {}));
      };

      const renderLayerList = (parsed, capabilitiesUrl, metadataUrl) => {
        layersEl.innerHTML = "";
        const summary = document.createElement("div");
        summary.className = "vectormap-ogc-meta";
        const totalLayers = parsed.layers.length;
        const layerMatches = parsed.layers.map((layer) => ({
          layer: {
            ...layer,
            version: layer.version || parsed.version || "1.1.1",
            queryable: layer.queryable === true,
            infoFormats: Array.isArray(layer.infoFormats)
              ? layer.infoFormats
              : Array.isArray(parsed.infoFormats)
                ? parsed.infoFormats
                : []
          },
          haystack: [
            safeText(layer.title),
            safeText(layer.layerId)
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        }));
        const updateSummary = (visibleCount) => {
          summary.textContent =
            visibleCount === totalLayers
              ? `${totalLayers} Layer verfügbar (${parsed.serviceType}).`
              : `${visibleCount} von ${totalLayers} Layern sichtbar (${parsed.serviceType}).`;
        };
        updateSummary(totalLayers);
        layersEl.appendChild(summary);
        const actions = document.createElement("div");
        actions.className = "vectormap-ogc-actions";
        const layerFilterInput = document.createElement("input");
        layerFilterInput.type = "search";
        layerFilterInput.className = "vectormap-ogc-input";
        layerFilterInput.placeholder = safeText(settings.layerSearchPlaceholder);
        layerFilterInput.setAttribute("aria-label", "Layer im Dienst filtern");
        const addServiceLayer = document.createElement("button");
        addServiceLayer.type = "button";
        addServiceLayer.className = "vectormap-ogc-btn";
        addServiceLayer.textContent = "Dienst hinzufügen";
        addServiceLayer.disabled = !(parsed.serviceType === "WMS" && safeText(parsed.serviceLayerId));
        addServiceLayer.addEventListener("click", () => {
          const serviceLayerId = safeText(parsed.serviceLayerId);
          if (!serviceLayerId) {
            setStatus("Für diesen Dienst ist kein WMS-Dienstname verfügbar.");
            return;
          }
          addOverlay(
            {
              serviceType: "WMS",
              layerId: serviceLayerId,
              title: `WMS-Dienst (${serviceLayerId})`,
              format: "image/png",
              version: parsed.version || "1.1.1",
              queryable: parsed.queryable === true,
              infoFormats: Array.isArray(parsed.infoFormats) ? parsed.infoFormats : []
            },
            capabilitiesUrl,
            metadataUrl
          );
          setStatus(`Dienst hinzugefügt: ${serviceLayerId}`);
        });
        actions.append(layerFilterInput, addServiceLayer);
        layersEl.appendChild(actions);
        const listRoot = document.createElement("div");
        listRoot.className = "vectormap-ogc-list";
        layersEl.appendChild(listRoot);
        const emptyState = document.createElement("div");
        emptyState.className = "vectormap-ogc-meta";
        emptyState.textContent = "Keine passenden Layer im Dienst gefunden.";

        const renderVisibleLayers = () => {
          const needle = safeText(layerFilterInput.value).toLowerCase();
          listRoot.innerHTML = "";
          const visibleLayers = layerMatches.filter(({ haystack }) =>
            !needle || haystack.includes(needle)
          );
          updateSummary(visibleLayers.length);
          if (!visibleLayers.length) {
            listRoot.appendChild(emptyState);
            return;
          }
          visibleLayers.forEach(({ layer }) => {
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
            listRoot.appendChild(item);
          });
        };
        layerFilterInput.addEventListener("input", renderVisibleLayers);
        renderVisibleLayers();
      };

      const loadCapabilities = async (url, metadataUrl = "") => {
        const capUrl = safeText(url);
        if (!capUrl) {
          setStatus("Bitte gültige Service-URL eingeben.");
          return;
        }
        clearHoverGeometry();
        recordsEl.innerHTML = "";
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
        clearHoverGeometry();
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
          meta.textContent = [record.organization ? `Herausgeber: ${record.organization}` : "", `Katalog: ${record.groupOwnerName || record.groupOwner || "unbekannt"}`, record.abstract]
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
              activeRecordMetadata = {
                organization: record.organization,
                groupOwner: record.groupOwnerName || record.groupOwner,
                abstract: record.abstract,
                abstractHtml: record.abstractHtml
              };
              void loadCapabilities(loadable.url, record.metadataUrl);
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
          actions.append(list, metaBtn);
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
      const runPrimaryAction = async (opts = {}) => {
        const value = safeText(inputEl.value);
        if (!value) {
          setStatus("Bitte Suchbegriff eingeben.");
          return;
        }
        if (looksLikeCapabilitiesInput(value)) {
          recordsEl.innerHTML = "";
          await loadCapabilities(value);
          return;
        }
        await runSearch(opts);
      };

      toggle.addEventListener("click", () => {
        const open = !root.classList.contains("is-open");
        root.classList.toggle("is-open", open);
        isPanelOpen = open;
        if (!open) {
          clearHoverGeometry();
        }
        if (open) {
          inputEl.focus();
        }
      });
      panel.addEventListener("click", (event) => event.stopPropagation());
      document.addEventListener("click", (event) => {
        if (!root.contains(event.target)) {
          root.classList.remove("is-open");
          isPanelOpen = false;
          clearHoverGeometry();
        }
      });
      bboxEl?.addEventListener("change", () => {
        if (lastQuery) {
          scheduleSearch({ trigger: "auto" });
        }
      });
      searchBtn.addEventListener("click", () => void runPrimaryAction());
      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        void runPrimaryAction();
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
  getTargetMaps().forEach(bindFeatureInfoInteractions);
  window.addEventListener("vectormap:maps-ready", () => {
    applyAll();
    getTargetMaps().forEach(bindFeatureInfoInteractions);
  });
  window.addEventListener("vectormap:ogc-overlays-change", syncFeaturePopupVisibility);
  window.setTimeout(applyAll, 1200);
})();







