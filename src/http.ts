export class FetchError extends Error {}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new FetchError('Keine Verbindung zum Datendienst.');
  }
  if (!res.ok) {
    let reason = '';
    try {
      reason = ((await res.json()) as { reason?: string }).reason ?? '';
    } catch {
      // Antwort ohne JSON-Fehlertext
    }
    throw new FetchError(`Datendienst antwortet mit Fehler ${res.status}${reason ? `: ${reason}` : ''}.`);
  }
  return (await res.json()) as T;
}
