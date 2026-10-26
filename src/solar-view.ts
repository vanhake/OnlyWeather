import { attachHover, barPath, COL, cx, dayMarkers, el, frame, stat } from './detail-charts';
import type { Forecast } from './forecast';
import { directionLabel, PERFORMANCE_RATIO, type SolarSettings } from './solar-settings';

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmt1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clock = (iso: string) => iso.slice(11, 16);
const hours = (seconds: number) => seconds / 3600;

function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Ertrag (kWh) bzw. Einstrahlung (kWh/m²) – je nachdem, ob eine Anlagenleistung hinterlegt ist. */
function energy(kwhM2: number, s: SolarSettings): string {
  return s.kwp ? `${fmt1(kwhM2 * s.kwp * PERFORMANCE_RATIO)} kWh` : `${fmt1(kwhM2)} kWh/m²`;
}

export function renderSolar(container: HTMLElement, f: Forecast, s: SolarSettings): void {
  const today = f.solar[0];
  const hourly = f.hourlyDetail;
  if (!today || hourly.length < 2) {
    container.innerHTML = '<p class="muted">Keine Sonnendaten verfügbar.</p>';
    return;
  }
  const n = hourly.length;
  const summary =
    stat('Sonnenaufgang', clock(today.sunrise), `Tageslänge ${duration(today.daylight)}`) +
    stat('Sonnenuntergang', clock(today.sunset), `UV-Index max. ${today.uvMax != null ? fmt1(today.uvMax) : '–'}`) +
    stat('Sonnenstunden heute', `${fmt1(hours(today.sunshine))} h`, `von ${fmt1(hours(today.daylight))} h Tageslicht`) +
    stat(
      s.kwp ? 'Ertrag heute (Schätzung)' : 'Einstrahlung heute',
      energy(today.panelKwhM2, s),
      s.kwp ? `${fmt1(s.kwp)} kWp` : 'auf Modulfläche',
    );
  const legend = `<span class="dc-key"><i class="dc-swatch-bar dc-swatch-sun"></i>Einstrahlung auf die Module W/m²</span>
    <span class="dc-key muted">${s.tilt}° geneigt, Richtung ${directionLabel(s.bearing)}</span>`;
  const { scroller, inner, strip } = frame(container, summary, legend, n);
  container.querySelector('.dc-stats')!.classList.add('dc-stats-2');

  // ---- Stundenverlauf der Modul-Einstrahlung (48 h) ----
  const W = n * COL;
  const top = 24;
  const plotH = 110;
  const H = top + plotH + 6;
  const maxGti = Math.max(400, ...hourly.map((h) => h.gti));
  const svg = el('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    class: 'dc-svg',
    role: 'img',
    'aria-label': `Einstrahlung auf die Modulebene der nächsten ${n} Stunden`,
  });
  // Nachtstunden dezent hinterlegen
  hourly.forEach((h, i) => {
    if (!h.isDay) el('rect', { x: COL * i, y: top, width: COL, height: plotH, class: 'dc-night' }, svg);
  });
  for (const v of [500, 1000]) {
    if (v > maxGti) continue;
    const gy = top + plotH - (v / maxGti) * plotH;
    el('line', { x1: 0, x2: W, y1: gy, y2: gy, class: 'dc-grid' }, svg);
    el('text', { x: 4, y: gy - 3, class: 'dc-axis' }, svg).textContent = `${v}`;
  }
  el('line', { x1: 0, x2: W, y1: top + plotH, y2: top + plotH, class: 'dc-base' }, svg);
  dayMarkers(svg, hourly, top, top + plotH);
  const barW = COL - 8;
  hourly.forEach((h, i) => {
    if (h.gti <= 0) return;
    const bh = Math.max(1, (h.gti / maxGti) * plotH);
    el('path', { d: barPath(cx(i) - barW / 2, top + plotH, barW, bh), class: 'dc-bar-sun' }, svg);
  });

  strip.innerHTML = hourly
    .map(
      (h, i) => `<div class="dc-cell${h.time.slice(11, 13) === '00' && i > 0 ? ' dc-cell-day' : ''}">
        <span class="dc-time">${i === 0 ? 'Jetzt' : h.time.slice(11, 13)}</span>
        <strong>${h.isDay || h.gti > 0 ? Math.round(h.gti) : '–'}</strong>
        <span class="dc-cloud" title="Bewölkung">☁ ${Math.round(h.cloudCover)}%</span>
      </div>`,
    )
    .join('');
  inner.append(svg, strip);
  attachHover(scroller, svg, strip, H, n);

  // ---- 7-Tage-Übersicht ----
  const table = document.createElement('table');
  table.className = 'solar-table';
  table.innerHTML = `
    <thead><tr>
      <th scope="col">Tag</th><th scope="col">Auf</th><th scope="col">Unter</th>
      <th scope="col" title="Sonnenstunden">☀ h</th>
      <th scope="col">${s.kwp ? 'kWh' : 'kWh/m²'}</th><th scope="col">UV</th>
    </tr></thead>
    <tbody>${f.solar
      .map((d, i) => {
        const day = i === 0 ? 'Heute' : weekdayFmt.format(new Date(`${d.date}T12:00:00`));
        return `<tr>
          <th scope="row">${day}</th>
          <td>${clock(d.sunrise)}</td>
          <td>${clock(d.sunset)}</td>
          <td>${fmt1(hours(d.sunshine))}</td>
          <td>${fmt1(s.kwp ? d.panelKwhM2 * s.kwp * PERFORMANCE_RATIO : d.panelKwhM2)}</td>
          <td>${d.uvMax != null ? fmt1(d.uvMax) : '–'}</td>
        </tr>`;
      })
      .join('')}</tbody>`;
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = s.kwp
    ? `Ertrag geschätzt aus Einstrahlung auf die Modulebene × ${fmt1(s.kwp)} kWp × ${PERFORMANCE_RATIO.toLocaleString('de-DE')} (Systemverluste). Verschattung, Schnee, Temperatur und Wechselrichter-Grenzen sind nicht berücksichtigt.`
    : 'Einstrahlung auf die Modulebene in kWh/m² – das entspricht etwa den Volllaststunden. Mit der Anlagenleistung (kWp) zeigt die App einen geschätzten Ertrag.';
  container.append(table, note);
}
