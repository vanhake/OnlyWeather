import { RADAR_FUTURE_MS, RADAR_LAYER_CANDIDATES, RADAR_PAST_MS } from '../config';
import { findLayer, type WmsLayer } from './capabilities';
import { expandTimeDimension } from './time';

export interface RadarFrame {
  time: number;
  layer: string;
  forecast: boolean;
}

export interface RadarPlan {
  frames: RadarFrame[];
  /** Zeitpunkt der letzten Beobachtung; danach beginnt die Prognose. */
  boundary: number;
  observedLayer: WmsLayer;
  nowcastLayer?: WmsLayer;
}

const FIVE_MIN = 5 * 60 * 1000;
const GENERIC_RADAR = /radar|radolan|radvor|^(dwd:)?R[VWXY][-_]?(produkt|product)/i;

/** Radar-Layer mit Zeitachse: zuerst die dokumentierten Kandidaten, dann alles, was nach Radar aussieht. */
export function radarCandidates(layers: WmsLayer[]): WmsLayer[] {
  const out: WmsLayer[] = [];
  for (const name of RADAR_LAYER_CANDIDATES) {
    const l = findLayer(layers, [name]);
    if (l?.time) out.push(l);
  }
  for (const l of layers) {
    if (l.time && !out.includes(l) && (GENERIC_RADAR.test(l.name) || GENERIC_RADAR.test(l.title))) out.push(l);
  }
  return out;
}

/** Auf 5-Minuten-Raster ausdünnen, falls der Dienst feiner auflöst. */
function thin(times: number[]): number[] {
  const aligned = times.filter((t) => t % FIVE_MIN === 0);
  return aligned.length >= times.length / 2 ? aligned : times;
}

function parseDefault(layer: WmsLayer): number | undefined {
  const t = layer.timeDefault ? Date.parse(layer.timeDefault) : NaN;
  return Number.isFinite(t) ? t : undefined;
}

export function planRadarFrames(layers: WmsLayer[], now: number): RadarPlan {
  const window = (l: WmsLayer) =>
    thin(expandTimeDimension(l.time ?? '', now - RADAR_PAST_MS - 30 * 60_000, now + RADAR_FUTURE_MS + 10 * 60_000));
  const candidates = radarCandidates(layers).map((layer) => ({ layer, times: window(layer) }));
  const lateTolerance = 60_000;
  // Ein Layer zählt als Beobachtungsquelle, wenn er mindestens die letzte Stunde abdeckt.
  const coversPast = (times: number[]) => times.some((t) => t <= now - RADAR_PAST_MS / 2);
  const hasPast = (times: number[]) => times.some((t) => t <= now);

  // Bevorzugt: ein Layer, der Beobachtung und Nowcast gemeinsam enthält (nahtloser Übergang).
  const combined = candidates.find((c) => coversPast(c.times) && c.times.some((t) => t > now + lateTolerance));
  if (combined) {
    const lastPast = Math.max(...combined.times.filter((t) => t <= now));
    const def = parseDefault(combined.layer);
    const boundary = def !== undefined && def <= now + lateTolerance && def >= now - RADAR_PAST_MS ? def : lastPast;
    const frames = combined.times
      .filter((t) => t >= boundary - RADAR_PAST_MS && t <= boundary + RADAR_FUTURE_MS)
      .map((time) => ({ time, layer: combined.layer.name, forecast: time > boundary }));
    return { frames, boundary, observedLayer: combined.layer, nowcastLayer: combined.layer };
  }

  const observed = candidates.find((c) => coversPast(c.times)) ?? candidates.find((c) => hasPast(c.times));
  if (!observed) throw new Error('Der DWD-WMS bietet derzeit keine Radar-Ebene mit aktuellen Zeitschritten an.');
  const boundary = Math.max(...observed.times.filter((t) => t <= now));
  const nowcast = candidates.find((c) => c !== observed && c.times.some((t) => t > boundary));
  const frames: RadarFrame[] = observed.times
    .filter((t) => t >= boundary - RADAR_PAST_MS && t <= boundary)
    .map((time) => ({ time, layer: observed.layer.name, forecast: false }));
  if (nowcast) {
    for (const time of nowcast.times) {
      if (time > boundary && time <= boundary + RADAR_FUTURE_MS) {
        frames.push({ time, layer: nowcast.layer.name, forecast: true });
      }
    }
  }
  return { frames, boundary, observedLayer: observed.layer, nowcastLayer: nowcast?.layer };
}
