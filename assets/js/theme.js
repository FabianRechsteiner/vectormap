(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const key = "vectormap-theme";
  let preference;
  try { preference = localStorage.getItem(key); } catch (_) { /* Storage may be unavailable. */ }
  if (!["light", "dark"].includes(preference)) preference = null;
  const apply = () => {
    const theme = preference || (media.matches ? "dark" : "light");
    root.dataset.theme = theme;
    const dark = theme === "dark";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0d1719" : "#f7f9f8";
    const button = document.getElementById("theme-toggle");
    if (button) {
      const label = dark ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.querySelector("[data-sun]").hidden = !dark;
      button.querySelector("[data-moon]").hidden = dark;
    }
  };
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch (_) { /* Keep the current session usable. */ }
      apply();
    });
  });
  if (media.addEventListener) media.addEventListener("change", apply);
  else media.addListener(apply);
})();
