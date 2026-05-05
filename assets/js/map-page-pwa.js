(function initMapPagePwa() {
  const path = window.location.pathname;
  if (!path.includes("/maps/")) {
    return;
  }

  const pageTitle = document.title || "Vectormap Karte";
  const metadata = window.vectormapMapPwa || {};
  const appName = metadata.name || pageTitle;
  const shortName = metadata.shortName || appName.slice(0, 12);
  const rootPrefix = path.includes("/maps/") ? ".." : ".";
  const iconPath = `${rootPrefix}/assets/images/logo_v.png`;

  const manifest = {
    id: path,
    name: appName,
    short_name: shortName,
    start_url: path,
    scope: "/maps/",
    display: "standalone",
    background_color: "#0b111c",
    theme_color: "#0b111c",
    description: metadata.description || "Installierbare Vectormap-Karte.",
    icons: [
      {
        src: iconPath,
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: iconPath,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };

  const manifestLink = document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = `data:application/manifest+json,${encodeURIComponent(
    JSON.stringify(manifest)
  )}`;
  document.head.appendChild(manifestLink);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#0b111c";
    document.head.appendChild(meta);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function onLoad() {
      navigator.serviceWorker.register(`${rootPrefix}/service-worker.js`).catch(
        function () {
          // Keep pages functional when service worker registration fails.
        }
      );
    });
  }
})();
