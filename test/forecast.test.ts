import { describe, expect, it } from 'vitest';
import { cached } from '../src/cache';
import { forecastUrl, parseForecast } from '../src/forecast';
import { formatWarnings } from '../src/map';
import { normalizeSolar, toOpenMeteoAzimuth } from '../src/solar-settings';
import { compass, describeWeather } from '../src/weathercodes';

describe('forecast', () => {
  it('baut die Open-Meteo-URL mit best_match und Modulausrichtung', () => {
    const url = new URL(forecastUrl(52.52, 13.405, { tilt: 35, bearing: 90, kwp: null }));
    expect(url.searchParams.get('tilt')).toBe('35');
    expect(url.searchParams.get('azimuth')).toBe('-90'); // Ost
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
        apparent_temperature: hours.map((_, i) => i - 2),
        precipitation_probability: hours.map((_, i) => (i < 5 ? 90 : i === 7 ? 30 : 10)),
        // Regen nur heute früh (bis 05:00), danach trocken
        precipitation: hours.map((_, i) => (i < 5 ? 0.4 : 0)),
        weather_code: hours.map((_, i) => (i < 5 ? 61 : 3)),
        is_day: hours.map(() => 1),
        // 26.10.: 10 Stunden à 300 W/m² = 3 kWh/m²; ein negativer Ausreißer wird ignoriert
        global_tilted_irradiance: hours.map((_, i) => (i < 24 && i >= 8 && i < 18 ? 300 : i === 20 ? -2 : 0)),
        cloud_cover: hours.map(() => 40),
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
        sunrise: ['2026-10-26T07:02'],
        sunset: ['2026-10-26T16:51'],
        daylight_duration: [35340],
        sunshine_duration: [12600],
        uv_index_max: [1.5],
      },
    });
    expect(f.hourly).toHaveLength(24);
    expect(f.hourly[0].temperature).toBe(5);
    // Detailansicht: bis zu 48 h ab der aktuellen Stunde (hier stehen ab 05:00 noch 43 h zur Verfügung)
    expect(f.hourlyDetail).toHaveLength(43);
    expect(f.hourlyDetail[0]).toMatchObject({ apparentTemperature: 3, weatherCode: 3, isDay: true });
    expect(f.current.isDay).toBe(false);
    // „Heute“: Tageswerte der API (70 %, 1,2 mm, Regen) durch die restlichen Stunden ersetzt
    expect(f.daily[0]).toMatchObject({ precipitationProbability: 30, precipitationSum: 0, weatherCode: 3, tempMax: 10 });
    expect(f.solar[0]).toMatchObject({ sunrise: '2026-10-26T07:02', sunshine: 12600, panelKwhM2: 3 });
    expect(f.hourlyDetail.every((h) => h.gti >= 0)).toBe(true);
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

describe('Solar-Einstellungen', () => {
  it('rechnet Kompassrichtung in den Open-Meteo-Azimut um (0 = Süd, −90 = Ost, 90 = West)', () => {
    expect(toOpenMeteoAzimuth(180)).toBe(0);
    expect(toOpenMeteoAzimuth(90)).toBe(-90);
    expect(toOpenMeteoAzimuth(270)).toBe(90);
    expect(Math.abs(toOpenMeteoAzimuth(0))).toBe(180);
    expect(toOpenMeteoAzimuth(135)).toBe(-45);
  });

  it('begrenzt ungültige Eingaben', () => {
    expect(normalizeSolar({ tilt: 120, bearing: -90, kwp: -3 })).toEqual({ tilt: 90, bearing: 270, kwp: null });
    expect(normalizeSolar({ tilt: NaN, bearing: 200.4, kwp: 9.8 })).toEqual({ tilt: 30, bearing: 200, kwp: 9.8 });
  });
});
