import { cached } from './cache';
import { FORECAST_CACHE_MS, OPEN_METEO_FORECAST } from './config';
import { fetchJson } from './http';

export interface Hour {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number | null;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
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
  /** Nächste 24 h ab der aktuellen Stunde */
  hourly: Hour[];
  /** Nächste 48 h ab der aktuellen Stunde, für die Detail-Tabs */
  hourlyDetail: Hour[];
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
  };
}

export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
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
    ].join(','),
  });
  return `${OPEN_METEO_FORECAST}?${params}`;
}

export function parseForecast(r: OpenMeteoResponse): Forecast {
  const c = r.current;
  // Open-Meteo liefert Ortszeit ohne Offset; die aktuelle Stunde ist der Präfix von current.time.
  const currentHour = c.time.slice(0, 13);
  let start = r.hourly.time.findIndex((t) => t.slice(0, 13) === currentHour);
  if (start < 0) start = 0;
  const h = r.hourly;
  const hourlyDetail: Hour[] = h.time.slice(start, start + 48).map((time, k) => {
    const i = start + k;
    return {
      time,
      temperature: h.temperature_2m[i],
      apparentTemperature: h.apparent_temperature[i],
      precipitationProbability: h.precipitation_probability[i],
      precipitation: h.precipitation[i],
      weatherCode: h.weather_code[i],
      isDay: h.is_day[i] === 1,
    };
  });
  const d = r.daily;
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
    hourly: hourlyDetail.slice(0, 24),
    hourlyDetail,
    daily: d.time.map((date, i) => ({
      date,
      weatherCode: d.weather_code[i],
      tempMax: d.temperature_2m_max[i],
      tempMin: d.temperature_2m_min[i],
      precipitationSum: d.precipitation_sum[i],
      precipitationProbability: d.precipitation_probability_max[i],
      windSpeedMax: d.wind_speed_10m_max[i],
      windGustsMax: d.wind_gusts_10m_max[i],
      windDirection: d.wind_direction_10m_dominant[i],
    })),
  };
}

export async function loadForecast(lat: number, lon: number): Promise<Forecast> {
  const url = forecastUrl(lat, lon);
  const raw = await cached(url, FORECAST_CACHE_MS, () => fetchJson<OpenMeteoResponse>(url));
  return parseForecast(raw);
}
