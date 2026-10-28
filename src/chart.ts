import type { Forecast } from './forecast';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const hourLabel = (iso: string) => iso.slice(11, 13);

/**
 * 24-h-Verlauf als zwei gestapelte Diagramme mit gemeinsamer Zeitachse:
 * oben Temperatur (Linie), unten Regenwahrscheinlichkeit (Balken, 0–100 %).
 * Keine Doppelachse – jede Größe hat ihre eigene Skala.
 */
export function renderHourlyChart(container: HTMLElement, hours: Forecast['hourly']): void {
  container.replaceChildren();
  if (hours.length < 2) return;

  // In echter Pixelbreite zeichnen, damit die Schrift auf dem Handy nicht mitschrumpft.
  const W = Math.max(280, Math.round(container.clientWidth || 640));
  const padX = 14;
  // Platz über der Linie, damit die Max-Beschriftung den Titel nicht überdeckt
  const tempTop = 34;
  const tempH = 70;
  const rainTop = tempTop + tempH + 38;
  const rainH = 40;
  const axisY = rainTop + rainH + 14;
  const H = axisY + 4;
  const step = (W - 2 * padX) / hours.length;
  const cx = (i: number) => padX + step * (i + 0.5);

  const temps = hours.map((h) => h.temperature);
  let tMin = Math.min(...temps);
  let tMax = Math.max(...temps);
  if (tMax - tMin < 4) {
    const mid = (tMax + tMin) / 2;
    tMin = mid - 2;
    tMax = mid + 2;
  }
  const ty = (t: number) => tempTop + tempH - ((t - tMin) / (tMax - tMin)) * tempH;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'hourly-chart',
    role: 'img',
    'aria-label': 'Temperatur und Regenwahrscheinlichkeit der nächsten 24 Stunden',
  });

  el('text', { x: padX, y: 12, class: 'chart-title' }, svg).textContent = 'Temperatur °C';
  el('text', { x: padX, y: rainTop - 8, class: 'chart-title' }, svg).textContent = 'Regenwahrscheinlichkeit %';

  // Grundlinie der Balken
  el('line', { x1: padX, x2: W - padX, y1: rainTop + rainH, y2: rainTop + rainH, class: 'chart-grid' }, svg);

  // Regenbalken, 4px abgerundet, 2px Abstand zueinander
  const barW = Math.max(2, step - 2);
  hours.forEach((h, i) => {
    const p = h.precipitationProbability ?? 0;
    const bh = Math.max(p > 0 ? 1 : 0, (p / 100) * rainH);
    if (bh === 0) return;
    const x = cx(i) - barW / 2;
    const y = rainTop + rainH - bh;
    const r = Math.min(4, barW / 2, bh);
    el(
      'path',
      {
        d: `M${x},${y + bh}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + bh}Z`,
        class: 'chart-rain',
      },
      svg,
    );
  });

  // Temperaturlinie
  const points = hours.map((h, i) => `${cx(i).toFixed(1)},${ty(h.temperature).toFixed(1)}`);
  el('polyline', { points: points.join(' '), class: 'chart-temp' }, svg);

  // Direkte Beschriftung nur für Min und Max
  const iMax = temps.indexOf(Math.max(...temps));
  const iMin = temps.indexOf(Math.min(...temps));
  for (const [i, dy] of [
    [iMax, -7],
    [iMin, 15],
  ] as const) {
    el('circle', { cx: cx(i), cy: ty(temps[i]), r: 4, class: 'chart-temp-dot' }, svg);
    el('text', { x: cx(i), y: ty(temps[i]) + dy, class: 'chart-label', 'text-anchor': 'middle' }, svg).textContent =
      `${Math.round(temps[i])}°`;
  }

  // Zeitachse: alle 3 Stunden (auf schmalen Bildschirmen alle 6)
  const every = W < 420 ? 6 : 3;
  hours.forEach((h, i) => {
    if (i % every !== 0) return;
    el('text', { x: cx(i), y: axisY, class: 'chart-axis', 'text-anchor': 'middle' }, svg).textContent =
      i === 0 ? 'Jetzt' : hourLabel(h.time);
  });

  // Hover-Ebene: Fadenkreuz + Tooltip
  const cross = el('line', { y1: tempTop - 4, y2: rainTop + rainH, class: 'chart-cross', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;

  const show = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(hours.length - 1, Math.floor((x - padX) / step)));
    const h = hours[i];
    cross.setAttribute('x1', String(cx(i)));
    cross.setAttribute('x2', String(cx(i)));
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<strong>${hourLabel(h.time)}:00 Uhr</strong><br>${h.temperature.toFixed(1)} °C<br>Regen ${
      h.precipitationProbability ?? '–'
    } % · ${h.precipitation.toFixed(1)} mm`;
    const left = (cx(i) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 60), box.width - 60)}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);

  container.append(svg, tip);
}
