import type { Hour } from './forecast';
import { describeWeather } from './weathercodes';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Breite einer Stundenspalte in px – Diagramm und Werteleiste teilen sich dieses Raster. */
export const COL = 46;

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmt1 = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const hourOf = (h: Hour) => Number(h.time.slice(11, 13));
const dayName = (h: Hour) => weekdayFmt.format(new Date(`${h.time.slice(0, 10)}T12:00:00`));
const when = (h: Hour, first: Hour) =>
  `${h.time.slice(0, 10) === first.time.slice(0, 10) ? '' : `${dayName(h)} `}${h.time.slice(11, 13)} Uhr`;

export function cx(i: number): number {
  return COL * (i + 0.5);
}

/** Bar mit 4px abgerundeter Oberkante, an der Grundlinie verankert. */
export function barPath(x: number, base: number, w: number, h: number): string {
  const y = base - h;
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/** Tagestrenner (Mitternacht) mit Wochentag über dem Diagramm. */
export function dayMarkers(svg: SVGSVGElement, hours: Hour[], top: number, bottom: number): void {
  hours.forEach((h, i) => {
    if (i === 0 || hourOf(h) !== 0) return;
    const x = COL * i;
    el('line', { x1: x, x2: x, y1: top - 14, y2: bottom, class: 'dc-day-line' }, svg);
    el('text', { x: x + 4, y: top - 4, class: 'dc-day-label' }, svg).textContent = dayName(h);
  });
}

/** Hover/Tippen: Spalte im Diagramm und in der Werteleiste hervorheben. */
export function attachHover(scroller: HTMLElement, svg: SVGSVGElement, strip: HTMLElement, height: number, n: number): void {
  const band = el('rect', { x: 0, y: 0, width: COL, height, class: 'dc-hover', visibility: 'hidden' }, svg);
  svg.insertBefore(band, svg.firstChild);
  let active: Element | null = null;
  const select = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor((clientX - box.left) / COL)));
    band.setAttribute('x', String(COL * i));
    band.setAttribute('visibility', 'visible');
    active?.classList.remove('active');
    active = strip.children[i] ?? null;
    active?.classList.add('active');
  };
  const clear = () => {
    band.setAttribute('visibility', 'hidden');
    active?.classList.remove('active');
    active = null;
  };
  scroller.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && select(e.clientX));
  scroller.addEventListener('pointerdown', (e) => select(e.clientX));
  scroller.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && clear());
}

export function stat(label: string, value: string, sub = ''): string {
  return `<div class="dc-stat"><span class="dc-stat-label">${label}</span><strong>${value}</strong>${
    sub ? `<span class="dc-stat-sub">${sub}</span>` : ''
  }</div>`;
}

export function frame(container: HTMLElement, summary: string, legend: string, n: number) {
  container.innerHTML = `
    <div class="dc-stats">${summary}</div>
    ${legend ? `<div class="dc-legend">${legend}</div>` : ''}
    <div class="dc-scroll" tabindex="0" aria-label="Stundenwerte, seitlich scrollbar">
      <div class="dc-inner" style="width:${n * COL}px"></div>
    </div>`;
  const scroller = container.querySelector<HTMLElement>('.dc-scroll')!;
  const inner = container.querySelector<HTMLElement>('.dc-inner')!;
  const strip = document.createElement('div');
  strip.className = 'dc-strip';
  strip.style.gridTemplateColumns = `repeat(${n}, ${COL}px)`;
  return { scroller, inner, strip };
}

// ---- Temperatur --------------------------------------------------------------------------

