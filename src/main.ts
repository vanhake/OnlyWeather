import './style.css';
import { renderHourlyChart } from './chart';
import { renderRainDetail, renderTemperatureDetail } from './detail-charts';
import { loadForecast, type Forecast } from './forecast';
import { defaultPlace, locateBrowser, searchPlaces, type Place } from './location';
import { WeatherMap } from './map';
import { PlaceList } from './places';
import { compass, describeWeather } from './weathercodes';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });

const places = new PlaceList();
let place: Place = places.current ?? defaultPlace;
let weatherMap: WeatherMap | null = null;
let loadToken = 0;
let lastForecast: Forecast | null = null;

const round = (n: number) => Math.round(n);
const fmt1 = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

function renderCurrent(f: Forecast): void {
  const c = f.current;
  const w = describeWeather(c.weatherCode, c.isDay);
  $('#current-body').innerHTML = `
    <div class="now">
      <span class="now-icon" role="img" aria-label="${w.text}">${w.icon}</span>
      <div>
        <div class="now-temp">${round(c.temperature)}°</div>
        <div class="now-text">${w.text}</div>
      </div>
    </div>
    <dl class="facts">
      <div><dt>Gefühlt</dt><dd>${round(c.apparentTemperature)}°</dd></div>
      <div><dt>Wind</dt><dd>${round(c.windSpeed)} km/h ${compass(c.windDirection)}</dd></div>
      <div><dt>Böen</dt><dd>${round(c.windGusts)} km/h</dd></div>
      <div><dt>Niederschlag</dt><dd>${fmt1(c.precipitation)} mm</dd></div>
    </dl>
    <p class="muted small">Stand ${c.time.slice(11, 16)} Uhr Ortszeit · Modell: Open-Meteo best_match (DWD ICON für Deutschland)</p>`;
  renderHourlyChart($('#hourly'), f.hourly);
}

function renderDaily(f: Forecast): void {
  const today = f.daily[0]?.date;
  $('#daily').innerHTML = f.daily
    .map((d) => {
      const date = new Date(`${d.date}T12:00:00`);
      const w = describeWeather(d.weatherCode);
      const prob = d.precipitationProbability ?? null;
      return `<li class="day">
        <span class="day-name"><strong>${d.date === today ? 'Heute' : weekdayFmt.format(date)}</strong>
          <small class="muted">${dayFmt.format(date)}</small></span>
        <span class="day-icon" role="img" aria-label="${w.text}" title="${w.text}">${w.icon}</span>
        <span class="day-temp"><span class="tmin">${round(d.tempMin)}°</span><span class="tmax">${round(d.tempMax)}°</span></span>
        <span class="day-rain">💧 ${fmt1(d.precipitationSum)} mm${prob !== null ? ` · ${prob} %` : ''}</span>
        <span class="day-wind">💨 ${round(d.windSpeedMax)} km/h ${compass(d.windDirection)}</span>
      </li>`;
    })
    .join('');
}

async function showForecast(): Promise<void> {
  const token = ++loadToken;
  const err = $('#forecast-error');
  err.hidden = true;
  try {
    const f = await loadForecast(place.lat, place.lon);
    if (token !== loadToken) return;
    lastForecast = f;
    renderCurrent(f);
    renderDaily(f);
    renderTemperatureDetail($('#panel-temp'), f.hourlyDetail);
    renderRainDetail($('#panel-rain'), f.hourlyDetail);
  } catch (e) {
    if (token !== loadToken) return;
    err.textContent = `Vorhersage nicht verfügbar: ${(e as Error).message} Bitte später erneut versuchen.`;
    err.hidden = false;
    $('#current-body').innerHTML = '';
    $('#hourly').replaceChildren();
    $('#daily').innerHTML = '<li class="muted">Keine Daten.</li>';
    for (const id of ['#panel-temp', '#panel-rain']) {
      $(id).innerHTML = '<p class="error">Stundenvorhersage nicht verfügbar.</p>';
    }
  }
}

/** Zeigt den aktuell gewählten Ort an; ohne gespeicherte Orte den Standardort. */
function showPlace(direction = 0): void {
  place = places.current ?? defaultPlace;
  $('#place-name').textContent = place.name;
  $('#place-detail').textContent = place.detail ?? '';
  $('#remove-place').hidden = places.length === 0;
  renderDots();
  weatherMap?.setLocation(place.lat, place.lon);
  if (direction) slideIn(direction);
  void showForecast();
}

function renderDots(): void {
  const box = $('#place-dots');
  box.hidden = places.length < 2;
  box.replaceChildren(
    ...places.places.map((p, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', String(i === places.index));
      dot.setAttribute('aria-label', p.gps ? `${p.name} (GPS)` : p.name);
      dot.title = p.name;
      if (p.gps) dot.classList.add('dot-gps');
      dot.addEventListener('click', () => switchTo(i));
      return dot;
    }),
  );
}

function switchTo(index: number, direction = Math.sign(index - places.index)): void {
  if (places.length < 2) return;
  places.select(index);
  showPlace(direction || 1);
}

function slideIn(direction: number): void {
  for (const el of document.querySelectorAll<HTMLElement>('#current, #daily')) {
    el.classList.remove('slide-left', 'slide-right');
    void el.offsetWidth; // Animation neu starten
    el.classList.add(direction > 0 ? 'slide-left' : 'slide-right');
  }
}

