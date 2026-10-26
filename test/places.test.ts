import { beforeEach, describe, expect, it } from 'vitest';
import { PlaceList } from '../src/places';

const berlin = { name: 'Berlin', lat: 52.52, lon: 13.405 };
const koeln = { name: 'Köln', lat: 50.94, lon: 6.96 };

describe('PlaceList', () => {
  beforeEach(() => localStorage.clear());

  it('fügt Orte hinzu, vermeidet Duplikate und speichert', () => {
    const list = new PlaceList();
    list.add(berlin);
    list.add(koeln);
    list.add({ ...berlin, name: 'Berlin Mitte', lat: 52.521 });
    expect(list.places.map((p) => p.name)).toEqual(['Berlin', 'Köln']);
    expect(list.current?.name).toBe('Berlin');
    const reloaded = new PlaceList();
    expect(reloaded.places).toHaveLength(2);
    expect(reloaded.index).toBe(0);
  });

  it('wechselt zyklisch und entfernt den aktuellen Ort', () => {
    const list = new PlaceList();
    list.add(berlin);
    list.add(koeln);
    list.select(list.index + 1);
    expect(list.current?.name).toBe('Berlin');
    list.select(list.index - 1);
    expect(list.current?.name).toBe('Köln');
    list.removeCurrent();
    expect(list.places.map((p) => p.name)).toEqual(['Berlin']);
    expect(list.current?.name).toBe('Berlin');
  });

  it('hält den GPS-Standort an erster Stelle und aktualisiert ihn', () => {
    const list = new PlaceList();
    list.add(koeln);
    list.setGps({ name: 'Mein Standort', lat: 48.1, lon: 11.6 });
    list.setGps({ name: 'Mein Standort', lat: 48.2, lon: 11.5 });
    expect(list.places).toHaveLength(2);
    expect(list.places[0]).toMatchObject({ gps: true, lat: 48.2 });
    expect(list.index).toBe(0);
  });

  it('übernimmt den einzelnen Ort aus älteren Versionen', () => {
    localStorage.setItem('onlyweather.place', JSON.stringify(koeln));
    const list = new PlaceList();
    expect(list.places).toEqual([koeln]);
  });
});
