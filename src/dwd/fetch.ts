import { DWD_ORIGIN, DWD_PROXY_PREFIX } from '../config';

let useProxy: boolean | null = null;

/**
 * Lädt eine Text-Antwort vom DWD-GeoServer. Zuerst direkt; scheitert das (z. B. an
 * fehlenden CORS-Headern), über den lokalen Proxy unter /dwd. Der funktionierende Weg
 * wird für weitere Abfragen gemerkt.
 */
export async function dwdFetchText(pathAndQuery: string, signal?: AbortSignal): Promise<string> {
  const routes = useProxy === true ? [true] : useProxy === false ? [false, true] : [false, true];
  let lastError: unknown;
  for (const proxied of routes) {
    const url = (proxied ? DWD_PROXY_PREFIX : DWD_ORIGIN) + pathAndQuery;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Ein fehlender Proxy liefert bei Vite/Static-Hosting oft index.html statt XML/JSON.
      if (proxied && /^\s*<!doctype html/i.test(text)) throw new Error('Proxy nicht verfügbar');
      useProxy = proxied;
      return text;
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      lastError = err;
    }
  }
  throw new Error(`DWD-GeoServer nicht erreichbar (${(lastError as Error)?.message ?? 'unbekannt'}).`);
}