/** Wischen nach links/rechts wechselt den Ort – außer auf Karte, Zeitleiste und scrollbaren Diagrammen. */
function setupSwipe(): void {
  const area = document.querySelector('main')!;
  const ignore = '.map-wrap, .timeline, .dc-scroll, .tabs, input, .hourly';
  let start: { x: number; y: number; t: number } | null = null;
  area.addEventListener(
    'touchstart',
    (e) => {
      start =
        e.touches.length === 1 && !(e.target as Element).closest(ignore)
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
          : null;
    },
    { passive: true },
  );
  area.addEventListener(
    'touchend',
    (e) => {
      if (!start || places.length < 2) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const fast = Date.now() - start.t < 600;
      start = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy) && fast) {
        // Nach links wischen = nächster Ort
        switchTo(places.index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      }
    },
    { passive: true },
  );
  $('#place-dots').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') switchTo(places.index + 1, 1);
    if (e.key === 'ArrowLeft') switchTo(places.index - 1, -1);
  });
  $('#remove-place').addEventListener('click', () => {
    if (!confirm(`„${place.name}“ aus der Liste entfernen?`)) return;
    places.removeCurrent();
    showPlace();
  });
}

function setupSearch(): void {
  const input = $<HTMLInputElement>('#search');
  const list = $<HTMLUListElement>('#search-results');
  let timer: number | undefined;
  let ctrl: AbortController | null = null;
  let results: Place[] = [];

  const panel = $<HTMLFormElement>('#search-panel');
  const addBtn = $<HTMLButtonElement>('#add-place');
  const close = () => {
    list.hidden = true;
    list.replaceChildren();
  };
  const closePanel = () => {
    close();
    input.value = '';
    panel.hidden = true;
    addBtn.setAttribute('aria-expanded', 'false');
  };
  const openPanel = () => {
    panel.hidden = false;
    addBtn.setAttribute('aria-expanded', 'true');
    input.focus();
  };
  const choose = (p: Place) => {
    closePanel();
    input.blur();
    places.add(p);
    showPlace(1);
  };
  addBtn.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  $('#search-close').addEventListener('click', closePanel);

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = window.setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        results = await searchPlaces(q, ctrl.signal);
        list.replaceChildren(
          ...(results.length
            ? results.map((p) => {
                const li = document.createElement('li');
                li.setAttribute('role', 'option');
                li.tabIndex = 0;
                li.innerHTML = `<strong></strong> <small class="muted"></small>`;
                li.querySelector('strong')!.textContent = p.name;
                li.querySelector('small')!.textContent = p.detail ?? '';
                li.addEventListener('click', () => choose(p));
                li.addEventListener('keydown', (e) => e.key === 'Enter' && choose(p));
                return li;
              })
            : [Object.assign(document.createElement('li'), { className: 'muted', textContent: 'Kein Ort gefunden.' })]),
        );
        list.hidden = false;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        list.replaceChildren(
          Object.assign(document.createElement('li'), {
            className: 'error',
            textContent: `Ortssuche nicht verfügbar: ${(e as Error).message}`,
          }),
        );
        list.hidden = false;
      }
    }, 300);
  });
  input.closest('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (results[0]) choose(results[0]);
  });
  input.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel());
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.topbar')) closePanel();
  });

  $('#locate').addEventListener('click', () => void useGeolocation(true));
}

async function useGeolocation(userInitiated: boolean): Promise<void> {
  const btn = $<HTMLButtonElement>('#locate');
  btn.disabled = true;
  try {
    places.setGps(await locateBrowser());
    showPlace();
  } catch (e) {
    if (userInitiated) {
      const err = $('#forecast-error');
      err.textContent = (e as Error).message;
      err.hidden = false;
    }
  } finally {
    btn.disabled = false;
  }
}

const TAB_KEY = 'onlyweather.tab';

function setupTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]'));
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
    if (focus) tab.focus();
    if (tab.id === 'tab-radar') weatherMap?.invalidateSize();
    try {
      localStorage.setItem(TAB_KEY, tab.id);
    } catch {
      // ohne Speicher startet die App immer mit dem Radar
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch {
    // ignorieren
  }
  const initial = tabs.find((t) => t.id === saved);
  if (initial) select(initial);
}

function setupLegend(): void {
  const KEY = 'onlyweather.legendOpen';
  const box = $<HTMLDetailsElement>('#legend-box');
  try {
    box.open = localStorage.getItem(KEY) === '1';
  } catch {
    // ignorieren
  }
  box.addEventListener('toggle', () => {
    try {
      localStorage.setItem(KEY, box.open ? '1' : '0');
    } catch {
      // ignorieren
    }
  });
}

function init(): void {
  setupSearch();
  setupLegend();
  setupSwipe();
  const firstVisit = places.length === 0;
  try {
    weatherMap = new WeatherMap($('#map'), place.lat, place.lon);
    void weatherMap.start();
  } catch (e) {
    const box = $('#map-error');
    box.textContent = `Karte konnte nicht initialisiert werden: ${(e as Error).message}`;
    box.hidden = false;
  }
  setupTabs();
  showPlace();
  // Erster Besuch ohne gespeicherten Ort: Standort anfragen, sonst bleibt Berlin (ungespeichert).
  if (firstVisit) void useGeolocation(false);
  // Vorhersage regelmäßig auffrischen (Cache sorgt für max. eine Abfrage pro 10 Minuten).
  window.setInterval(() => void showForecast(), 10 * 60 * 1000);
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => lastForecast && renderHourlyChart($('#hourly'), lastForecast.hourly), 200);
  });
}

init();
