import changelog from './changelog.json';

/**
 * Ein Eintrag aus `src/changelog.json`. `id` steigt mit jedem Eintrag und ist unabhängig von der
 * Versionsnummer; die App merkt sich die höchste gesehene `id`.
 */
export interface ChangelogEntry {
  id: number;
  /** ISO-Datum, z. B. 2026-11-23 */
  date: string;
  changes: string[];
}

export interface PendingWhatsNew {
  entries: ChangelogEntry[];
  newestId: number;
}

const KEY = 'onlyweather.whatsNewSeen';
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const CHANGELOG: ChangelogEntry[] = changelog.entries;

/**
 * Was die Infokarte zeigen soll, neueste zuerst.
 * - `lastSeenId` gesetzt: alle Einträge danach.
 * - Noch nie gesehen, aber die App lief schon (Update von vor dieser Funktion): nur der neueste.
 * - Erster Start: nichts.
 */
export function entriesToShow(entries: ChangelogEntry[], lastSeenId: number | null, isUpdate: boolean): ChangelogEntry[] {
  const sorted = [...entries].sort((a, b) => b.id - a.id);
  if (lastSeenId !== null) return sorted.filter((e) => e.id > lastSeenId);
  return isUpdate ? sorted.slice(0, 1) : [];
}

/** 2026-11-23 → 23.11.2026 */
export function formatDate(iso: string): string {
  const m = DATE.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Fehler in der Datei, für den Test, der `changelog.json` prüft. Leer = in Ordnung. */
export function problems(entries: ChangelogEntry[]): string[] {
  const out: string[] = [];
  if (entries.length === 0) out.push('keine Einträge');
  const seen = new Set<number>();
  for (const e of entries) {
    if (seen.has(e.id)) out.push(`id ${e.id} doppelt`);
    seen.add(e.id);
    if (!Number.isInteger(e.id) || e.id < 1) out.push(`id ${e.id} muss eine ganze Zahl größer als 0 sein`);
    if (!DATE.test(e.date)) out.push(`id ${e.id}: Datum '${e.date}' nicht im Format JJJJ-MM-TT`);
    if (!Array.isArray(e.changes) || e.changes.length === 0 || e.changes.some((c) => !c.trim())) {
      out.push(`id ${e.id}: leere Änderung`);
    }
  }
  return out;
}

/**
 * Muss vor allem anderen beim Start laufen: Ein bisheriger Nutzer erkennt sich daran, dass die App
 * schon etwas gespeichert hat (Orte, Tab, Vorhersage-Cache). Beim ersten Start wird nur der Stand
 * gemerkt, damit das nächste Update zählt.
 */
export function pendingWhatsNew(entries: ChangelogEntry[] = CHANGELOG, storage: Storage = localStorage): PendingWhatsNew | null {
  try {
    if (entries.length === 0) return null;
    const newestId = Math.max(...entries.map((e) => e.id));
    const raw = storage.getItem(KEY);
    const lastSeen = raw === null ? null : Number.parseInt(raw, 10);
    const isUpdate = Object.keys(storage).some((k) => k.startsWith('onlyweather.') && k !== KEY);
    const show = entriesToShow(entries, Number.isNaN(lastSeen) ? null : lastSeen, isUpdate);
    if (show.length === 0) {
      if (raw === null) storage.setItem(KEY, String(newestId));
      return null;
    }
    return { entries: show, newestId };
  } catch {
    return null; // ohne Speicher keine Karte
  }
}

export function markWhatsNewSeen(id: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, String(id));
  } catch {
    // ignorieren
  }
}

/** Zeigt die Infokarte als modalen Dialog; Schließen merkt den Stand. */
export function showWhatsNew(pending: PendingWhatsNew, version: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'whats-new card';
  dialog.setAttribute('aria-labelledby', 'whats-new-title');

  const title = document.createElement('h2');
  title.id = 'whats-new-title';
  title.textContent = version ? `Neu in Version ${version}` : 'Neu in dieser Version';
  dialog.append(title);

  for (const entry of pending.entries) {
    if (pending.entries.length > 1) {
      const date = document.createElement('p');
      date.className = 'whats-new-date';
      date.textContent = formatDate(entry.date);
      dialog.append(date);
    }
    const list = document.createElement('ul');
    for (const change of entry.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      list.append(li);
    }
    dialog.append(list);
  }

  const form = document.createElement('form');
  form.method = 'dialog';
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.className = 'whats-new-ok';
  ok.textContent = 'Verstanden';
  form.append(ok);
  dialog.append(form);

  dialog.addEventListener('close', () => {
    markWhatsNewSeen(pending.newestId);
    dialog.remove();
  });
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
