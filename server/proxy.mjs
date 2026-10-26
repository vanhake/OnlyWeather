// Minimaler Produktionsserver ohne Abhängigkeiten:
//  - liefert den Vite-Build aus ./dist aus
//  - reicht GET-Anfragen unter /dwd/geoserver/... an https://maps.dwd.de/geoserver/... weiter
//    (nur nötig, falls der DWD-GeoServer keine CORS-Header sendet).
// Start: npm run build && npm run serve   (PORT=8080 per Umgebungsvariable änderbar)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = resolve(process.env.DIST_DIR ?? 'dist');
const UPSTREAM = 'https://maps.dwd.de';
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

async function serveStatic(res, pathname) {
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) {
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

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/dwd/')) return void proxy(req, res, url.pathname.slice(4) + url.search);
  return void serveStatic(res, url.pathname);
}).listen(PORT, () => console.log(`OnlyWeather läuft auf http://localhost:${PORT}`));
