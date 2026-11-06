package de.onlyweather.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import de.onlyweather.app.MainActivity;
import de.onlyweather.app.R;

/**
 * Startbildschirm-Widget: aktuelle Temperatur und Wetterlage, Tageshöchst- und -tiefstwert und
 * für die nächsten Stunden Icon, Regenwahrscheinlichkeit und Temperaturkurve.
 *
 * Der Ort ist der, den die App zuletzt angezeigt hat (siehe WidgetPlugin). Das System aktualisiert
 * alle 30 Minuten, der Knopf oben rechts sofort.
 */
public class WeatherWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "de.onlyweather.app.widget.REFRESH";
    /** Jünger als das wird bei automatischen Aktualisierungen nicht neu abgefragt (wie in der App). */
    private static final long MAX_AGE_MS = 10 * 60 * 1000;
    /** Höhe von Kopfzeile, Trennlinie und Innenabstand in dp, für die Größe der Diagramm-Bitmap */
    private static final int HEADER_DP = 90;
    private static final int PADDING_H_DP = 24;

    /** Fordert eine Aktualisierung aller Widgets an, z. B. nachdem in der App der Ort gewechselt wurde. */
    public static void requestUpdate(Context context, boolean force) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        Intent i = new Intent(context, WeatherWidgetProvider.class)
                .setAction(force ? ACTION_REFRESH : AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(i);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class));
            if (ids != null && ids.length > 0) update(context, mgr, ids, true);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        update(context, mgr, ids, false);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, Bundle newOptions) {
        // Größe geändert: mit den gespeicherten Daten neu zeichnen, ohne neue Abfrage.
        update(context, mgr, new int[]{id}, false);
    }

    private void update(Context context, AppWidgetManager mgr, int[] ids, boolean force) {
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                refresh(app, mgr, ids, force);
            } finally {
                result.finish();
            }
        }, "OnlyWeather-Widget").start();
    }

    private static void refresh(Context context, AppWidgetManager mgr, int[] ids, boolean force) {
        WidgetStore.Place place = WidgetStore.getPlace(context);
        if (place == null) {
            for (int id : ids) mgr.updateAppWidget(id, build(context, mgr, id, null, null,
                    "OnlyWeather öffnen, um einen Ort zu wählen.", false));
            return;
        }
        long now = System.currentTimeMillis();
        WidgetStore.Cached cached = WidgetStore.getForecast(context, place);
        WidgetWeather data = parseOrNull(cached, now);
        boolean stale = data == null || force || now - cached.fetchedAt > MAX_AGE_MS || cached.fetchedAt > now;

        for (int id : ids) mgr.updateAppWidget(id, build(context, mgr, id, place, data,
                data == null ? "Lade Vorhersage …" : null, stale));
        if (!stale) return;

        String message = null;
        try {
            String json = WidgetWeather.fetch(place.lat, place.lon);
            WidgetWeather fresh = WidgetWeather.parse(json, System.currentTimeMillis());
            if (fresh != null) {
                // Ort könnte in der Zwischenzeit gewechselt sein
                WidgetStore.Place current = WidgetStore.getPlace(context);
                if (current != null && !current.key().equals(place.key())) return;
                WidgetStore.putForecast(context, place, json, System.currentTimeMillis());
                data = fresh;
            } else if (data == null) {
                message = "Vorhersage nicht verfügbar.";
            }
        } catch (Exception e) {
            if (data == null) message = "Keine Verbindung zum Datendienst.";
        }
        for (int id : ids) mgr.updateAppWidget(id, build(context, mgr, id, place, data, message, false));
    }

    private static WidgetWeather parseOrNull(WidgetStore.Cached cached, long now) {
        if (cached == null) return null;
        try {
            return WidgetWeather.parse(cached.json, now);
        } catch (Exception e) {
            return null;
        }
    }

    private static RemoteViews build(Context context, AppWidgetManager mgr, int id, WidgetStore.Place place,
                                     WidgetWeather data, String message, boolean loading) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_weather);
        float dp = context.getResources().getDisplayMetrics().density;

        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent refresh = new Intent(context, WeatherWidgetProvider.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, 0, refresh,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setInt(R.id.widget_refresh, "setImageAlpha", loading ? 110 : 255);

        v.setTextViewText(R.id.widget_place, place != null ? place.name : "");

        if (data == null) {
            v.setInt(R.id.widget_root, "setBackgroundResource", R.drawable.widget_bg_cloudy);
            v.setTextViewText(R.id.widget_temp, "–");
            v.setTextViewText(R.id.widget_condition, "");
            v.setTextViewText(R.id.widget_minmax, "");
            v.setViewVisibility(R.id.widget_icon, View.GONE);
            v.setViewVisibility(R.id.widget_chart, View.GONE);
            v.setViewVisibility(R.id.widget_message, View.VISIBLE);
            v.setTextViewText(R.id.widget_message, message != null ? message : "");
            return v;
        }

        v.setInt(R.id.widget_root, "setBackgroundResource", background(data.weatherCode, data.isDay));
        v.setTextViewText(R.id.widget_temp, WidgetWeather.degrees(data.temperature));
        v.setTextViewText(R.id.widget_condition, WidgetWeather.describe(data.weatherCode));
        v.setTextViewText(R.id.widget_minmax, data.hasDaily
                ? WidgetWeather.degrees(data.tempMax) + "/" + WidgetWeather.degrees(data.tempMin) : "");
        v.setContentDescription(R.id.widget_icon, WidgetWeather.describe(data.weatherCode));
        v.setViewVisibility(R.id.widget_icon, View.VISIBLE);
        v.setImageViewBitmap(R.id.widget_icon,
                WidgetRenderer.icon(data.weatherCode, data.isDay, Math.round(30 * dp), dp));

        int[] size = sizeDp(context, mgr, id);
        int w = Math.round((size[0] - PADDING_H_DP) * dp);
        int h = Math.round((size[1] - HEADER_DP) * dp);
        // RemoteViews-Bitmaps sind im Speicher begrenzt; notfalls kleiner zeichnen und skalieren lassen.
        float scale = 1f;
        long maxPixels = 1_200_000;
        if ((long) w * h > maxPixels) scale = (float) Math.sqrt((double) maxPixels / ((long) w * h));
        if (h >= 40 * dp) {
            Bitmap chart = WidgetRenderer.chart(data, Math.round(w * scale), Math.round(h * scale), dp * scale);
            v.setImageViewBitmap(R.id.widget_chart, chart);
            v.setViewVisibility(R.id.widget_chart, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_chart, View.GONE);
        }
        v.setViewVisibility(R.id.widget_message, View.GONE);
        return v;
    }

    /** Aktuelle Größe des Widgets in dp: Breite und Höhe je nach Ausrichtung des Geräts. */
    private static int[] sizeDp(Context context, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean portrait = context.getResources().getConfiguration().orientation
                != Configuration.ORIENTATION_LANDSCAPE;
        int minW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int maxW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        int minH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        int maxH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        int w = portrait ? minW : maxW;
        int h = portrait ? maxH : minH;
        if (w <= 0) w = 320;
        if (h <= 0) h = 190;
        return new int[]{w, h};
    }

    private static int background(int code, boolean isDay) {
        if (code >= 95) return R.drawable.widget_bg_storm;
        if (!isDay) return R.drawable.widget_bg_night;
        if (code <= 2) return R.drawable.widget_bg_clear;
        if (code == 3 || code == 45 || code == 48) return R.drawable.widget_bg_cloudy;
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return R.drawable.widget_bg_snow;
        return R.drawable.widget_bg_rain;
    }
}
