import { describe, expect, it } from 'vitest';
import { expandTimeDimension, parseIsoDuration, toIso } from '../src/dwd/time';

describe('parseIsoDuration', () => {
  it('liest Minuten, Stunden und Tage', () => {
    expect(parseIsoDuration('PT5M')).toBe(300_000);
    expect(parseIsoDuration('PT1H')).toBe(3_600_000);
    expect(parseIsoDuration('P1DT30M')).toBe(88_200_000);
    expect(parseIsoDuration('quatsch')).toBeNaN();
  });
});

describe('expandTimeDimension', () => {
  it('expandiert Intervalle und begrenzt auf das Fenster', () => {
    const from = Date.parse('2026-10-26T10:07:00Z');
    const to = Date.parse('2026-10-26T10:20:00Z');
    const times = expandTimeDimension('2026-10-20T00:00:00.000Z/2026-10-26T12:00:00.000Z/PT5M', from, to);
    expect(times.map(toIso)).toEqual(['2026-10-26T10:10:00Z', '2026-10-26T10:15:00Z', '2026-10-26T10:20:00Z']);
  });

  it('liest Kommalisten und gemischte Angaben, sortiert und ohne Duplikate', () => {
    const times = expandTimeDimension(
      '2026-10-26T10:10:00Z,2026-10-26T10:00:00Z/2026-10-26T10:10:00Z/PT5M,2026-10-26T09:00:00Z',
    );
    expect(times.map(toIso)).toEqual([
      '2026-10-26T09:00:00Z',
      '2026-10-26T10:00:00Z',
      '2026-10-26T10:05:00Z',
      '2026-10-26T10:10:00Z',
    ]);
  });
});
