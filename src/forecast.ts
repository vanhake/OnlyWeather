import { cached } from './cache';
import { FORECAST_CACHE_MS, OPEN_METEO_FORECAST } from './config';
import { fetchJson } from './http';
import { DEFAULT_SOLAR, toOpenMeteoAzimuth, type SolarSettings } from './solar-settings';

export interface Hour {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number | null;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
  /** Einstrahlung auf die Modulebene (W/m², Mittel der vorangegangenen Stunde) */
  gti: number;
  cloudCover: number;
}

export interface SolarDay {
  date: string;
  sunrise: string;
  sunset: string;
  /** Tageslänge in Sekunden */
  daylight: number;
  /** Sonnenscheindauer in Sekunden */
  sunshine: number;
  uvMax: number | null;
  /** Summe der Einstrahlung auf die Modulebene in kWh/m² */
  panelKwhM2: number;
}

export interface Forecast {
  current: {
    time: string;
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
    isDay: boolean;
    precipitation: number;
    windSpeed: number;
    windGusts: number;
    windDirection: number;
  };
  /** Heute ab 00:00 Uhr bis 24 h nach der aktuellen Stunde */
  hourly: Hour[];
  /** Heute ab 00:00 Uhr bis 48 h nach der aktuellen Stunde, für die Detail-Tabs */
  hourlyDetail: Hour[];
  /** Index der aktuellen Stunde in hourly und hourlyDetail (davor liegt Vergangenes) */
  nowIndex: number;
  /** Tageswerte, jeweils für den ganzen Tag */
  daily: {
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitationSum: number;
    precipitationProbability: number | null;
    windSpeedMax: number;
    windGustsMax: number;
    windDirection: number;
  }[];
  solar: SolarDay[];
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: (number | null)[];
    precipitation: number[];
    weather_code: number[];
    is_day: number[];
    global_tilted_irradiance: (number | null)[];
    cloud_cover: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    sunrise: string[];
    sunset: string[];
    daylight_duration: number[];
    sunshine_duration: number[];
    uv_index_max: (number | null)[];
  };
}

export function forecastUrl(lat: number, lon: number, solar: SolarSettings = DEFAULT_SOLAR): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    // Neigung und Ausrichtung der Module für global_tilted_irradiance
    tilt: String(solar.tilt),
    azimuth: String(toOpenMeteoAzimuth(solar.bearing)),
    models: 'best_match',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
    current: [
      'temperature_2m',
      'apparent_temperature',
      'weather_code',
      'is_day',
      'precipitation',
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'is_day',
      'global_tilted_irradiance',
      'cloud_cover',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'sunrise',
      'sunset',
      'daylight_duration',
      'sunshine_duration',
      'uv_index_max',
    ].join(','),
  });
  return `${OPEN_METEO_FORECAST}?${params}`;
}

/**
 * Wettersymbol für einen ganzen Tag.
 *
 * Open-Meteo liefert als Tages-weather_code den „schwersten“ Code des Tages: Eine einzige bedeckte
 * Stunde macht den ganzen Tag zu „Bedeckt“, eine Stunde Frühnebel zu „Nebel“ – auch bei 8 h Sonne.
 * Niederschlag und Gewitter (Code ≥ 51) bleiben deshalb erhalten; für trockene Tage richtet sich das
 * Symbol nach dem Anteil der Sonnenstunden an der Tageslänge, damit es zur angezeigten Sonnenscheindauer
 * passt. Nebel nur, wenn er den überwiegenden Teil der hellen Stunden anhält.
 */
export function dailyWeatherCode(apiCode: number, sunshine: number, daylight: number, dayCodes: number[]): number {
  if (apiCode >= 51 || !(daylight > 0)) return apiCode;
  const ratio = sunshine / daylight;
  if (ratio >= 0.75) return 0;
  if (ratio >= 0.5) return 1;
  if (ratio >= 0.25) return 2;
  const fog = dayCodes.filter((c) => c === 45 || c === 48).length;
  if (dayCodes.length > 0 && fog > dayCodes.length / 2) return dayCodes.includes(48) ? 48 : 45;
  return 3;
}

