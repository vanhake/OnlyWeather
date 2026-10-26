import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIGHTNING_LAYER_CANDIDATES, RADAR_REFRESH_MS, WARNING_LAYER_CANDIDATES } from './config';
import { findLayer, loadCapabilities, type WmsLayer } from './dwd/capabilities';
import { dwdFetchText } from './dwd/fetch';
import { planRadarFrames, type RadarPlan } from './dwd/radar-frames';
import { expandTimeDimension, toIso } from './dwd/time';
import { legendUrl, WMS_URL } from './dwd/wms';
import { RadarAnimator, type RadarProgress } from './radar';
import { Timeline } from './timeline';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Altersstufen der Blitzebene: Startversatz in Minuten vor dem neuesten Zeitschritt. */
const LIGHTNING_AGES = [0, 15, 30, 45];

export class WeatherMap {
  private map: L.Map;
  private marker: L.CircleMarker;
  private animator: RadarAnimator;
  private timeline: Timeline;
  private plan: RadarPlan | null = null;
  private layers: WmsLayer[] = [];
  private lightning: L.LayerGroup = L.layerGroup();
  private warnings: L.TileLayer.WMS | null = null;
  private warningLayer: WmsLayer | undefined;
  private refreshTimer: number | undefined;
  private status = $<HTMLElement>('#radar-status');
  private errorBox = $<HTMLElement>('#map-error');

  constructor(container: HTMLElement, lat: number, lon: number) {
    // Auf Touch-Geräten: ein Finger scrollt die Seite, verschoben/gezoomt wird mit zwei Fingern
    // (Leaflets Pinch-Geste verschiebt die Karte mit). Maus-Ziehen bleibt am Desktop erhalten.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.map = L.map(container, { zoomControl: true, attributionControl: true, dragging: !coarse }).setView(
      [lat, lon],
      8,
    );
    if (coarse) this.setupTwoFingerHint(container);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      className: 'basemap',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(this.map);
    this.map.attributionControl.addAttribution('Radar, Blitze &amp; Warnungen: <a href="https://www.dwd.de">DWD</a>');

    // Reihenfolge der Ebenen: Warnungen unter dem Radar, Blitze darüber.
    for (const [name, z] of [
      ['warnings', 380],
      ['radar', 400],
      ['lightning', 420],
    ] as const) {
      this.map.createPane(name).style.zIndex = String(z);
    }

