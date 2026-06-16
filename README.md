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

### Karten als eigene App installieren

Jede Karte unter `maps/<name>/` kann als eigene Web-App installiert werden und startet wieder auf ihrer jeweiligen Karten-URL.

- Android (Chrome): Menü (drei Punkte) -> `App installieren` oder `Zum Startbildschirm hinzufuegen`
- iOS (Safari): Teilen -> `Zum Home-Bildschirm`
- Nach Manifest- oder Icon-Aenderungen ggf. alte App-Verknuepfung entfernen und neu installieren

### Regel fuer neue Karten

Damit neue Karten automatisch installierbar sind, muss in jeder neuen Karten-Seite unter `maps/<name>/index.html` nur dieses Script eingebunden werden:

- `../../assets/js/map-page-pwa.js`

Optional kann pro Seite `window.vectormapMapPwa` gesetzt werden, um App-Name und Kurzname zu steuern.

### Entwicklung und Test

- Nach Aenderungen am Service Worker Browser-Tab neu laden und ggf. den Service-Worker-Cache in den DevTools loeschen.
- Fuer einen Offline-Test in DevTools den Netzwerkmodus auf `Offline` setzen und eine Seite neu laden.
