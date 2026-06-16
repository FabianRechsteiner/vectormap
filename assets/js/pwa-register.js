(function registerPwa() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", function onLoad() {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const rootUrl = manifestLink
      ? new URL(".", manifestLink.href)
      : new URL("./", window.location.href);
    const serviceWorkerUrl = new URL("service-worker.js", rootUrl);

    navigator.serviceWorker.register(serviceWorkerUrl.href).catch(function () {
      // Silent fail: app remains usable without offline support.
    });
  });
})();
