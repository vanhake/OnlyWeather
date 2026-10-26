/** Wandelt eine ISO-8601-Dauer (z. B. PT5M, PT1H, P1D) in Millisekunden um. */
export function parseIsoDuration(text: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text.trim());
  if (!m) return NaN;
  const [, d, h, min, s] = m;
  return ((Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(min ?? 0)) * 60_000 + Number(s ?? 0) * 1000;
}

/**
 * Wertet den Inhalt einer WMS-Zeitdimension aus. GeoServer liefert entweder eine
 * Kommaliste einzelner Zeitpunkte oder Intervalle "start/ende/periode" (auch gemischt).
 * Zurückgegeben werden aufsteigend sortierte Zeitstempel in ms, eingeschränkt auf [from, to].
 */
export function expandTimeDimension(text: string, from = -Infinity, to = Infinity): number[] {
  const out = new Set<number>();
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const pieces = part.split('/');
    if (pieces.length === 3) {
      const start = Date.parse(pieces[0]);
      const end = Date.parse(pieces[1]);
      const period = parseIsoDuration(pieces[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !(period > 0)) continue;
      // Direkt zum ersten Schritt im gewünschten Fenster springen.
      const first = from > start ? start + Math.ceil((from - start) / period) * period : start;
      for (let t = first; t <= end && t <= to; t += period) out.add(t);
    } else {
      const t = Date.parse(pieces[0]);
      if (Number.isFinite(t) && t >= from && t <= to) out.add(t);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function toIso(t: number): string {
  return new Date(t).toISOString().replace('.000Z', 'Z');
}
