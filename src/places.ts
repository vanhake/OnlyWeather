import type { Place } from './location';

const LIST_KEY = 'onlyweather.places';
const INDEX_KEY = 'onlyweather.placeIndex';
/** Frühere Versionen speicherten nur einen Ort unter diesem Schlüssel. */
const LEGACY_KEY = 'onlyweather.place';

function isPlace(p: unknown): p is Place {
  const o = p as Place;
  return !!o && typeof o.name === 'string' && Number.isFinite(o.lat) && Number.isFinite(o.lon);
}

/** Zwei Einträge gelten als derselbe Ort, wenn sie weniger als ca. 1 km auseinanderliegen. */
export function samePlace(a: Place, b: Place): boolean {
  return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.015;
}

/** Gespeicherte Ortsliste mit aktuell gewähltem Eintrag. */
export class PlaceList {
  places: Place[] = [];
  index = 0;

  constructor(private storage: Storage | null = safeStorage()) {
    this.load();
  }

  get current(): Place | undefined {
    return this.places[this.index];
  }

  get length(): number {
    return this.places.length;
  }

  select(index: number): void {
    if (!this.places.length) return;
    this.index = ((index % this.places.length) + this.places.length) % this.places.length;
    this.save();
  }

  /** Fügt einen Ort hinzu (oder wählt ihn, falls schon vorhanden) und macht ihn zum aktuellen. */
  add(place: Place): void {
    const existing = this.places.findIndex((p) => !p.gps && samePlace(p, place));
    if (existing >= 0) {
      this.select(existing);
      return;
    }
    this.places.push({ ...place, gps: undefined });
    this.select(this.places.length - 1);
  }

  /** Setzt den GPS-Eintrag (immer an erster Stelle) und wählt ihn. */
  setGps(place: Place): void {
    const entry = { ...place, gps: true };
    if (this.places[0]?.gps) this.places[0] = entry;
    else this.places.unshift(entry);
    this.select(0);
  }

  removeCurrent(): void {
    if (!this.places.length) return;
    this.places.splice(this.index, 1);
    this.index = Math.min(this.index, Math.max(0, this.places.length - 1));
    this.save();
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(LIST_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) this.places = list.filter(isPlace);
      } else {
        const legacy = this.storage?.getItem(LEGACY_KEY);
        const p = legacy ? JSON.parse(legacy) : null;
        if (isPlace(p)) this.places = [p.name === 'Mein Standort' ? { ...p, gps: true } : p];
      }
      const idx = Number(this.storage?.getItem(INDEX_KEY) ?? 0);
      this.index = Number.isInteger(idx) && idx >= 0 && idx < this.places.length ? idx : 0;
    } catch {
      this.places = [];
      this.index = 0;
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(LIST_KEY, JSON.stringify(this.places));
      this.storage?.setItem(INDEX_KEY, String(this.index));
      this.storage?.removeItem(LEGACY_KEY);
    } catch {
      // ohne Speicher bleibt die Liste nur für diese Sitzung erhalten
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
