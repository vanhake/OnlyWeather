import { DEFAULT_PLACE, OPEN_METEO_GEOCODING } from './config';
import { fetchJson } from './http';

export interface Place {
  name: string;
  detail?: string;
  lat: number;
  lon: number;
  /** Eintrag für den per Geolocation ermittelten Standort */
  gps?: boolean;
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
          gps: true,
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
