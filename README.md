# Vectormap

- Code-Lizenz: BSD-3-Clause License (siehe LICENSE)
- Daten-Lizenz: siehe DATA_LICENSE.md
- Quellenangabe erforderlich (kantonal unterschiedlich), siehe Tabelle in DATA_LICENSE.md

## PWA

Die Website unterstuetzt eine schlanke Progressive-Web-App-Basis:

- Installierbar ueber `manifest.webmanifest`
- Service Worker mit Offline-Fallback auf `offline.html`
- Lokale Kernseiten und lokale Assets werden gecacht
- Externe Kartenressourcen (Tiles, Glyphs, Sprites, CDN-Dateien) werden bewusst nicht aggressiv offline gecacht

### Entwicklung und Test

- Nach Aenderungen am Service Worker Browser-Tab neu laden und ggf. den Service-Worker-Cache in den DevTools loeschen.
- Fuer einen Offline-Test in DevTools den Netzwerkmodus auf `Offline` setzen und eine Seite neu laden.
