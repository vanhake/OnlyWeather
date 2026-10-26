import { DEFAULT_PLACE, OPEN_METEO_GEOCODING } from './config';
import { fetchJson } from './http';

export interface Place {
  name: string;
  detail?: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = 'onlyweather.place';

export function loadSavedPlace(): Place | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Place;
    return Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function savePlace(place: Place): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch {
    // ohne Speicher geht es auch
  }
}

export const defaultPlace: Place = { ...DEFAULT_PLACE, detail: 'Standard' };

export function locateBrowser(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Dieser Browser unterstützt keine Standortbestimmung.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: 'Mein Standort',
          detail: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Standortfreigabe wurde abgelehnt. Bitte Ort suchen.'
              : 'Standort konnte nicht ermittelt werden. Bitte Ort suchen.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

interface GeocodingResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country_code?: string;
    country?: string;
    postcodes?: string[];
  }[];
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '8', language: 'de', format: 'json' });
  const data = await fetchJson<GeocodingResponse>(`${OPEN_METEO_GEOCODING}?${params}`, signal);
  const results = data.results ?? [];
  // Orte in Deutschland zuerst – das Radar deckt nur Deutschland ab.
  results.sort((a, b) => Number(b.country_code === 'DE') - Number(a.country_code === 'DE'));
  return results.map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country_code === 'DE' ? undefined : r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
