import L from 'leaflet';
import type { RadarFrame } from './dwd/radar-frames';
import { getMapUrl, imageRequestFor } from './dwd/wms';

type FrameState = 'idle' | 'loading' | 'loaded' | 'error';

interface LoadedFrame {
  frame: RadarFrame;
  url: string;
  overlay: L.ImageOverlay | null;
  state: FrameState;
}

const OPACITY = 0.75;
const CONCURRENCY = 4;

export interface RadarProgress {
  loaded: number;
  failed: number;
  total: number;
}

/**
 * Hält für jeden Zeitschritt ein Einzelbild (WMS GetMap) als Leaflet-ImageOverlay vor.
 * Alle Bilder werden im Hintergrund vorgeladen (max. 4 gleichzeitig, um den DWD-Server zu schonen);
 * das Umschalten zwischen Frames ändert dann nur noch die Deckkraft.
 */
export class RadarAnimator {
  private items: LoadedFrame[] = [];
  private current = -1;
  private visible = -1;
  private active = 0;
  private moveTimer: number | undefined;
  private generation = 0;
  private retryTimer: number | undefined;
  private retried = -1;

  constructor(
    private map: L.Map,
    private pane: string,
    private onProgress: (p: RadarProgress) => void,
    private onFrameShown: (index: number) => void,
  ) {
    map.on('moveend zoomend resize', () => {
      window.clearTimeout(this.moveTimer);
      this.moveTimer = window.setTimeout(() => this.rebuild(), 350);
    });
  }

  get length(): number {
    return this.items.length;
  }

  frameAt(i: number): RadarFrame | undefined {
    return this.items[i]?.frame;
  }

  isLoaded(i: number): boolean {
    return this.items[i]?.state === 'loaded';
  }

  setFrames(frames: RadarFrame[], startIndex: number): void {
    this.clear();
    this.items = frames.map((frame) => ({ frame, url: '', overlay: null, state: 'idle' }));
    this.current = Math.max(0, Math.min(startIndex, frames.length - 1));
    this.rebuild();
  }

  /** Bildausschnitt geändert: alle Frames für den neuen Ausschnitt neu anfordern. */
  rebuild(): void {
    if (!this.items.length) return;
    // Unsichtbare Karte (anderer Tab aktiv) hat die Größe 0 – dann gäbe es nur ungültige Anfragen.
    // Sobald sie wieder sichtbar ist, löst Leaflets resize-Ereignis den Neuaufbau aus.
    const size = this.map.getSize();
    if (size.x === 0 || size.y === 0) return;
    this.generation++;
    window.clearTimeout(this.retryTimer);
    this.removeOverlays();
    const req = imageRequestFor(this.map);
    for (const item of this.items) {
      item.url = getMapUrl(item.frame.layer, req, item.frame.time);
      item.state = 'idle';
      item.overlay = L.imageOverlay(item.url, req.bounds, {
        pane: this.pane,
        opacity: 0,
        interactive: false,
        className: 'radar-frame',
      });
    }
    this.active = 0;
    this.visible = -1;
    this.report();
    this.pump();
  }

  show(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.current = index;
    if (this.items[index].state === 'loaded') this.display(index);
    this.pump();
  }

  clear(): void {
    this.generation++;
    window.clearTimeout(this.retryTimer);
    this.removeOverlays();
    this.items = [];
    this.current = -1;
    this.visible = -1;
    this.active = 0;
  }

  private display(index: number): void {
    if (this.visible === index) return;
    this.items[index].overlay?.setOpacity(OPACITY);
    if (this.visible >= 0) this.items[this.visible]?.overlay?.setOpacity(0);
    this.visible = index;
    this.onFrameShown(index);
  }

  private removeOverlays(): void {
    for (const item of this.items) {
      if (item.overlay) this.map.removeLayer(item.overlay);
      item.overlay = null;
    }
  }

  /** Lädt die nächsten Frames, ausgehend vom aktuell gewünschten Frame. */
  private pump(): void {
    while (this.active < CONCURRENCY) {
      const next = this.nextIdle();
      if (next < 0) return;
      this.load(next);
    }
  }

  private nextIdle(): number {
    const n = this.items.length;
    for (let d = 0; d < n; d++) {
      const i = (this.current + d) % n;
      if (this.items[i].state === 'idle') return i;
    }
    return -1;
  }

  private load(i: number): void {
    const item = this.items[i];
    const overlay = item.overlay;
    if (!overlay) return;
    const gen = this.generation;
    item.state = 'loading';
    this.active++;
    const done = (state: FrameState) => {
      if (gen !== this.generation) return;
      item.state = state;
      this.active--;
      if (state === 'loaded' && i === this.current) this.display(i);
      this.report();
      this.pump();
      if (this.active === 0 && this.nextIdle() < 0) this.scheduleRetry(gen);
    };
    overlay.once('load', () => done('loaded'));
    overlay.once('error', () => done('error'));
    overlay.addTo(this.map);
  }

  /** Fehlgeschlagene Frames (z. B. kurzzeitige Serverfehler) einmal pro Ausschnitt erneut anfordern. */
  private scheduleRetry(gen: number): void {
    const failed = this.items.filter((item) => item.state === 'error');
    if (!failed.length || this.retried === gen) return;
    this.retried = gen;
    this.retryTimer = window.setTimeout(() => {
      if (gen !== this.generation) return;
      const bounds = failed[0].overlay?.getBounds();
      for (const item of failed) {
        if (item.overlay) this.map.removeLayer(item.overlay);
        item.overlay = bounds
          ? L.imageOverlay(item.url, bounds, { pane: this.pane, opacity: 0, interactive: false, className: 'radar-frame' })
          : null;
        item.state = item.overlay ? 'idle' : 'error';
      }
      this.report();
      this.pump();
    }, 20_000);
  }

  private report(): void {
    let loaded = 0;
    let failed = 0;
    for (const item of this.items) {
      if (item.state === 'loaded') loaded++;
      else if (item.state === 'error') failed++;
    }
    this.onProgress({ loaded, failed, total: this.items.length });
  }
}
