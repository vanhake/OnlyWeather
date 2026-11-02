// Minimaler Produktionsserver ohne Abhängigkeiten:
//  - liefert den Vite-Build aus ./dist aus
//  - reicht GET-Anfragen unter /dwd/geoserver/... an https://maps.dwd.de/geoserver/... weiter
//    (nur nötig, falls der DWD-GeoServer keine CORS-Header sendet).
// Start: npm run build && npm run serve   (PORT=8080 per Umgebungsvariable änderbar)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { CSP } from './csp.mjs';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = resolve(process.env.DIST_DIR ?? 'dist');
const UPSTREAM = 'https://maps.dwd.de';
// Für alle Antworten: kein MIME-Sniffing, kein Referrer an Dritte, keine Einbettung in fremde Seiten.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': CSP,
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function proxy(req, res, path) {
  // Nur der GeoServer-Pfad und nur lesende Anfragen – kein offener Proxy.
  if (req.method !== 'GET' || !path.startsWith('/geoserver/')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const upstream = await fetch(UPSTREAM + path, { signal: AbortSignal.timeout(20000) });
    const headers = { 'cache-control': 'public, max-age=60' };
    const type = upstream.headers.get('content-type');
    if (type) headers['content-type'] = type;
    res.writeHead(upstream.status, headers);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end(`DWD nicht erreichbar: ${err.message}`);
  }
}

/** Liegt file innerhalb von ROOT? Ein reiner Präfixvergleich ließe Nachbarordner wie dist-alt zu. */
function insideRoot(file) {
  const rel = relative(ROOT, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function serveStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Ungültige Prozentkodierung (z. B. "%E0%A4%A"): sonst bräche der URIError den Server ab.
    res.writeHead(400).end('Bad Request');
    return;
  }
  let file = normalize(join(ROOT, decoded));
  if (!insideRoot(file)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const body = await readFile(file);
    const immutable = file.includes(`${join(ROOT, 'assets')}`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found – wurde "npm run build" ausgeführt?');
  }
}

async function handle(req, res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/dwd/')) return proxy(req, res, url.pathname.slice(4) + url.search);
  return serveStatic(res, url.pathname);
}

createServer((req, res) => {
  // Sicherheitsnetz: ein unerwarteter Fehler beendet nur diese Anfrage, nie den ganzen Server.
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`OnlyWeather läuft auf http://localhost:${PORT}`));
