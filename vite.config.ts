import { defineConfig } from 'vitest/config';
import { CSP } from './server/csp.mjs';

// Der DWD-GeoServer liefert Kartenbilder problemlos per <img>. Für XML/JSON-Abfragen
// (GetCapabilities, GetFeatureInfo) braucht der Browser CORS-Header. Fehlen sie,
// weicht die App auf den Pfad /dwd aus, den dieser Proxy (Entwicklung und Vorschau)
// bzw. server/proxy.mjs (Produktion) an maps.dwd.de weiterreicht.
const dwdProxy = {
  '/dwd': {
    target: 'https://maps.dwd.de',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/dwd/, ''),
  },
};

export default defineConfig({
  server: { proxy: dwdProxy },
  // Im Entwicklungsserver keine CSP (Vite-HMR), in der Vorschau dieselbe wie in Produktion.
  preview: { proxy: dwdProxy, headers: { 'Content-Security-Policy': CSP } },
  test: { environment: 'jsdom' },
});
