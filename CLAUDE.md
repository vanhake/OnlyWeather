# Hinweise für Claude Code

## Changelog vor jedem Release pflegen (Pflicht)

Nach einem Update zeigt die App einmal eine Infokarte „Neu in Version …“ mit den Einträgen aus
`src/changelog.json`. Ohne neuen Eintrag sehen Nutzer nach dem Update nichts.

**Jeder Push auf `main` ist ein Release.** Deshalb gehört der Eintrag in denselben Commit bzw. Pull Request wie die Änderung, die Nutzer bemerken, nicht in einen späteren.

So sieht ein Eintrag aus. Neue Einträge kommen **oben** in `entries`:

```json
{ "id": 2, "date": "2026-12-01", "changes": ["Was sich für Nutzer ändert, in einem Satz."] }
```

- `id`: die bisher höchste `id` plus 1. Sie ist unabhängig von der Versionsnummer. Eine
  vorhandene `id` nie ändern oder wiederverwenden, sonst sehen Nutzer Einträge doppelt oder gar nicht.
- `date`: Datum des Releases im Format `JJJJ-MM-TT`.
- `changes`: kurze deutsche Sätze aus Sicht der Nutzer, ohne Fachbegriffe, PR-Nummern oder
  Commit-Titel. Reine Wartung (Refactoring, Abhängigkeiten, CI, Doku, Tests) gehört nicht hinein.
- Gibt es keine Änderung, die Nutzer bemerken, keinen Eintrag anlegen.
- Danach `npx vitest run test/whats-new.test.ts` ausführen. Der Test prüft die Datei, merkt aber nicht, wenn ein Eintrag fehlt.

Mehr dazu: README.md, Abschnitt „Neuigkeiten pflegen“.
