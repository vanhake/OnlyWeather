const PREFIX = 'onlyweather.cache:';

interface Entry<T> {
  t: number;
  v: T;
}

const memory = new Map<string, Entry<unknown>>();

function readStored<T>(key: string): Entry<T> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : undefined;
  } catch {
    return undefined;
  }
}

function writeStored<T>(key: string, entry: Entry<T>): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Speicher voll oder blockiert: der In-Memory-Cache reicht dann.
  }
}

/** Liefert einen Wert aus dem Cache, solange er jünger als maxAgeMs ist, sonst lädt loader neu. */
export async function cached<T>(
  key: string,
  maxAgeMs: number,
  loader: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const hit = (memory.get(key) as Entry<T> | undefined) ?? readStored<T>(key);
  if (hit && now() - hit.t < maxAgeMs) return hit.v;
  const v = await loader();
  const entry = { t: now(), v };
  memory.set(key, entry);
  writeStored(key, entry);
  return v;
}

export function clearCache(): void {
  memory.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // ignorieren
  }
}
