// Content-Security-Policy für die Web-Auslieferung (server/proxy.mjs und `vite preview`).
// Begrenzt den Schaden einer möglichen XSS-Lücke: Skripte nur von der eigenen Seite,
// Netzwerkzugriffe nur zu den Datenquellen der App.
//
// Nicht für die Android-App: Capacitor fügt seine JS-Brücke als Inline-Skript in die
// Seite ein, das eine strenge script-src blockieren würde.
//
// style-src braucht 'unsafe-inline': Leaflet und einige Diagramme setzen style-Attribute.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://tile.openstreetmap.org https://maps.dwd.de",
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://maps.dwd.de",
  "font-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
