import { DWD_WMS_PATH } from '../config';
import { dwdFetchText } from './fetch';

export interface WmsLayer {
  name: string;
  title: string;
  /** Inhalt von <Dimension name="time">, falls vorhanden */
  time?: string;
  /** default-Attribut der Zeitdimension (z. B. "current" oder ein ISO-Zeitpunkt) */
  timeDefault?: string;
  legendUrl?: string;
}

function childText(node: Element, local: string): string | undefined {
  for (const c of Array.from(node.children)) if (c.localName === local) return c.textContent?.trim();
  return undefined;
}

/** Liest alle benannten Layer aus einem WMS-1.3.0-GetCapabilities-Dokument. */
export function parseCapabilities(xml: string): WmsLayer[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GetCapabilities ist kein gültiges XML.');
  if (doc.documentElement.localName === 'ServiceExceptionReport') {
    throw new Error(`DWD-GeoServer meldet: ${doc.documentElement.textContent?.trim()}`);
  }
  const layers: WmsLayer[] = [];
  for (const node of Array.from(doc.getElementsByTagNameNS('*', 'Layer'))) {
    const name = childText(node, 'Name');
    if (!name) continue;
    const layer: WmsLayer = { name, title: childText(node, 'Title') ?? name };
    for (const c of Array.from(node.children)) {
      if ((c.localName === 'Dimension' || c.localName === 'Extent') && c.getAttribute('name') === 'time') {
        const text = c.textContent?.trim();
        if (text) layer.time = text;
        layer.timeDefault = c.getAttribute('default') ?? undefined;
      }
      if (c.localName === 'Style' && !layer.legendUrl) {
        const res = c.getElementsByTagNameNS('*', 'OnlineResource')[0];
        const href = res?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? res?.getAttribute('xlink:href');
        if (href) layer.legendUrl = href;
      }
    }
    layers.push(layer);
  }
  return layers;
}

/** Normalisiert Layer-Namen: GeoServer nennt sie im Namespace-Dienst teils ohne "dwd:"-Präfix. */
export function bareName(name: string): string {
  return name.replace(/^dwd:/, '');
}

export function findLayer(layers: WmsLayer[], candidates: string[]): WmsLayer | undefined {
  for (const c of candidates) {
    const hit = layers.find((l) => bareName(l.name) === bareName(c));
    if (hit) return hit;
  }
  return undefined;
}

let pending: Promise<WmsLayer[]> | null = null;
let fetchedAt = 0;

/** GetCapabilities des DWD-Namespaces, höchstens einmal pro maxAgeMs neu geladen. */
export function loadCapabilities(maxAgeMs = 4 * 60 * 1000): Promise<WmsLayer[]> {
  if (pending && Date.now() - fetchedAt < maxAgeMs) return pending;
  fetchedAt = Date.now();
  pending = dwdFetchText(`${DWD_WMS_PATH}?service=WMS&version=1.3.0&request=GetCapabilities`)
    .then(parseCapabilities)
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
