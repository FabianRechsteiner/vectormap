(function registerPwa() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", function onLoad() {
    navigator.serviceWorker.register("./service-worker.js").catch(function () {
      // Silent fail: app remains usable without offline support.
    });
  });
})();
