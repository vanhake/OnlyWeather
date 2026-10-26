export const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';

/** Basis des DWD-GeoServers (Namespace "dwd"). */
export const DWD_ORIGIN = 'https://maps.dwd.de';
export const DWD_WMS_PATH = '/geoserver/dwd/wms';
/** Relativer Pfad des CORS-Proxys (vite.config.ts bzw. server/proxy.mjs). */
export const DWD_PROXY_PREFIX = '/dwd';

export const FORECAST_CACHE_MS = 10 * 60 * 1000;
export const RADAR_REFRESH_MS = 5 * 60 * 1000;
export const RADAR_PAST_MS = 2 * 60 * 60 * 1000;
export const RADAR_FUTURE_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_PLACE = { name: 'Berlin', lat: 52.52, lon: 13.405 };

/**
 * Bevorzugte DWD-Layer. Die Namen stammen aus der DWD-Dokumentation ("Populäre Layer",
 * "Populäre Radarlayer"); verwendet wird nur, was GetCapabilities tatsächlich meldet.
 */
export const RADAR_LAYER_CANDIDATES = [
  'dwd:Niederschlagsradar', // Alias auf das jeweils empfohlene Radarprodukt (derzeit RV)
  'dwd:Radar_rv_product_1x1km_ger', // RV-Komposit (RADVOR), Analyse + Nowcast bis +2 h
  'dwd:Radar_wn-product_1x1km_ger', // WN-Komposit (Reflektivität), Analyse + Nowcast
];
export const LIGHTNING_LAYER_CANDIDATES = ['dwd:Blitzdichte'];
export const WARNING_LAYER_CANDIDATES = [
  'dwd:Warnungen_Gemeinden_vereinigt',
  'dwd:Warnungen_Gemeinden',
  'dwd:Warnungen_Landkreise',
];