export function renderTemperatureDetail(container: HTMLElement, hours: Hour[]): void {
  if (hours.length < 2) {
    container.innerHTML = '<p class="muted">Keine Stundenwerte verfügbar.</p>';
    return;
  }
  const n = hours.length;
  const first = hours[0];
  const temps = hours.map((h) => h.temperature);
  const feels = hours.map((h) => h.apparentTemperature);
  const iMax = temps.indexOf(Math.max(...temps));
  const iMin = temps.indexOf(Math.min(...temps));

  const summary =
    stat('Höchstwert', `${Math.round(temps[iMax])}°`, when(hours[iMax], first)) +
    stat('Tiefstwert', `${Math.round(temps[iMin])}°`, when(hours[iMin], first)) +
    stat('Gefühlt', `${Math.round(Math.min(...feels))}° bis ${Math.round(Math.max(...feels))}°`, `nächste ${n} h`);
  const legend = `<span class="dc-key"><i class="dc-swatch dc-swatch-temp"></i>Temperatur</span>
    <span class="dc-key"><i class="dc-swatch dc-swatch-feels"></i>Gefühlt</span>`;
  const { scroller, inner, strip } = frame(container, summary, legend, n);

  const W = n * COL;
  const top = 24;
  const plotH = 120;
  const H = top + plotH + 10;
  let lo = Math.min(...temps, ...feels);
  let hi = Math.max(...temps, ...feels);
  if (hi - lo < 6) {
    const mid = (hi + lo) / 2;
    lo = mid - 3;
    hi = mid + 3;
  }
  const y = (t: number) => top + plotH - ((t - lo) / (hi - lo)) * plotH;

  const svg = el('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    class: 'dc-svg',
    role: 'img',
    'aria-label': `Temperaturverlauf der nächsten ${n} Stunden`,
  });
  // Dezente Hilfslinie bei 0 °C, wenn Frost im Bereich liegt
  if (lo < 0 && hi > 0) {
    el('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'dc-zero' }, svg);
    el('text', { x: 4, y: y(0) - 3, class: 'dc-axis' }, svg).textContent = '0°';
  }
  dayMarkers(svg, hours, top, top + plotH);
  const line = (vals: number[]) => vals.map((v, i) => `${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  el('polyline', { points: line(feels), class: 'dc-line-feels' }, svg);
  el('polyline', { points: line(temps), class: 'dc-line-temp' }, svg);
  for (const [i, dy] of [
    [iMax, -9],
    [iMin, 18],
  ] as const) {
    el('circle', { cx: cx(i), cy: y(temps[i]), r: 4, class: 'dc-dot-temp' }, svg);
    el('text', { x: cx(i), y: y(temps[i]) + dy, class: 'dc-value', 'text-anchor': 'middle' }, svg).textContent =
      `${Math.round(temps[i])}°`;
  }

  strip.innerHTML = hours
    .map((h, i) => {
      const w = describeWeather(h.weatherCode, h.isDay);
      return `<div class="dc-cell${hourOf(h) === 0 && i > 0 ? ' dc-cell-day' : ''}">
        <span class="dc-time">${i === 0 ? 'Jetzt' : `${h.time.slice(11, 13)}`}</span>
        <span class="dc-icon" title="${w.text}" role="img" aria-label="${w.text}">${w.icon}</span>
        <strong>${Math.round(h.temperature)}°</strong>
        <span class="dc-feels">${Math.round(h.apparentTemperature)}°</span>
      </div>`;
    })
    .join('');
  inner.append(svg, strip);
  attachHover(scroller, svg, strip, H, n);
}

// ---- Regen -------------------------------------------------------------------------------

export function renderRainDetail(container: HTMLElement, hours: Hour[]): void {
  if (hours.length < 2) {
    container.innerHTML = '<p class="muted">Keine Stundenwerte verfügbar.</p>';
    return;
  }
  const n = hours.length;
  const first = hours[0];
  const probs = hours.map((h) => h.precipitationProbability ?? 0);
  const amounts = hours.map((h) => h.precipitation);
  const sum = (from: number, to: number) => amounts.slice(from, to).reduce((a, b) => a + b, 0);
  const iMaxProb = probs.indexOf(Math.max(...probs));
  const wetIdx = hours.findIndex((h) => (h.precipitationProbability ?? 0) >= 50 || h.precipitation >= 0.2);
  const dryIdx = wetIdx === 0 ? hours.findIndex((h) => (h.precipitationProbability ?? 0) < 30 && h.precipitation < 0.1) : -1;

  let outlook: string;
  let outlookSub: string;
  if (wetIdx < 0) {
    outlook = 'Trocken';
    outlookSub = `nächste ${n} h`;
  } else if (wetIdx === 0) {
    outlook = 'Nass';
    outlookSub = dryIdx > 0 ? `trocken ab ${when(hours[dryIdx], first)}` : `anhaltend`;
  } else {
    outlook = `ab ${hours[wetIdx].time.slice(11, 13)} Uhr`;
    outlookSub = `Regen erwartet${hours[wetIdx].time.slice(0, 10) === first.time.slice(0, 10) ? '' : ` (${dayName(hours[wetIdx])})`}`;
  }
  const summary =
    stat('Aussicht', outlook, outlookSub) +
    stat('Menge 24 h', `${fmt1(sum(0, 24))} mm`, n > 24 ? `danach ${fmt1(sum(24, n))} mm` : '') +
    stat('Maximum', `${probs[iMaxProb]} %`, when(hours[iMaxProb], first));
  const { scroller, inner, strip } = frame(container, summary, '', n);

  const W = n * COL;
  const probTop = 34;
  const probH = 80;
  const amtTop = probTop + probH + 36;
  const amtH = 50;
  const H = amtTop + amtH + 6;
  const maxAmt = Math.max(1, ...amounts);
  const barW = COL - 8;

  const svg = el('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    class: 'dc-svg',
    role: 'img',
    'aria-label': `Regenwahrscheinlichkeit und Regenmenge der nächsten ${n} Stunden`,
  });
  el('text', { x: 4, y: 12, class: 'dc-title' }, svg).textContent = 'Wahrscheinlichkeit %';
  el('text', { x: 4, y: amtTop - 10, class: 'dc-title' }, svg).textContent = `Menge mm/h (Skala bis ${fmt1(maxAmt)})`;
  for (const p of [50, 100]) {
    const gy = probTop + probH - (p / 100) * probH;
    el('line', { x1: 0, x2: W, y1: gy, y2: gy, class: 'dc-grid' }, svg);
  }
  el('line', { x1: 0, x2: W, y1: probTop + probH, y2: probTop + probH, class: 'dc-base' }, svg);
  el('line', { x1: 0, x2: W, y1: amtTop + amtH, y2: amtTop + amtH, class: 'dc-base' }, svg);
  dayMarkers(svg, hours, probTop, amtTop + amtH);

  hours.forEach((_, i) => {
    const x = cx(i) - barW / 2;
    const p = probs[i];
    if (p > 0) el('path', { d: barPath(x, probTop + probH, barW, Math.max(1, (p / 100) * probH)), class: 'dc-bar-prob' }, svg);
    const a = amounts[i];
    if (a > 0) el('path', { d: barPath(x, amtTop + amtH, barW, Math.max(1, (a / maxAmt) * amtH)), class: 'dc-bar-amount' }, svg);
  });

  strip.innerHTML = hours
    .map(
      (h, i) => `<div class="dc-cell${hourOf(h) === 0 && i > 0 ? ' dc-cell-day' : ''}">
        <span class="dc-time">${i === 0 ? 'Jetzt' : h.time.slice(11, 13)}</span>
        <strong>${h.precipitationProbability ?? '–'}%</strong>
        <span class="dc-amount">${h.precipitation > 0 ? fmt1(h.precipitation) : '0'}</span>
      </div>`,
    )
    .join('');
  inner.append(svg, strip);
  attachHover(scroller, svg, strip, H, n);
}
