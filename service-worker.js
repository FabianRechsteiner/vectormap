const CACHE_VERSION = "vectormap-v6";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dataset.html",
  "./styles.html",
  "./maps.html",
  "./about.html",
  "./lizenzen.html",
  "./maps/index.html",
  "./maps/base-map.html",
  "./maps/basemap-control.html",
  "./maps/search-map.html",
  "./maps/compare-map.html",
  "./maps/av-wms.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/css/maplibre-gl-compare.css",
  "./assets/js/pwa-register.js",
  "./assets/js/map-page-pwa.js",
  "./assets/js/modules/base-map.js",
  "./assets/js/modules/fullscreen-control.js",
  "./assets/js/modules/navigation-control.js",
  "./assets/js/modules/geolocate-control.js",
  "./assets/js/modules/basemap-control.js",
  "./assets/js/modules/search-map.js",
  "./assets/js/modules/compare-map.js",
  "./assets/js/modules/av-wms-map.js",
  "./assets/images/logo_v.png"
];

const isAppShellRequest = (request) => {
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    return true;
  }
  if (url.origin !== self.location.origin || request.method !== "GET") {
    return false;
  }
  return (
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".webmanifest")
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Keep external map resources network-only to avoid stale/complex caching.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("./offline.html");
        })
    );
    return;
  }

  if (isAppShellRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          return response;
        });
      })
    );
  }
});
