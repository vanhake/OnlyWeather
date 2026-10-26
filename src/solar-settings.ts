export interface SolarSettings {
  /** Neigung der Module in Grad: 0 = waagerecht, 90 = senkrecht */
  tilt: number;
  /** Kompassrichtung der Module in Grad: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West */
  bearing: number;
  /** Nennleistung der Anlage in kWp, optional für die Ertragsschätzung */
  kwp: number | null;
}

const KEY = 'onlyweather.solar';
export const DEFAULT_SOLAR: SolarSettings = { tilt: 30, bearing: 180, kwp: null };
/** Pauschaler Systemwirkungsgrad (Performance Ratio) für die Ertragsschätzung */
export const PERFORMANCE_RATIO = 0.85;

export const DIRECTIONS: { label: string; bearing: number }[] = [
  { label: 'Nord', bearing: 0 },
  { label: 'Nordost', bearing: 45 },
  { label: 'Ost', bearing: 90 },
  { label: 'Südost', bearing: 135 },
  { label: 'Süd', bearing: 180 },
  { label: 'Südwest', bearing: 225 },
  { label: 'West', bearing: 270 },
  { label: 'Nordwest', bearing: 315 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normalizeSolar(s: Partial<SolarSettings>): SolarSettings {
  const tilt = Number.isFinite(s.tilt) ? clamp(Math.round(s.tilt!), 0, 90) : DEFAULT_SOLAR.tilt;
  const bearing = Number.isFinite(s.bearing) ? ((Math.round(s.bearing!) % 360) + 360) % 360 : DEFAULT_SOLAR.bearing;
  const kwp = s.kwp != null && Number.isFinite(s.kwp) && s.kwp > 0 ? Math.min(s.kwp, 1000) : null;
  return { tilt, bearing, kwp };
}

/**
 * Open-Meteo erwartet den Azimut relativ zu Süd: 0 = Süd, −90 = Ost, 90 = West, ±180 = Nord.
 */
export function toOpenMeteoAzimuth(bearing: number): number {
  const a = (((bearing - 180) % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

export function directionLabel(bearing: number): string {
  const exact = DIRECTIONS.find((d) => d.bearing === bearing);
  return exact ? exact.label : `${bearing}°`;
}

export function loadSolar(): SolarSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeSolar(JSON.parse(raw)) : DEFAULT_SOLAR;
  } catch {
    return DEFAULT_SOLAR;
  }
}

export function saveSolar(s: SolarSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher gelten die Einstellungen nur für diese Sitzung
  }
}
