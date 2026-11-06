package de.onlyweather.app.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Abfrage und Auswertung der Open-Meteo-Vorhersage für das Widget. */
final class WidgetWeather {
    private static final String FORECAST = "https://api.open-meteo.com/v1/forecast";
    private static final String USER_AGENT = "OnlyWeather/0.1 (+https://github.com/vanhake/OnlyWeather)";

    static final class Hour {
        /** Ortszeit, z. B. "2026-11-06T13:00" */
        final String time;
        final double temperature;
        /** Regenwahrscheinlichkeit in %, -1 wenn unbekannt */
        final int precipitationProbability;
        final int weatherCode;
        final boolean isDay;

        Hour(String time, double temperature, int precipitationProbability, int weatherCode, boolean isDay) {
            this.time = time;
            this.temperature = temperature;
            this.precipitationProbability = precipitationProbability;
            this.weatherCode = weatherCode;
            this.isDay = isDay;
        }

        String label() {
            return time.length() >= 16 ? time.substring(11, 16) : time;
        }
    }

    final double temperature;
    final int weatherCode;
    final boolean isDay;
    final double tempMax;
    final double tempMin;
    final boolean hasDaily;
    /** Ab der aktuellen Stunde */
    final List<Hour> hours;

    private WidgetWeather(double temperature, int weatherCode, boolean isDay, double tempMax, double tempMin,
                          boolean hasDaily, List<Hour> hours) {
        this.temperature = temperature;
        this.weatherCode = weatherCode;
        this.isDay = isDay;
        this.tempMax = tempMax;
        this.tempMin = tempMin;
        this.hasDaily = hasDaily;
        this.hours = hours;
    }

    static String url(double lat, double lon) {
        // Zwei Nachkommastellen (~1 km) genügen und verraten nicht den genauen Standort.
        return FORECAST
                + "?latitude=" + String.format(Locale.ROOT, "%.2f", lat)
                + "&longitude=" + String.format(Locale.ROOT, "%.2f", lon)
                + "&models=best_match&timezone=auto&forecast_days=3"
                + "&current=temperature_2m,weather_code,is_day"
                + "&hourly=temperature_2m,precipitation_probability,weather_code,is_day"
                + "&daily=temperature_2m_max,temperature_2m_min";
    }

    static String fetch(double lat, double lon) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url(lat, lon)).openConnection();
        con.setConnectTimeout(10_000);
        con.setReadTimeout(10_000);
        con.setRequestProperty("User-Agent", USER_AGENT);
        con.setRequestProperty("Accept", "application/json");
        try {
            int status = con.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + status);
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            con.disconnect();
        }
    }

    /**
     * Wertet die Antwort aus. Die aktuelle Stunde wird aus der Uhrzeit des Geräts in der Zeitzone
     * des Orts bestimmt, damit eine ältere gespeicherte Antwort trotzdem ab „jetzt“ angezeigt wird.
     *
     * @return null, wenn die Antwort die aktuelle Stunde nicht mehr enthält
     */
    static WidgetWeather parse(String json, long nowMillis) throws JSONException {
        JSONObject root = new JSONObject(json);
        int offset = root.optInt("utc_offset_seconds", 0);
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH", Locale.ROOT);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        String nowHour = fmt.format(new Date(nowMillis + offset * 1000L));
        String today = nowHour.substring(0, 10);

        JSONObject h = root.getJSONObject("hourly");
        JSONArray time = h.getJSONArray("time");
        JSONArray temp = h.getJSONArray("temperature_2m");
        JSONArray prob = h.getJSONArray("precipitation_probability");
        JSONArray code = h.getJSONArray("weather_code");
        JSONArray day = h.getJSONArray("is_day");

        int start = -1;
        for (int i = 0; i < time.length(); i++) {
            if (time.getString(i).startsWith(nowHour)) {
                start = i;
                break;
            }
        }
        if (start < 0) {
            // Uhr des Geräts liegt vor dem ersten Wert: ab Anfang zeigen, sonst ist die Antwort veraltet.
            if (time.length() > 0 && nowHour.compareTo(time.getString(0)) < 0) start = 0;
            else return null;
        }

        List<Hour> hours = new ArrayList<>();
        for (int i = start; i < time.length(); i++) {
            if (temp.isNull(i) || code.isNull(i)) break;
            hours.add(new Hour(
                    time.getString(i),
                    temp.getDouble(i),
                    prob.isNull(i) ? -1 : (int) Math.round(prob.getDouble(i)),
                    code.getInt(i),
                    day.optInt(i, 1) == 1));
        }
        if (hours.isEmpty()) return null;

        Hour first = hours.get(0);
        double t = first.temperature;
        int c = first.weatherCode;
        boolean d = first.isDay;
        JSONObject cur = root.optJSONObject("current");
        if (cur != null && cur.optString("time", "").startsWith(nowHour)) {
            t = cur.optDouble("temperature_2m", t);
            c = cur.optInt("weather_code", c);
            d = cur.optInt("is_day", d ? 1 : 0) == 1;
        }

        double max = 0;
        double min = 0;
        boolean hasDaily = false;
        JSONObject daily = root.optJSONObject("daily");
        if (daily != null) {
            JSONArray dt = daily.optJSONArray("time");
            JSONArray mx = daily.optJSONArray("temperature_2m_max");
            JSONArray mn = daily.optJSONArray("temperature_2m_min");
            if (dt != null && mx != null && mn != null) {
                for (int i = 0; i < dt.length(); i++) {
                    if (today.equals(dt.optString(i)) && !mx.isNull(i) && !mn.isNull(i)) {
                        max = mx.getDouble(i);
                        min = mn.getDouble(i);
                        hasDaily = true;
                        break;
                    }
                }
            }
        }
        return new WidgetWeather(t, c, d, max, min, hasDaily, hours);
    }

    /** Text zum WMO-Wetterschlüssel, wie in src/weathercodes.ts. */
    static String describe(int code) {
        switch (code) {
            case 0: return "Klar";
            case 1: return "Überwiegend klar";
            case 2: return "Teilweise bewölkt";
            case 3: return "Bedeckt";
            case 45: return "Nebel";
            case 48: return "Gefrierender Nebel";
            case 51: return "Leichter Nieselregen";
            case 53: return "Nieselregen";
            case 55: return "Starker Nieselregen";
            case 56: return "Gefrierender Nieselregen";
            case 57: return "Starker gefrierender Nieselregen";
            case 61: return "Leichter Regen";
            case 63: return "Regen";
            case 65: return "Starker Regen";
            case 66: return "Gefrierender Regen";
            case 67: return "Starker gefrierender Regen";
            case 71: return "Leichter Schneefall";
            case 73: return "Schneefall";
            case 75: return "Starker Schneefall";
            case 77: return "Schneegriesel";
            case 80: return "Leichte Regenschauer";
            case 81: return "Regenschauer";
            case 82: return "Heftige Regenschauer";
            case 85: return "Schneeschauer";
            case 86: return "Starke Schneeschauer";
            case 95: return "Gewitter";
            case 96: return "Gewitter mit Hagel";
            case 99: return "Schweres Gewitter mit Hagel";
            default: return "Unbekannt";
        }
    }

    static String degrees(double t) {
        return Math.round(t) + "°";
    }
}
