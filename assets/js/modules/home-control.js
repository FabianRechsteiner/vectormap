(() => {
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.homeControlRegistered) {
    return;
  }
  moduleState.homeControlRegistered = true;

  const moduleUrl = document.currentScript?.src || window.location.href;
  const defaultLogoUrl = new URL("../../../assets/images/logo_v.png", moduleUrl).href;
  const settings = {
    position: "top-left",
    title: "Zur Hauptkarte",
    href: "/maps/map/",
    logoUrl: defaultLogoUrl,
    mapContainerIds: ["normalMap", "after", "cmpMapRight"],
    ...(window.vectormapHomeControlConfig || {})
  };

  const mapContainerIds = new Set(
    (Array.isArray(settings.mapContainerIds) ? settings.mapContainerIds : [])
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim())
  );

  const matchesTargetMap = (map) => {
    const id = map?.getContainer?.()?.id;
    return Boolean(id && mapContainerIds.has(id));
  };

  const createHomeControl = () => ({
    onAdd() {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl vectormap-home-control-wrap";

      const link = document.createElement("a");
      link.className = "vectormap-home-control";
      link.href = settings.href || "/";
      link.setAttribute("aria-label", settings.title);
      link.setAttribute("title", settings.title);

      const image = document.createElement("img");
      image.src = settings.logoUrl;
      image.alt = "";
      image.decoding = "async";
      image.loading = "eager";

      link.appendChild(image);
      container.appendChild(link);
      return container;
    },
    onRemove() {}
  });

  const ensureStyle = () => {
    if (document.getElementById("vectormap-home-control-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "vectormap-home-control-style";
    style.textContent = `
      .vectormap-home-control-wrap {
        background: transparent;
        box-shadow: none;
        border: 0;
      }
      .vectormap-home-control {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        text-decoration: none;
        background: transparent;
        box-shadow: none;
        border: 0;
      }
      .vectormap-home-control:hover,
      .vectormap-home-control:focus-visible {
        background: transparent;
      }
      .vectormap-home-control:focus-visible {
        outline: 2px solid #1f8f78;
        outline-offset: 2px;
      }
      .vectormap-home-control img {
        display: block;
        width: 32px;
        height: 32px;
      }
    `;
    document.head.appendChild(style);
  };

  ensureStyle();
  baseMap.registerControl({
    key: "home",
    position: settings.position,
    applyTo: matchesTargetMap,
    create: createHomeControl
  });
})();
