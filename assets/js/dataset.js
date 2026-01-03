const listEl = document.querySelector("[data-layer-list]");
const countEl = document.querySelector("[data-layer-count]");
const searchInput = document.querySelector("[data-layer-search]");

if (listEl && countEl && searchInput) {
  const state = {
    total: 0,
  };

  const normalizeAttribute = (attribute) => {
    if (typeof attribute === "string") {
      return { name: attribute, type: "" };
    }

    if (attribute && typeof attribute === "object") {
      const name = attribute.name || attribute.property || attribute.field || attribute.key || "";
      const type = attribute.type || attribute.dataType || attribute.datatype || "";
      return { name: name || JSON.stringify(attribute), type };
    }

    return { name: String(attribute), type: "" };
  };

  const buildMetaLine = (label, value) => {
    const span = document.createElement("span");
    span.textContent = `${label}: ${value}`;
    return span;
  };

  const updateCount = () => {
    const visible = Array.from(listEl.children).filter((item) => !item.hidden).length;
    countEl.textContent = `Layer: ${visible}/${state.total}`;
  };

  const applyFilter = () => {
    const query = searchInput.value.trim().toLowerCase();
    Array.from(listEl.children).forEach((item) => {
      const matches = item.dataset.search?.includes(query) ?? false;
      item.hidden = query.length > 0 && !matches;
    });
    updateCount();
  };

  const createLayerCard = (id, layer, index) => {
    const details = document.createElement("details");
    details.className = "layer-card reveal";
    details.style.setProperty("--delay", `${Math.min(index * 0.03, 0.3)}s`);

    const summary = document.createElement("summary");

    const title = document.createElement("div");
    title.className = "layer-title";
    const name = document.createElement("span");
    name.textContent = layer.target_name || id;
    const layerId = document.createElement("span");
    layerId.className = "layer-id";
    layerId.textContent = id;
    title.append(name, layerId);

    const rawAttributes = Array.isArray(layer.attributes) ? layer.attributes : [];
    const normalizedAttributes = rawAttributes
      .map(normalizeAttribute)
      .filter((attribute) => attribute.name.trim().toLowerCase() !== "wkb_geometry");

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.append(
      buildMetaLine("Kategorie", layer.category || "-"),
      buildMetaLine("Zoom", `${layer.minzoom ?? "-"}-${layer.maxzoom ?? "-"}`),
      buildMetaLine("Attribute", normalizedAttributes.length)
    );

    summary.append(title, meta);

    const body = document.createElement("div");
    body.className = "layer-body";

    if (layer.description) {
      const desc = document.createElement("p");
      desc.textContent = layer.description;
      body.append(desc);
    }

    if (normalizedAttributes.length > 0) {
      const attributeList = document.createElement("div");
      attributeList.className = "attribute-list";

      normalizedAttributes.forEach((attribute) => {
        const item = document.createElement("span");
        item.className = "attribute-item";
        item.textContent = attribute.type ? `${attribute.name} (${attribute.type})` : attribute.name;
        attributeList.appendChild(item);
      });

      body.append(attributeList);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "Keine Attribute angegeben.";
      body.append(empty);
    }

    details.append(summary, body);

    const searchTokens = [
      id,
      layer.target_name,
      layer.description,
      layer.category,
      ...(normalizedAttributes.flatMap((attribute) => [attribute.name, attribute.type])),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    details.dataset.search = searchTokens;

    return details;
  };

  fetch("av.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Layer data could not be loaded");
      }
      return response.json();
    })
    .then((data) => {
      const entries = Object.entries(data)
        .filter(([key, layer]) => key !== "_collection" && layer?.visible !== false)
        .sort((a, b) => {
          const aName = (a[1]?.target_name || a[0] || "").toString();
          const bName = (b[1]?.target_name || b[0] || "").toString();
          return aName.localeCompare(bName, "de", { sensitivity: "base" });
        });
      state.total = entries.length;

      const fragment = document.createDocumentFragment();
      entries.forEach(([id, layer], index) => {
        fragment.appendChild(createLayerCard(id, layer, index));
      });
      listEl.appendChild(fragment);
      applyFilter();
    })
    .catch(() => {
      countEl.textContent = "Layer konnten nicht geladen werden.";
      const message = document.createElement("p");
      message.className = "footer-note";
      message.textContent = "Die Datei av.json ist momentan nicht erreichbar.";
      listEl.appendChild(message);
    });

  searchInput.addEventListener("input", applyFilter);
}

const mapContainer = document.getElementById("dataset-map");
if (mapContainer) {
  const baseMap = window.vectormapModules && window.vectormapModules.baseMap;
  if (!baseMap || !baseMap.createMap) {
    console.error("Base map module fehlt.");
  } else {
    baseMap
      .createMap({
        container: mapContainer,
        styleUrl: "styles/ch.vectormap.lightbasemap.json",
        center: [8.23, 46.82],
        zoom: 7.0,
        controls: { navigation: true, fullscreen: false, scale: false }
      })
      .then((map) => {
        if (!map) {
          return;
        }

        const addKantonLayers = () => {
          const sourceId = "kantonsgrenzen";
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: "assets/data/kantonsgrenzen.geojson"
            });
          }

          const style = map.getStyle();
          const firstSymbolId = style?.layers?.find((layer) => layer.type === "symbol")?.id;
          const fillLayer = {
            id: "kantonsgrenzen-fill",
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "opendata"], true],
                "#4caf50",
                "#e57373"
              ],
              "fill-opacity": 0.5
            },
            maxzoom: 10
          };
          const lineLayer = {
            id: "kantonsgrenzen-outline",
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#333",
              "line-width": 1
            },
            maxzoom: 10
          };

          if (firstSymbolId) {
            map.addLayer(fillLayer, firstSymbolId);
            map.addLayer(lineLayer, firstSymbolId);
          } else {
            map.addLayer(fillLayer);
            map.addLayer(lineLayer);
          }
        };

        if (map.isStyleLoaded()) {
          addKantonLayers();
        } else {
          map.once("load", addKantonLayers);
        }
      });
  }
}

