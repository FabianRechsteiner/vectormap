(() => {
  const moduleState = window.vectormapModules || {};
  const baseMap = moduleState.baseMap;

  if (!baseMap || typeof baseMap.registerControl !== "function") {
    console.error("Base map module fehlt.");
    return;
  }
  if (moduleState.shareControlRegistered) {
    return;
  }
  moduleState.shareControlRegistered = true;

  const settings = {
    position: "top-right",
    title: "Copy map link",
    copiedTitle: "Link copied",
    sharedTitle: "Share sheet opened",
    errorTitle: "Copy failed",
    mapContainerIds: ["normalMap", "after", "cmpMapRight"],
    ...(window.vectormapShareControlConfig || {})
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

  const writeClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement("input");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  };

  const createShareControl = () => ({
    onAdd() {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const feedback = document.createElement("div");
      feedback.className = "vectormap-share-feedback";
      feedback.setAttribute("aria-live", "polite");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "maplibregl-ctrl-icon vectormap-share-control";
      button.setAttribute("aria-label", settings.title);
      button.setAttribute("title", settings.title);

      const setFeedback = (text, stateClass) => {
        feedback.textContent = text;
        feedback.classList.remove("is-success", "is-error", "is-visible");
        if (stateClass) {
          feedback.classList.add(stateClass);
        }
        feedback.classList.add("is-visible");
        window.setTimeout(() => {
          feedback.classList.remove("is-visible", "is-success", "is-error");
        }, 1400);
      };

      button.addEventListener("click", async () => {
        const url = window.location.href;
        try {
          if (navigator.share && window.matchMedia?.("(max-width: 900px)")?.matches) {
            await navigator.share({ title: document.title, url });
            button.setAttribute("title", settings.sharedTitle);
            setFeedback(settings.sharedTitle, "is-success");
            window.setTimeout(() => button.setAttribute("title", settings.title), 1200);
            return;
          }
          await writeClipboard(url);
          button.setAttribute("title", settings.copiedTitle);
          setFeedback(settings.copiedTitle, "is-success");
          setTimeout(() => button.setAttribute("title", settings.title), 1200);
        } catch (error) {
          console.error("Failed to copy link.", error);
          button.setAttribute("title", settings.errorTitle);
          setFeedback(settings.errorTitle, "is-error");
          setTimeout(() => button.setAttribute("title", settings.title), 1600);
        }
      });

      container.appendChild(button);
      container.appendChild(feedback);
      return container;
    },
    onRemove() {}
  });

  const ensureStyle = () => {
    if (document.getElementById("vectormap-share-control-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "vectormap-share-control-style";
    style.textContent = `
      .vectormap-share-control {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%231b2a23' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M7 10l6-4'/><path d='M7 10l6 4'/><circle cx='5' cy='10' r='2.1'/><circle cx='15' cy='6' r='2.1'/><circle cx='15' cy='14' r='2.1'/></svg>");
        background-repeat: no-repeat;
        background-position: center;
        background-size: 16px 16px;
      }
      .vectormap-share-feedback {
        position: absolute;
        top: 36px;
        right: 0;
        min-width: 112px;
        max-width: 220px;
        padding: 5px 8px;
        border-radius: 6px;
        background: rgba(20, 28, 24, 0.92);
        color: #fff;
        font: 12px/1.2 "Segoe UI", Arial, sans-serif;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition: opacity 0.15s ease, transform 0.15s ease;
        white-space: nowrap;
      }
      .vectormap-share-feedback.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .vectormap-share-feedback.is-error {
        background: rgba(126, 25, 25, 0.95);
      }
    `;
    document.head.appendChild(style);
  };

  ensureStyle();
  baseMap.registerControl({
    key: "share",
    position: settings.position,
    applyTo: matchesTargetMap,
    create: createShareControl
  });
})();
