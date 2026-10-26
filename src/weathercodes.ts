interface CodeInfo {
  text: string;
  day: string;
  night: string;
}

// WMO-Wetterschlüssel, wie ihn Open-Meteo in weather_code liefert.
const CODES: Record<number, CodeInfo> = {
  0: { text: 'Klar', day: '☀️', night: '🌙' },
  1: { text: 'Überwiegend klar', day: '🌤️', night: '🌙' },
  2: { text: 'Teilweise bewölkt', day: '⛅', night: '☁️' },
  3: { text: 'Bedeckt', day: '☁️', night: '☁️' },
  45: { text: 'Nebel', day: '🌫️', night: '🌫️' },
  48: { text: 'Gefrierender Nebel', day: '🌫️', night: '🌫️' },
  51: { text: 'Leichter Nieselregen', day: '🌦️', night: '🌧️' },
  53: { text: 'Nieselregen', day: '🌦️', night: '🌧️' },
  55: { text: 'Starker Nieselregen', day: '🌧️', night: '🌧️' },
  56: { text: 'Gefrierender Nieselregen', day: '🌧️', night: '🌧️' },
  57: { text: 'Starker gefrierender Nieselregen', day: '🌧️', night: '🌧️' },
  61: { text: 'Leichter Regen', day: '🌦️', night: '🌧️' },
  63: { text: 'Regen', day: '🌧️', night: '🌧️' },
  65: { text: 'Starker Regen', day: '🌧️', night: '🌧️' },
  66: { text: 'Gefrierender Regen', day: '🌧️', night: '🌧️' },
  67: { text: 'Starker gefrierender Regen', day: '🌧️', night: '🌧️' },
  71: { text: 'Leichter Schneefall', day: '🌨️', night: '🌨️' },
  73: { text: 'Schneefall', day: '🌨️', night: '🌨️' },
  75: { text: 'Starker Schneefall', day: '❄️', night: '❄️' },
  77: { text: 'Schneegriesel', day: '🌨️', night: '🌨️' },
  80: { text: 'Leichte Regenschauer', day: '🌦️', night: '🌧️' },
  81: { text: 'Regenschauer', day: '🌧️', night: '🌧️' },
  82: { text: 'Heftige Regenschauer', day: '🌧️', night: '🌧️' },
  85: { text: 'Schneeschauer', day: '🌨️', night: '🌨️' },
  86: { text: 'Starke Schneeschauer', day: '❄️', night: '❄️' },
  95: { text: 'Gewitter', day: '⛈️', night: '⛈️' },
  96: { text: 'Gewitter mit Hagel', day: '⛈️', night: '⛈️' },
  99: { text: 'Schweres Gewitter mit Hagel', day: '⛈️', night: '⛈️' },
};

export function describeWeather(code: number, isDay = true): { text: string; icon: string } {
  const info = CODES[code];
  if (!info) return { text: 'Unbekannt', icon: '❔' };
  return { text: info.text, icon: isDay ? info.day : info.night };
}

const DIRECTIONS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export function compass(deg: number): string {
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