export function parseForecast(r: OpenMeteoResponse): Forecast {
  const c = r.current;
  // Open-Meteo liefert Ortszeit ohne Offset; die aktuelle Stunde ist der Präfix von current.time.
  const currentHour = c.time.slice(0, 13);
  const h = r.hourly;
  let now = h.time.findIndex((t) => t.slice(0, 13) === currentHour);
  if (now < 0) now = 0;
  // Ab Mitternacht des aktuellen Tages, damit auch der bisherige Tagesverlauf sichtbar bleibt.
  const today = c.time.slice(0, 10);
  let start = h.time.findIndex((t) => t.slice(0, 10) === today);
  if (start < 0 || start > now) start = now;
  const toHour = (i: number): Hour => ({
    time: h.time[i],
    temperature: h.temperature_2m[i],
    apparentTemperature: h.apparent_temperature[i],
    precipitationProbability: h.precipitation_probability[i],
    precipitation: h.precipitation[i],
    weatherCode: h.weather_code[i],
    isDay: h.is_day[i] === 1,
    // Vereinzelt liefert die API leicht negative Werte; physikalisch ist das 0.
    gti: Math.max(0, h.global_tilted_irradiance[i] ?? 0),
    cloudCover: h.cloud_cover[i],
  });
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, Math.min(to, h.time.length) - from) }, (_, k) => toHour(from + k));
  const hourlyDetail = range(start, now + 48);
  const d = r.daily;
  // Tagessumme der Modul-Einstrahlung aus den Stundenwerten (W/m² × 1 h → Wh/m²)
  const panelWh = new Map<string, number>();
  h.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    panelWh.set(day, (panelWh.get(day) ?? 0) + Math.max(0, h.global_tilted_irradiance[i] ?? 0));
  });
  return {
    current: {
      time: c.time,
      temperature: c.temperature_2m,
      apparentTemperature: c.apparent_temperature,
      weatherCode: c.weather_code,
      isDay: c.is_day === 1,
      precipitation: c.precipitation,
      windSpeed: c.wind_speed_10m,
      windGusts: c.wind_gusts_10m,
      windDirection: c.wind_direction_10m,
    },
    hourly: range(start, now + 24),
    hourlyDetail,
    nowIndex: now - start,
    daily: d.time.map((date, i) => ({
      date,
      weatherCode: dailyWeatherCode(
        d.weather_code[i],
        d.sunshine_duration[i],
        d.daylight_duration[i],
        h.weather_code.filter((_, k) => h.time[k].slice(0, 10) === date && h.is_day[k] === 1),
      ),
      tempMax: d.temperature_2m_max[i],
      tempMin: d.temperature_2m_min[i],
      precipitationSum: d.precipitation_sum[i],
      precipitationProbability: d.precipitation_probability_max[i],
      windSpeedMax: d.wind_speed_10m_max[i],
      windGustsMax: d.wind_gusts_10m_max[i],
      windDirection: d.wind_direction_10m_dominant[i],
    })),
    solar: d.time.map((date, i) => ({
      date,
      sunrise: d.sunrise[i],
      sunset: d.sunset[i],
      daylight: d.daylight_duration[i],
      sunshine: d.sunshine_duration[i],
      uvMax: d.uv_index_max[i],
      panelKwhM2: (panelWh.get(date) ?? 0) / 1000,
    })),
  };
}

export async function loadForecast(lat: number, lon: number, solar?: SolarSettings): Promise<Forecast> {
  const url = forecastUrl(lat, lon, solar);
  const raw = await cached(url, FORECAST_CACHE_MS, () => fetchJson<OpenMeteoResponse>(url));
  return parseForecast(raw);
}
