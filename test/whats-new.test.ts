import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  entriesToShow,
  formatDate,
  markWhatsNewSeen,
  pendingWhatsNew,
  problems,
  showWhatsNew,
  type ChangelogEntry,
} from '../src/whats-new';

const entry = (id: number): ChangelogEntry => ({ id, date: `2026-11-0${id}`, changes: [`Änderung ${id}`] });
const entries = [entry(1), entry(3), entry(2)];

describe('entriesToShow', () => {
  it('zeigt beim ersten Start nichts', () => {
    expect(entriesToShow(entries, null, false)).toEqual([]);
  });
  it('zeigt beim ersten Update mit dieser Funktion nur den neuesten Eintrag', () => {
    expect(entriesToShow(entries, null, true).map((e) => e.id)).toEqual([3]);
  });
  it('zeigt alle Einträge seit dem zuletzt gesehenen, neueste zuerst', () => {
    expect(entriesToShow(entries, 1, true).map((e) => e.id)).toEqual([3, 2]);
  });
  it('zeigt nichts, wenn es keine neuen Einträge gibt', () => {
    expect(entriesToShow(entries, 3, true)).toEqual([]);
  });
});

describe('pendingWhatsNew', () => {
  beforeEach(() => localStorage.clear());

  it('merkt sich beim ersten Start den Stand, ohne etwas zu zeigen', () => {
    expect(pendingWhatsNew(entries)).toBeNull();
    expect(pendingWhatsNew([...entries, entry(4)])?.entries.map((e) => e.id)).toEqual([4]);
  });
  it('erkennt bisherige Nutzer an gespeicherten Daten', () => {
    localStorage.setItem('onlyweather.places', '[]');
    expect(pendingWhatsNew(entries)?.entries.map((e) => e.id)).toEqual([3]);
  });
  it('zeigt nach dem Schließen nichts mehr', () => {
    localStorage.setItem('onlyweather.places', '[]');
    const pending = pendingWhatsNew(entries)!;
    markWhatsNewSeen(pending.newestId);
    expect(pendingWhatsNew(entries)).toBeNull();
  });
});

describe('showWhatsNew', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('zeigt Version und Änderungen und merkt den Stand beim Schließen', () => {
    const dialog = showWhatsNew({ entries: [entry(3), entry(2)], newestId: 3 }, '1.0.7');
    expect(dialog.querySelector('h2')?.textContent).toBe('Neu in Version 1.0.7');
    expect([...dialog.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Änderung 3', 'Änderung 2']);
    expect([...dialog.querySelectorAll('.whats-new-date')].map((p) => p.textContent)).toEqual(['03.11.2026', '02.11.2026']);
    dialog.dispatchEvent(new Event('close'));
    expect(localStorage.getItem('onlyweather.whatsNewSeen')).toBe('3');
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('kommt ohne Versionsnummer aus', () => {
    const dialog = showWhatsNew({ entries: [entry(1)], newestId: 1 }, '');
    expect(dialog.querySelector('h2')?.textContent).toBe('Neu in dieser Version');
  });
});

describe('changelog.json', () => {
  it('ist gültig', () => {
    expect(problems(CHANGELOG)).toEqual([]);
  });
  it('problems findet doppelte ids, falsches Datum und leere Änderungen', () => {
    expect(problems([entry(1), { id: 1, date: '23.11.2026', changes: [] }])).toHaveLength(3);
  });
  it('formatDate', () => {
    expect(formatDate('2026-11-23')).toBe('23.11.2026');
  });
});
