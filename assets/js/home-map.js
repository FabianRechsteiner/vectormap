(() => {
  const base = window.vectormapModules?.baseMap;
  const status = document.getElementById("home-map-status");
  const buttons = [...document.querySelectorAll("[data-home-style]")];
  const activate = document.getElementById("home-map-activate");
  const mapLink = document.getElementById("home-map-link");
  const headerLink = document.getElementById("header-map-link");
  const styles = {
    light: "styles/ch.vectormap.lightbasemap.json",
    gta: "styles/ch.vectormap.gta.json"
  };
  let map;
  let currentStyle = "light";
  const setStatus = (message) => {
    status.textContent = message;
    status.hidden = !message;
  };
  const setBusy = (busy) => buttons.forEach((button) => { button.disabled = busy; });
  const updateLinks = () => {
    const suffix = currentStyle === "gta" ? "?style=gta" : "";
    mapLink.href = "maps/map/" + suffix;
    headerLink.href = "maps/map/" + suffix;
  };
  const switchStyle = async (name) => {
    if (!map || !styles[name] || name === currentStyle) return;
    setBusy(true);
    setStatus("Kartenstil wird geladen …");
    try {
      const next = await base.loadStyle(styles[name]);
      if (!next) throw new Error("Style unavailable");
      map.setStyle(next, { diff: false });
      currentStyle = name;
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.homeStyle === name)));
      updateLinks();
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus("Kartenstil konnte nicht geladen werden. Bitte erneut versuchen.");
    } finally { setBusy(false); }
  };
  buttons.forEach((button) => button.addEventListener("click", () => switchStyle(button.dataset.homeStyle)));
  const setInteraction = (enabled) => {
    if (!map) return;
    // Deliberate activation prevents the map from trapping page scrolling.
    if (enabled) {
      map.scrollZoom.enable();
      map.touchZoomRotate.enable();
      map.dragPan.enable();
    } else {
      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
      if (window.matchMedia("(pointer: coarse)").matches) map.dragPan.disable();
      else map.dragPan.enable();
    }
    activate.setAttribute("aria-pressed", String(enabled));
    activate.textContent = enabled ? "Scrollen freigeben" : "Karte bedienen";
  };
  activate.addEventListener("click", () => setInteraction(activate.getAttribute("aria-pressed") !== "true"));
  const init = async () => {
    try {
      if (!base) throw new Error("Base map module unavailable");
      map = await base.createMap({
        container: "home-map",
        styleUrl: styles.light,
        center: [8.7241, 47.4987],
        zoom: 15,
        controls: { navigation: true, fullscreen: false, geolocate: false, search: true }
      });
      if (!map) throw new Error("Map unavailable");
      setInteraction(false);
      window.vectormapSearchConfig = {
        map,
        mapContainer: "home-map",
        controls: { navigation: true, fullscreen: false, geolocate: false, search: true },
        placeholder: "Ort oder Adresse",
        buttonLabel: "Suchen",
        labelText: "Suche",
        clearButtonLabel: "Suchmarker entfernen",
        idleMessage: "Suchbegriff eingeben.",
        loadingMessage: "Suche läuft …",
        emptyMessage: "Keine Ergebnisse.",
        errorMessage: "Suche fehlgeschlagen.",
        flyDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900,
        fitDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900
      };
      // Search registers against the existing map; never creates a second map.
      base.loadScript(new URL("assets/js/modules/search-map.js", document.baseURI).href)
        .catch((error) => console.error("Search unavailable", error));
      const ready = () => {
        setStatus("");
        setBusy(false);
        activate.disabled = false;
      };
      if (map.loaded()) ready();
      else {
        const timeout = window.setTimeout(() => {
          setStatus("Die Karte benötigt länger. Du kannst die Hauptkarte direkt öffnen.");
          setBusy(false);
          activate.disabled = false;
        }, 15000);
        map.once("load", () => { window.clearTimeout(timeout); ready(); });
      }
    } catch (error) {
      console.error(error);
      setStatus("Die Karte konnte nicht geladen werden. Öffne die Hauptkarte oder versuche es später erneut.");
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(init, { timeout: 1000 });
  else window.setTimeout(init, 0);
})();
