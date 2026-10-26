import { describe, expect, it } from 'vitest';
import { cached } from '../src/cache';
import { forecastUrl, parseForecast } from '../src/forecast';
import { formatWarnings } from '../src/map';
import { compass, describeWeather } from '../src/weathercodes';

describe('forecast', () => {
  it('baut die Open-Meteo-URL mit best_match', () => {
    const url = new URL(forecastUrl(52.52, 13.405));
    expect(url.searchParams.get('models')).toBe('best_match');
    expect(url.searchParams.get('daily')).toContain('precipitation_probability_max');
  });

  it('schneidet den Stundenverlauf ab der aktuellen Stunde auf 24 Werte', () => {
    const hours = Array.from({ length: 48 }, (_, i) => `2026-10-26T${String(i % 24).padStart(2, '0')}:00`);
    const f = parseForecast({
      current: {
        time: '2026-10-26T05:45',
        temperature_2m: 8,
        apparent_temperature: 6,
        weather_code: 61,
        is_day: 0,
        precipitation: 0.3,
        wind_speed_10m: 12,
        wind_gusts_10m: 30,
        wind_direction_10m: 225,
      },
      hourly: {
        time: hours,
        temperature_2m: hours.map((_, i) => i),
        precipitation_probability: hours.map(() => 50),
        precipitation: hours.map(() => 0),
      },
      daily: {
        time: ['2026-10-26'],
        weather_code: [3],
        temperature_2m_max: [10],
        temperature_2m_min: [4],
        precipitation_sum: [1.2],
        precipitation_probability_max: [70],
        wind_speed_10m_max: [20],
        wind_gusts_10m_max: [40],
        wind_direction_10m_dominant: [270],
      },
    });
    expect(f.hourly).toHaveLength(24);
    expect(f.hourly[0].temperature).toBe(5);
    expect(f.current.isDay).toBe(false);
    expect(f.daily[0].precipitationProbability).toBe(70);
  });
});

describe('Hilfsfunktionen', () => {
  it('übersetzt WMO-Codes und Windrichtungen', () => {
    expect(describeWeather(95).text).toBe('Gewitter');
    expect(describeWeather(0, false).icon).toBe('🌙');
    expect(describeWeather(1234).text).toBe('Unbekannt');
    expect(compass(0)).toBe('N');
    expect(compass(225)).toBe('SW');
    expect(compass(359)).toBe('N');
  });

  it('cacht Antworten für die angegebene Dauer', async () => {
    let t = 0;
    let calls = 0;
    const load = async () => ++calls;
    expect(await cached('k', 600_000, load, () => t)).toBe(1);
    t = 599_999;
    expect(await cached('k', 600_000, load, () => t)).toBe(1);
    t = 600_000;
    expect(await cached('k', 600_000, load, () => t)).toBe(2);
  });

  it('formatiert DWD-Warnungen und escaped HTML', () => {
    expect(formatWarnings([])).toMatch(/Keine amtliche Warnung/);
    const html = formatWarnings([{ properties: { EVENT: 'STURMBÖEN', HEADLINE: 'Amtliche WARNUNG vor <STURMBÖEN>' } }]);
    expect(html).toContain('&#60;STURMBÖEN&#62;');
  });
});
