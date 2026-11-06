import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Place } from './location';

interface WidgetPlugin {
  setPlace(options: { name: string; lat: number; lon: number }): Promise<void>;
}

const Widget = registerPlugin<WidgetPlugin>('Widget');

/**
 * Teilt dem Android-Widget den angezeigten Ort mit. Im Browser gibt es kein Widget, dann passiert
 * nichts.
 */
export function syncWidgetPlace(place: Place): void {
  if (!Capacitor.isPluginAvailable('Widget')) return;
  Widget.setPlace({ name: place.name, lat: place.lat, lon: place.lon }).catch(() => {
    // Widget ist optional; ein Fehler hier darf die App nicht stören.
  });
}
