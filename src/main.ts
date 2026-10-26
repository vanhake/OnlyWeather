import './style.css';
import { renderHourlyChart } from './chart';
import { loadForecast, type Forecast } from './forecast';
import { defaultPlace, loadSavedPlace, locateBrowser, savePlace, searchPlaces, type Place } from './location';
import { WeatherMap } from './map';
import { compass, describeWeather } from './weathercodes';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });

let place: Place = loadSavedPlace() ?? defaultPlace;
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
  } catch (e) {
    if (token !== loadToken) return;
    err.textContent = `Vorhersage nicht verfügbar: ${(e as Error).message} Bitte später erneut versuchen.`;
    err.hidden = false;
    $('#current-body').innerHTML = '';
    $('#hourly').replaceChildren();
    $('#daily').innerHTML = '<li class="muted">Keine Daten.</li>';
  }
}

function setPlace(p: Place, persist = true): void {
  place = p;
  if (persist) savePlace(p);
  $('#place-name').textContent = p.name;
  $('#place-detail').textContent = p.detail ?? '';
  weatherMap?.setLocation(p.lat, p.lon);
  void showForecast();
}

function setupSearch(): void {
  const input = $<HTMLInputElement>('#search');
  const list = $<HTMLUListElement>('#search-results');
  let timer: number | undefined;
  let ctrl: AbortController | null = null;
  let results: Place[] = [];

  const close = () => {
    list.hidden = true;
    list.replaceChildren();
  };
  const choose = (p: Place) => {
    close();
    input.value = '';
    input.blur();
    setPlace(p);
  };

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
  input.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.search')) close();
  });

  $('#locate').addEventListener('click', () => void useGeolocation(true));
}

async function useGeolocation(userInitiated: boolean): Promise<void> {
  const btn = $<HTMLButtonElement>('#locate');
  btn.disabled = true;
  try {
    setPlace(await locateBrowser());
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

function init(): void {
  setupSearch();
  const saved = loadSavedPlace();
  try {
    weatherMap = new WeatherMap($('#map'), place.lat, place.lon);
    void weatherMap.start();
  } catch (e) {
    const box = $('#map-error');
    box.textContent = `Karte konnte nicht initialisiert werden: ${(e as Error).message}`;
    box.hidden = false;
  }
  setPlace(place, Boolean(saved));
  // Erster Besuch ohne gespeicherten Ort: Standort anfragen, sonst bleibt Berlin.
  if (!saved) void useGeolocation(false);
  // Vorhersage regelmäßig auffrischen (Cache sorgt für max. eine Abfrage pro 10 Minuten).
  window.setInterval(() => void showForecast(), 10 * 60 * 1000);
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => lastForecast && renderHourlyChart($('#hourly'), lastForecast.hourly), 200);
  });
}

init();
