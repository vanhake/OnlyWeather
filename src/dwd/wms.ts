import L from 'leaflet';
import { DWD_ORIGIN, DWD_WMS_PATH } from '../config';
import { toIso } from './time';

export const WMS_URL = DWD_ORIGIN + DWD_WMS_PATH;

export interface ImageRequest {
  bounds: L.LatLngBounds;
  bbox3857: [number, number, number, number];
  width: number;
  height: number;
}

/** Ausschnitt für ein Einzelbild: sichtbarer Bereich plus Rand, Pixelgröße begrenzt. */
export function imageRequestFor(map: L.Map, pad = 0.15, maxPx = 1400): ImageRequest {
  const bounds = map.getBounds().pad(pad);
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const size = map.getSize();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  let width = size.x * (1 + 2 * pad) * ratio;
  let height = size.y * (1 + 2 * pad) * ratio;
  const scale = Math.min(1, maxPx / Math.max(width, height));
  width = Math.max(64, Math.round(width * scale));
  height = Math.max(64, Math.round(height * scale));
  return { bounds, bbox3857: [sw.x, sw.y, ne.x, ne.y], width, height };
}

export function getMapUrl(layer: string, req: ImageRequest, time?: number): string {
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: layer,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    crs: 'EPSG:3857',
    bbox: req.bbox3857.map((v) => v.toFixed(1)).join(','),
    width: String(req.width),
    height: String(req.height),
  });
  if (time !== undefined) params.set('time', toIso(time));
  return `${WMS_URL}?${params}`;
}

export function legendUrl(layer: string): string {
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetLegendGraphic',
    format: 'image/png',
    layer,
  });
  return `${WMS_URL}?${params}`;
}