    this.marker = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 2,
      color: '#ffffff',
      fillColor: '#2a78d6',
      fillOpacity: 1,
      pane: 'markerPane',
    }).addTo(this.map);

    this.timeline = new Timeline($('#timeline'), (i) => this.animator.show(i), (i) => this.animator.isLoaded(i));
    this.animator = new RadarAnimator(
      this.map,
      'radar',
      (p) => this.onProgress(p),
      (i) => this.timeline.markShown(i),
    );

    $<HTMLInputElement>('#toggle-lightning').addEventListener('change', (e) =>
      this.setLightning((e.target as HTMLInputElement).checked),
    );
    $<HTMLInputElement>('#toggle-warnings').addEventListener('change', (e) =>
      this.setWarnings((e.target as HTMLInputElement).checked),
    );
    this.map.on('click', (e: L.LeafletMouseEvent) => this.queryWarnings(e));
    // Nach einem Verbindungsabbruch (z. B. App aus dem Hintergrund geholt) sofort neu laden
    window.addEventListener('online', () => void this.refresh());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.plan && Date.now() - this.plan.boundary > RADAR_REFRESH_MS * 2) {
        void this.refresh();
      }
    });
  }

  private setupTwoFingerHint(container: HTMLElement): void {
    container.classList.add('one-finger-scroll');
    const hint = document.createElement('div');
    hint.className = 'map-hint';
    hint.textContent = 'Zum Verschieben der Karte zwei Finger verwenden';
    hint.setAttribute('aria-hidden', 'true');
    container.parentElement?.appendChild(hint);
    let timer: number | undefined;
    let startY = 0;
    container.addEventListener(
      'touchstart',
      (e) => {
        startY = e.touches[0]?.clientY ?? 0;
        if (e.touches.length > 1) hint.classList.remove('visible');
      },
      { passive: true },
    );
    container.addEventListener(
      'touchmove',
      (e) => {
        // Nur bei eher seitlicher Ein-Finger-Bewegung – senkrechtes Scrollen ist ja gewollt.
        if (e.touches.length !== 1 || Math.abs(e.touches[0].clientY - startY) > 30) return;
        hint.classList.add('visible');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => hint.classList.remove('visible'), 1500);
      },
      { passive: true },
    );
  }

  /** Nach dem Wiedereinblenden (Tab-Wechsel) muss Leaflet die Kartengröße neu messen. */
  invalidateSize(): void {
    this.map.invalidateSize();
  }

  setLocation(lat: number, lon: number): void {
    this.marker.setLatLng([lat, lon]);
    this.map.setView([lat, lon], Math.max(this.map.getZoom(), 8));
  }

  /** Lädt GetCapabilities, plant die Frames und startet die automatische Aktualisierung. */
  async start(): Promise<void> {
    await this.refresh();
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => void this.refresh(), RADAR_REFRESH_MS);
  }

  private async refresh(): Promise<void> {
    this.status.textContent = 'Lade Radardaten …';
    try {
      this.layers = await loadCapabilities();
      const plan = planRadarFrames(this.layers, Date.now());
      if (!plan.frames.length) throw new Error('Keine Radarbilder für die letzten zwei Stunden verfügbar.');
      const wasAtNow = !this.plan || this.timeline.isAtBoundary();
      const prevTime = this.plan ? this.animator.frameAt(this.timeline.index)?.time : undefined;
      this.plan = plan;
      const lastObserved = plan.frames.reduce((acc, f, i) => (f.forecast ? acc : i), 0);
      let start = lastObserved;
      if (!wasAtNow && prevTime !== undefined) {
        const keep = plan.frames.findIndex((f) => f.time === prevTime);
        if (keep >= 0) start = keep;
      }
      this.timeline.setFrames(plan.frames, plan.boundary, start);
      this.animator.setFrames(plan.frames, start);
      this.renderRadarLegend(plan);
      this.hideError();
      // Zusatzebenen mit den neuen Zeitschritten bzw. frischen Kacheln neu aufbauen.
      if ($<HTMLInputElement>('#toggle-lightning').checked) this.setLightning(true);
      if ($<HTMLInputElement>('#toggle-warnings').checked) this.setWarnings(true);
    } catch (err) {
      this.animator.clear();
      this.timeline.setFrames([], 0, 0);
      this.showError(
        `Regenradar derzeit nicht verfügbar. ${(err as Error).message} Die Karte zeigt nur die Basiskarte; ` +
          'ein neuer Versuch folgt automatisch in 5 Minuten.',
      );
      this.status.textContent = '';
    }
  }

  private onProgress(p: RadarProgress): void {
    if (!p.total) return;
    if (p.failed === p.total) {
      this.showError('Die Radarbilder konnten nicht vom DWD-Server geladen werden. Neuer Versuch in 5 Minuten.', 'frames');
    } else if (p.loaded > 0 && this.errorKind === 'frames') {
      // Sobald wieder Bilder ankommen, ist die Meldung überholt.
      this.hideError();
    }
    const layerInfo = this.plan
      ? this.plan.nowcastLayer && this.plan.nowcastLayer !== this.plan.observedLayer
        ? `${this.plan.observedLayer.name} + ${this.plan.nowcastLayer.name}`
        : this.plan.observedLayer.name
      : '';
    const loading = p.loaded + p.failed < p.total ? `Bilder ${p.loaded}/${p.total} geladen` : '';
    const failed = p.failed ? `${p.failed} fehlerhaft` : '';
    this.status.textContent = [loading, failed, layerInfo].filter(Boolean).join(' · ');
    this.timeline.refreshAvailability();
  }

  private renderRadarLegend(plan: RadarPlan): void {
    const box = $<HTMLElement>('#radar-legend');
    const img = document.createElement('img');
    img.alt = `Farblegende ${plan.observedLayer.title}`;
    img.src = plan.observedLayer.legendUrl ?? legendUrl(plan.observedLayer.name);
    img.onerror = () => {
      box.textContent = 'Legende nicht verfügbar.';
    };
    const caption = document.createElement('figcaption');
    caption.textContent = `Niederschlagsintensität · ${plan.observedLayer.title}`;
    box.replaceChildren(caption, img);
  }

  // ---- Blitze ---------------------------------------------------------------------------

  private setLightning(on: boolean): void {
    const note = $<HTMLElement>('#lightning-note');
    this.lightning.clearLayers();
    if (!on) {
      this.map.removeLayer(this.lightning);
      note.hidden = true;
      return;
    }
    note.hidden = false;
    const layer =
      findLayer(this.layers, LIGHTNING_LAYER_CANDIDATES) ?? this.layers.find((l) => /blitz|lightning/i.test(l.name));
    if (!layer) {
      note.textContent = this.layers.length
        ? 'Der DWD-WMS meldet derzeit keine Blitz-Ebene.'
        : 'Blitzdaten nicht verfügbar – DWD-GeoServer nicht erreichbar.';
      return;
    }
    const now = Date.now();
    const times = layer.time ? expandTimeDimension(layer.time, now - 75 * 60_000, now) : [];
    const make = (age: number, time?: number) =>
      L.tileLayer.wms(WMS_URL, {
        layers: layer.name,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        pane: 'lightning',
        className: `lightning-age-${age}`,
        opacity: [1, 0.85, 0.65, 0.45][age],
        ...(time !== undefined ? { time: toIso(time) } : {}),
      } as L.WMSOptions);

    if (times.length) {
      // Neuester Zeitschritt und die Stände 15/30/45 Minuten davor, jeweils nach Alter eingefärbt.
      const newest = times[times.length - 1];
      LIGHTNING_AGES.slice()
        .reverse()
        .forEach((offset, idx) => {
          const target = newest - offset * 60_000;
          const t = times.filter((x) => x <= target).pop();
          if (t !== undefined) this.lightning.addLayer(make(LIGHTNING_AGES.length - 1 - idx, t));
        });
      note.innerHTML = `${layer.title}: Farbe nach Alter – <span class="age age-0">0–15</span>
        <span class="age age-1">15–30</span> <span class="age age-2">30–45</span>
        <span class="age age-3">45–60 min</span>`;
    } else {
      this.lightning.addLayer(make(0));
      note.textContent = `${layer.title} (aktueller Stand, ohne Zeitachse im WMS).`;
    }
    this.lightning.addTo(this.map);
  }

  // ---- Unwetterwarnungen ----------------------------------------------------------------

  private setWarnings(on: boolean): void {
    const legend = $<HTMLElement>('#warning-legend');
    if (this.warnings) this.map.removeLayer(this.warnings);
    this.warnings = null;
    legend.hidden = !on;
    if (!on) return;
    this.warningLayer =
      findLayer(this.layers, WARNING_LAYER_CANDIDATES) ?? this.layers.find((l) => /^(dwd:)?Warnungen/i.test(l.name));
    if (!this.warningLayer) {
      legend.textContent = this.layers.length
        ? 'Der DWD-WMS meldet derzeit keine Warn-Ebene.'
        : 'Warnungen nicht verfügbar – DWD-GeoServer nicht erreichbar.';
      return;
    }
    this.warnings = L.tileLayer
      .wms(WMS_URL, {
        layers: this.warningLayer.name,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        pane: 'warnings',
        opacity: 0.6,
      })
      .addTo(this.map);
    const img = document.createElement('img');
    img.alt = 'Legende Unwetterwarnungen';
    img.src = this.warningLayer.legendUrl ?? legendUrl(this.warningLayer.name);
    img.onerror = () => img.remove();
    const hint = document.createElement('p');
    hint.textContent = 'Tippe auf die Karte, um die Warnung an diesem Ort zu lesen.';
    legend.replaceChildren(hint, img);
  }

  private async queryWarnings(e: L.LeafletMouseEvent): Promise<void> {
    if (!this.warnings || !this.warningLayer) return;
    const size = this.map.getSize();
    const b = this.map.getBounds();
    const sw = L.CRS.EPSG3857.project(b.getSouthWest());
    const ne = L.CRS.EPSG3857.project(b.getNorthEast());
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetFeatureInfo',
      layers: this.warningLayer.name,
      query_layers: this.warningLayer.name,
      styles: '',
      crs: 'EPSG:3857',
      bbox: [sw.x, sw.y, ne.x, ne.y].join(','),
      width: String(size.x),
      height: String(size.y),
      i: String(Math.round(e.containerPoint.x)),
      j: String(Math.round(e.containerPoint.y)),
      info_format: 'application/json',
      feature_count: '10',
    });
    const popup = L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent('Lade Warnungen …').openOn(this.map);
    try {
      const text = await dwdFetchText(`${new URL(WMS_URL).pathname}?${params}`);
      const data = JSON.parse(text) as { features?: { properties?: Record<string, unknown> }[] };
      popup.setContent(formatWarnings(data.features ?? []));
    } catch (err) {
      popup.setContent(`Warnungen konnten nicht abgefragt werden: ${escapeHtml((err as Error).message)}`);
    }
  }

  // ---- Fehleranzeige --------------------------------------------------------------------

  private errorKind: 'frames' | 'service' | null = null;

  private showError(msg: string, kind: 'frames' | 'service' = 'service'): void {
    this.errorBox.textContent = msg;
    this.errorBox.hidden = false;
    this.errorKind = kind;
  }

  private hideError(): void {
    this.errorBox.hidden = true;
    this.errorKind = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function fmtDate(v: unknown): string {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? dateFmt.format(t) : '';
}

/** Formatiert die Warnungen aus GetFeatureInfo (DWD-Felder EVENT, HEADLINE, ONSET, EXPIRES, …). */
export function formatWarnings(features: { properties?: Record<string, unknown> }[]): string {
  const items = features
    .map((f) => f.properties ?? {})
    .filter((p) => p.EVENT || p.HEADLINE)
    .map((p) => {
      const title = escapeHtml(String(p.HEADLINE ?? p.EVENT));
      const when = [fmtDate(p.ONSET), fmtDate(p.EXPIRES)].filter(Boolean).join(' – ');
      const desc = p.DESCRIPTION ? `<p>${escapeHtml(String(p.DESCRIPTION))}</p>` : '';
      return `<li><strong>${title}</strong>${when ? `<br><small>${escapeHtml(when)}</small>` : ''}${desc}</li>`;
    });
  return items.length
    ? `<ul class="warn-list">${items.join('')}</ul><small>Quelle: Deutscher Wetterdienst</small>`
    : 'Keine amtliche Warnung an diesem Ort.';
}
