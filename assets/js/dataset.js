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
    countEl.textContent = `${visible} von ${state.total} Layern`;
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

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.append(
      buildMetaLine("Kategorie", layer.category || "–"),
      buildMetaLine("Zoom", `${layer.minzoom ?? "–"}–${layer.maxzoom ?? "–"}`),
      buildMetaLine("Sichtbar", layer.visible === false ? "nein" : "ja")
    );

    summary.append(title, meta);

    const body = document.createElement("div");
    body.className = "layer-body";

    if (layer.description) {
      const desc = document.createElement("p");
      desc.textContent = layer.description;
      body.append(desc);
    }

    const attributes = Array.isArray(layer.attributes) ? layer.attributes : [];
    if (attributes.length > 0) {
      const attributeList = document.createElement("div");
      attributeList.className = "attribute-list";

      attributes.forEach((attribute) => {
        const normalized = normalizeAttribute(attribute);
        const row = document.createElement("div");
        row.className = "attribute-item";

        const nameEl = document.createElement("span");
        nameEl.textContent = normalized.name;

        const typeEl = document.createElement("span");
        typeEl.className = "attribute-type";
        typeEl.textContent = normalized.type ? normalized.type : "–";

        row.append(nameEl, typeEl);
        attributeList.appendChild(row);
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
      ...(attributes.map((attribute) => normalizeAttribute(attribute).name)),
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
      const entries = Object.entries(data).filter(([key]) => key !== "_collection");
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

