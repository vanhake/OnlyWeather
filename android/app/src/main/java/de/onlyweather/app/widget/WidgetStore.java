package de.onlyweather.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Gespeicherter Zustand des Widgets: der Ort, den die App zuletzt angezeigt hat, und die letzte
 * Antwort von Open-Meteo. So kann das Widget nach einem Neustart oder beim Ändern der Größe sofort
 * zeichnen, ohne erneut abzufragen.
 */
final class WidgetStore {
    private static final String PREFS = "onlyweather.widget";
    private static final String NAME = "place.name";
    private static final String LAT = "place.lat";
    private static final String LON = "place.lon";
    private static final String JSON = "forecast.json";
    private static final String FETCHED_AT = "forecast.fetchedAt";
    /** Koordinaten, zu denen die gespeicherte Vorhersage gehört */
    private static final String JSON_KEY = "forecast.key";

    static final class Place {
        final String name;
        final double lat;
        final double lon;

        Place(String name, double lat, double lon) {
            this.name = name;
            this.lat = lat;
            this.lon = lon;
        }

        /** Auf ca. 1 km gerundet, wie die Abfrage selbst. */
        String key() {
            return String.format(java.util.Locale.ROOT, "%.2f,%.2f", lat, lon);
        }
    }

    static final class Cached {
        final String json;
        final long fetchedAt;

        Cached(String json, long fetchedAt) {
            this.json = json;
            this.fetchedAt = fetchedAt;
        }
    }

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** @return true, wenn sich der Ort (Name oder Koordinaten) geändert hat */
    static boolean setPlace(Context c, String name, double lat, double lon) {
        Place old = getPlace(c);
        Place next = new Place(name, lat, lon);
        if (old != null && old.name.equals(name) && old.key().equals(next.key())) return false;
        prefs(c).edit()
                .putString(NAME, name)
                .putLong(LAT, Double.doubleToRawLongBits(lat))
                .putLong(LON, Double.doubleToRawLongBits(lon))
                .apply();
        return true;
    }

    static Place getPlace(Context c) {
        SharedPreferences p = prefs(c);
        String name = p.getString(NAME, null);
        if (name == null || !p.contains(LAT) || !p.contains(LON)) return null;
        return new Place(name,
                Double.longBitsToDouble(p.getLong(LAT, 0)),
                Double.longBitsToDouble(p.getLong(LON, 0)));
    }

    /** Gespeicherte Vorhersage für diesen Ort, sonst null. */
    static Cached getForecast(Context c, Place place) {
        SharedPreferences p = prefs(c);
        String json = p.getString(JSON, null);
        if (json == null || !place.key().equals(p.getString(JSON_KEY, null))) return null;
        return new Cached(json, p.getLong(FETCHED_AT, 0));
    }

    static void putForecast(Context c, Place place, String json, long fetchedAt) {
        prefs(c).edit()
                .putString(JSON, json)
                .putString(JSON_KEY, place.key())
                .putLong(FETCHED_AT, fetchedAt)
                .apply();
    }
}
