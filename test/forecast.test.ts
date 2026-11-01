import { describe, expect, it } from 'vitest';
import { cached } from '../src/cache';
import { dailyWeatherCode, forecastUrl, parseForecast } from '../src/forecast';
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

  it('zeigt den Stundenverlauf ab 0 Uhr heute bis 24 h nach der aktuellen Stunde', () => {
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
    // 00:00–04:00 (Vergangenes) + 24 h ab 05:00
    expect(f.nowIndex).toBe(5);
    expect(f.hourly).toHaveLength(29);
    expect(f.hourly[0].time).toBe('2026-10-26T00:00');
    expect(f.hourly[f.nowIndex].temperature).toBe(5);
    // Detailansicht: ab 0 Uhr bis 48 h ab der aktuellen Stunde (die Daten reichen nur bis 23:00 am Folgetag)
    expect(f.hourlyDetail).toHaveLength(48);
    expect(f.hourlyDetail[f.nowIndex]).toMatchObject({ apparentTemperature: 3, weatherCode: 3, isDay: true });
    expect(f.current.isDay).toBe(false);
    // „Heute“ gilt für den ganzen Tag, inklusive Regen von heute früh
    expect(f.daily[0]).toMatchObject({ precipitationProbability: 70, precipitationSum: 1.2, tempMax: 10 });
    expect(f.solar[0]).toMatchObject({ sunrise: '2026-10-26T07:02', sunshine: 12600, panelKwhM2: 3 });
    expect(f.hourlyDetail.every((h) => h.gti >= 0)).toBe(true);
  });
});

describe('Tagessymbol', () => {
  const daylight = 10 * 3600;
  it('richtet trockene Tage nach den Sonnenstunden aus', () => {
    // API meldet „Bedeckt“, obwohl 8 von 10 h die Sonne scheint
    expect(dailyWeatherCode(3, 8 * 3600, daylight, [3, 1, 0])).toBe(0);
    expect(dailyWeatherCode(3, 6 * 3600, daylight, [])).toBe(1);
    expect(dailyWeatherCode(0, 3 * 3600, daylight, [])).toBe(2);
    expect(dailyWeatherCode(2, 0, daylight, [3, 3, 2])).toBe(3);
  });

  it('zeigt Nebel nur bei überwiegend nebligen Stunden', () => {
    expect(dailyWeatherCode(45, 6.7 * 3600, daylight, [45, 1, 1, 0])).toBe(1);
    expect(dailyWeatherCode(45, 0, daylight, [45, 45, 45, 3])).toBe(45);
    expect(dailyWeatherCode(45, 0, daylight, [45, 3, 3, 3])).toBe(3);
  });

  it('behält Niederschlag und Gewitter bei', () => {
    expect(dailyWeatherCode(61, 8 * 3600, daylight, [])).toBe(61);
    expect(dailyWeatherCode(95, 0, daylight, [])).toBe(95);
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
