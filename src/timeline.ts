import type { RadarFrame } from './dwd/radar-frames';

const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const STEP_MS = 500;
const END_PAUSE_MS = 1500;

/**
 * Zeitleiste mit Play/Pause und Schieberegler. Beobachtung (durchgezogen) und
 * Prognose (gestrichelt, Label "Prognose") sind optisch getrennt.
 */
export class Timeline {
  private frames: RadarFrame[] = [];
  private boundary = 0;
  private current = 0;
  private timer: number | undefined;
  private playing = false;

  private slider: HTMLInputElement;
  private playBtn: HTMLButtonElement;
  private label: HTMLElement;
  private badge: HTMLElement;
  private past: HTMLElement;
  private future: HTMLElement;
  private ticks: HTMLElement;

  constructor(
    private root: HTMLElement,
    private onChange: (index: number) => void,
    private isLoaded: (index: number) => boolean,
  ) {
    root.innerHTML = `
      <div class="tl-row">
        <button type="button" class="tl-play" aria-label="Abspielen">▶</button>
        <div class="tl-track">
          <div class="tl-segments" aria-hidden="true">
            <span class="tl-past"></span><span class="tl-future"></span>
          </div>
          <input type="range" class="tl-slider" min="0" max="0" value="0" aria-label="Zeitpunkt des Radarbilds">
          <div class="tl-ticks" aria-hidden="true"></div>
        </div>
      </div>
      <div class="tl-info"><span class="tl-badge"></span><span class="tl-label" aria-live="polite"></span></div>`;
    this.slider = root.querySelector('.tl-slider')!;
    this.playBtn = root.querySelector('.tl-play')!;
    this.label = root.querySelector('.tl-label')!;
    this.badge = root.querySelector('.tl-badge')!;
    this.past = root.querySelector('.tl-past')!;
    this.future = root.querySelector('.tl-future')!;
    this.ticks = root.querySelector('.tl-ticks')!;

    this.slider.addEventListener('input', () => {
      this.pause();
      this.go(Number(this.slider.value));
    });
    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    root.addEventListener('keydown', (e) => {
      if (e.key === ' ' && e.target !== this.slider) {
        e.preventDefault();
        this.playing ? this.pause() : this.play();
      }
    });
  }

  get index(): number {
    return this.current;
  }

  isAtBoundary(): boolean {
    const f = this.frames[this.current];
    return !f || f.time === this.boundary;
  }

  setFrames(frames: RadarFrame[], boundary: number, start: number): void {
    this.frames = frames;
    this.boundary = boundary;
    this.root.hidden = frames.length === 0;
    if (!frames.length) {
      this.pause();
      return;
    }
    const last = frames.length - 1;
    this.slider.max = String(last);
    const nPast = frames.filter((f) => !f.forecast).length;
    // Anteil der Beobachtung an der Leiste (Grenze liegt auf dem letzten beobachteten Frame).
    const split = last > 0 ? Math.max(0, nPast - 1) / last : 1;
    this.past.style.flexBasis = `${split * 100}%`;
    this.future.style.flexBasis = `${(1 - split) * 100}%`;
    this.future.hidden = nPast === frames.length;
    this.root.style.setProperty('--tl-split', `${split * 100}%`);
    this.renderTicks();
    this.go(Math.min(start, last));
  }

  /** Vom Animator aufgerufen, sobald ein Frame tatsächlich sichtbar ist. */
  markShown(index: number): void {
    this.root.classList.toggle('tl-waiting', index !== this.current);
  }

  refreshAvailability(): void {
    this.root.classList.toggle('tl-waiting', !this.isLoaded(this.current));
  }

  play(): void {
    if (!this.frames.length) return;
    this.playing = true;
    this.playBtn.textContent = '⏸';
    this.playBtn.setAttribute('aria-label', 'Pause');
    if (this.current >= this.frames.length - 1) this.go(0);
    this.schedule(STEP_MS);
  }

  pause(): void {
    this.playing = false;
    window.clearTimeout(this.timer);
    this.playBtn.textContent = '▶';
    this.playBtn.setAttribute('aria-label', 'Abspielen');
  }

  private schedule(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    if (!this.playing) return;
    const n = this.frames.length;
    if (this.current >= n - 1) {
      this.go(0);
      this.schedule(STEP_MS);
      return;
    }
    // Nächsten bereits geladenen Frame wählen; noch fehlende werden übersprungen.
    let next = this.current + 1;
    while (next < n - 1 && !this.isLoaded(next)) next++;
    if (!this.isLoaded(next)) {
      // Am Ende nichts geladen: kurz warten statt auf ein leeres Bild zu springen.
      this.schedule(STEP_MS);
      return;
    }
    this.go(next);
    this.schedule(next >= n - 1 ? END_PAUSE_MS : STEP_MS);
  }

  private go(index: number): void {
    this.current = index;
    this.slider.value = String(index);
    const f = this.frames[index];
    if (!f) return;
    const delta = Math.round((f.time - this.boundary) / 60_000);
    this.root.classList.toggle('tl-forecast', f.forecast);
    this.badge.textContent = f.forecast ? 'Prognose' : 'Beobachtung';
    const rel = delta === 0 ? 'letztes Radarbild' : delta > 0 ? `+${delta} min` : `${delta} min`;
    this.label.textContent = `${timeFmt.format(f.time)} Uhr · ${rel}`;
    this.refreshAvailability();
    this.onChange(index);
  }

  private renderTicks(): void {
    const last = this.frames.length - 1;
    const labels: string[] = [];
    this.frames.forEach((f, i) => {
      const isBoundary = f.time === this.boundary;
      if (i === 0 || i === last || isBoundary) {
        const pos = last > 0 ? (i / last) * 100 : 0;
        const text = isBoundary ? 'Jetzt' : timeFmt.format(f.time);
        const align = i === 0 ? 'start' : i === last ? 'end' : 'mid';
        labels.push(`<span class="tl-tick tl-tick-${align}" style="left:${pos}%">${text}</span>`);
      }
    });
    this.ticks.innerHTML = labels.join('');
  }
}
