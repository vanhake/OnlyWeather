package de.onlyweather.app.widget;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Region;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.ArrayList;
import java.util.List;

/**
 * Zeichnet Wetter-Icons und den Stundenteil des Widgets (Uhrzeit, Icon, Regenwahrscheinlichkeit und
 * Temperaturkurve) als Bitmap. RemoteViews können keine eigenen Views enthalten, deshalb wird hier
 * direkt auf ein Canvas gezeichnet.
 */
final class WidgetRenderer {
    /** Abstand der Spalten in Stunden */
    static final int STEP_HOURS = 2;

    private static final int WHITE = Color.WHITE;
    private static final int SHADOW = 0x55000000;
    private static final int SUN = 0xFFFFD54F;
    private static final int MOON = 0xFFFFF1C4;
    private static final int BOLT = 0xFFFFC107;
    private static final int BADGE_MAX = 0xFFE8803A;
    private static final int BADGE_MIN = 0xFF3D8BD9;

    private WidgetRenderer() {}

    // ---------------------------------------------------------------------------------------------
    // Stundenteil

    /**
     * @param w  Breite in Pixeln
     * @param h  Höhe in Pixeln
     * @param dp Pixel pro dp
     */
    static Bitmap chart(WidgetWeather data, int w, int h, float dp) {
        Bitmap bmp = Bitmap.createBitmap(Math.max(1, w), Math.max(1, h), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        List<WidgetWeather.Hour> hours = pick(data.hours, w / dp);
        int n = hours.size();
        if (n == 0) return bmp;
        float colW = (float) w / n;

        float hDp = h / dp;
        boolean showIcons = hDp >= 118;
        boolean showRain = hDp >= 92;

        Paint text = textPaint(dp, 13, false);
        text.setTextAlign(Paint.Align.CENTER);
        Paint.FontMetrics fm = text.getFontMetrics();

        float y = 4 * dp - fm.ascent;
        float timeBaseline = y;
        y += fm.descent;
        float iconCenter = 0;
        float iconSize = 22 * dp;
        if (showIcons) {
            iconCenter = y + 6 * dp + iconSize / 2;
            y = iconCenter + iconSize / 2;
        }
        float rainBaseline = 0;
        if (showRain) {
            rainBaseline = y + 6 * dp - fm.ascent;
            y = rainBaseline + fm.descent;
        }

        // Bereich der Temperaturkurve; oben Platz für die Beschriftung über dem höchsten Punkt
        float plotTop = y + 30 * dp;
        float plotBottom = h - 10 * dp;
        if (plotBottom - plotTop < 12 * dp) plotTop = plotBottom - 12 * dp;

        Paint rainPaint = textPaint(dp, 12, false);
        rainPaint.setTextAlign(Paint.Align.LEFT);
        for (int i = 0; i < n; i++) {
            WidgetWeather.Hour hour = hours.get(i);
            float cx = colW * (i + 0.5f);
            c.drawText(hour.label(), cx, timeBaseline, text);
            if (showIcons) drawIcon(c, hour.weatherCode, hour.isDay, cx, iconCenter, iconSize, dp);
            if (showRain) {
                String label = hour.precipitationProbability < 0 ? "–" : hour.precipitationProbability + "%";
                float umbrella = 10 * dp;
                float gap = 3 * dp;
                float total = umbrella + gap + rainPaint.measureText(label);
                float left = cx - total / 2;
                drawUmbrella(c, left + umbrella / 2, rainBaseline - 4.5f * dp, umbrella, dp);
                c.drawText(label, left + umbrella + gap, rainBaseline, rainPaint);
            }
        }

        // Temperaturkurve
        double lo = Double.MAX_VALUE;
        double hi = -Double.MAX_VALUE;
        int iMin = 0;
        int iMax = 0;
        for (int i = 0; i < n; i++) {
            double t = hours.get(i).temperature;
            if (t < lo) { lo = t; iMin = i; }
            if (t > hi) { hi = t; iMax = i; }
        }
        // Mindestens 4 K Spanne, damit kleine Schwankungen nicht wie große aussehen
        double span = Math.max(hi - lo, 4);
        double mid = (hi + lo) / 2;
        double base = mid - span / 2;
        float[] xs = new float[n];
        float[] ys = new float[n];
        for (int i = 0; i < n; i++) {
            xs[i] = colW * (i + 0.5f);
            ys[i] = (float) (plotBottom - (hours.get(i).temperature - base) / span * (plotBottom - plotTop));
        }

        Paint dash = new Paint(Paint.ANTI_ALIAS_FLAG);
        dash.setStyle(Paint.Style.STROKE);
        dash.setStrokeWidth(1 * dp);
        dash.setColor(0x80FFFFFF);
        dash.setPathEffect(new DashPathEffect(new float[]{3 * dp, 3 * dp}, 0));
        float floor = h - 4 * dp;
        for (int i = 0; i < n; i++) c.drawLine(xs[i], ys[i], xs[i], floor, dash);
        dash.setColor(0x4DFFFFFF);
        c.drawLine(0, floor, w, floor, dash);

        Path curve = smoothPath(xs, ys);
        if (n > 1) {
            Path fill = new Path(curve);
            fill.lineTo(xs[n - 1], floor);
            fill.lineTo(xs[0], floor);
            fill.close();
            Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            fillPaint.setShader(new LinearGradient(0, plotTop, 0, floor, 0x40FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
            c.drawPath(fill, fillPaint);
        }
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(2 * dp);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor(WHITE);
        line.setShadowLayer(2 * dp, 0, 0.5f * dp, SHADOW);
        c.drawPath(curve, line);

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setColor(0x66FFFFFF);
        dot.setColor(WHITE);
        Paint label = textPaint(dp, 12, false);
        label.setTextAlign(Paint.Align.CENTER);
        boolean flat = hi - lo < 0.5;
        for (int i = 0; i < n; i++) {
            c.drawCircle(xs[i], ys[i], 5.5f * dp, ring);
            c.drawCircle(xs[i], ys[i], 3.5f * dp, dot);
            String t = WidgetWeather.degrees(hours.get(i).temperature);
            if (!flat && i == iMax) drawBadge(c, t, xs[i], ys[i] - 9 * dp, BADGE_MAX, dp, w);
            else if (!flat && i == iMin) drawBadge(c, t, xs[i], ys[i] - 9 * dp, BADGE_MIN, dp, w);
            else c.drawText(t, xs[i], ys[i] - 10 * dp, label);
        }
        return bmp;
    }

    /** Wählt Stunden im Abstand von STEP_HOURS, so viele wie in die Breite passen. */
    static List<WidgetWeather.Hour> pick(List<WidgetWeather.Hour> all, float widthDp) {
        int n = Math.max(3, Math.min(8, Math.round(widthDp / 56f)));
        List<WidgetWeather.Hour> out = new ArrayList<>();
        for (int i = 0; i < n && i * STEP_HOURS < all.size(); i++) out.add(all.get(i * STEP_HOURS));
        return out;
    }

    /** Catmull-Rom-Spline durch die Punkte, als kubische Bézierkurven. */
    private static Path smoothPath(float[] xs, float[] ys) {
        Path p = new Path();
        int n = xs.length;
        p.moveTo(xs[0], ys[0]);
        for (int i = 0; i < n - 1; i++) {
            int i0 = Math.max(0, i - 1);
            int i3 = Math.min(n - 1, i + 2);
            float c1x = xs[i] + (xs[i + 1] - xs[i0]) / 6f;
            float c1y = ys[i] + (ys[i + 1] - ys[i0]) / 6f;
            float c2x = xs[i + 1] - (xs[i3] - xs[i]) / 6f;
            float c2y = ys[i + 1] - (ys[i3] - ys[i]) / 6f;
            p.cubicTo(c1x, c1y, c2x, c2y, xs[i + 1], ys[i + 1]);
        }
        return p;
    }

    /** Farbiges Schild mit Spitze nach unten; tipY ist die Spitze. */
    private static void drawBadge(Canvas c, String s, float cx, float tipY, int color, float dp, int width) {
        Paint text = textPaint(dp, 12, true);
        text.setTextAlign(Paint.Align.CENTER);
        text.clearShadowLayer();
        Paint.FontMetrics fm = text.getFontMetrics();
        float padX = 5 * dp;
        float padY = 2.5f * dp;
        float arrow = 4 * dp;
        float bw = text.measureText(s) + 2 * padX;
        float bh = fm.descent - fm.ascent + 2 * padY;
        float left = Math.max(1 * dp, Math.min(width - 1 * dp - bw, cx - bw / 2));
        RectF r = new RectF(left, tipY - arrow - bh, left + bw, tipY - arrow);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(color);
        bg.setShadowLayer(2 * dp, 0, 0.5f * dp, SHADOW);
        Path shape = new Path();
        shape.addRoundRect(r, 4 * dp, 4 * dp, Path.Direction.CW);
        Path tip = new Path();
        tip.moveTo(cx - arrow, r.bottom - 0.5f * dp);
        tip.lineTo(cx + arrow, r.bottom - 0.5f * dp);
        tip.lineTo(cx, tipY);
        tip.close();
        shape.op(tip, Path.Op.UNION);
        c.drawPath(shape, bg);
        c.drawText(s, r.centerX(), r.top + padY - fm.ascent, text);
    }

    private static void drawUmbrella(Canvas c, float cx, float cy, float s, float dp) {
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(WHITE);
        fill.setShadowLayer(1.5f * dp, 0, 0.5f * dp, SHADOW);
        float r = s / 2;
        RectF dome = new RectF(cx - r, cy - r, cx + r, cy + r);
        c.drawArc(dome, 180, 180, true, fill);
        Paint stick = strokePaint(dp, 1.4f, WHITE);
        Path handle = new Path();
        handle.moveTo(cx, cy);
        handle.lineTo(cx, cy + r * 0.85f);
        handle.quadTo(cx, cy + r * 1.15f, cx - r * 0.3f, cy + r * 1.05f);
        c.drawPath(handle, stick);
    }

    // ---------------------------------------------------------------------------------------------
    // Wetter-Icons

    static Bitmap icon(int code, boolean isDay, int sizePx, float dp) {
        Bitmap bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        // Etwas Rand für Schatten und Strichbreite; Strichstärke wie bei den 22-dp-Icons im Stundenteil
        float s = sizePx * 0.86f;
        drawIcon(c, code, isDay, sizePx / 2f, sizePx / 2f, s, s / 22f);
        return bmp;
    }

    /**
     * Zeichnet ein Strich-Icon in ein Quadrat der Kantenlänge s um (cx, cy).
     * dp bestimmt die Strichstärke.
     */
    static void drawIcon(Canvas c, int code, boolean isDay, float cx, float cy, float s, float dp) {
        Paint stroke = strokePaint(dp, 1.6f, WHITE);
        if (code == 0) {
            if (isDay) drawSun(c, cx, cy, s * 0.42f, dp, null);
            else drawMoon(c, cx, cy, s * 0.36f, dp);
        } else if (code == 1 || code == 2) {
            float cw = code == 1 ? s * 0.62f : s * 0.8f;
            Path cloud = cloudPath(cx + s * 0.1f, cy + s * 0.12f, cw);
            if (isDay) drawSun(c, cx - s * 0.16f, cy - s * 0.12f, s * 0.3f, dp, cloud);
            else drawMoonClipped(c, cx - s * 0.14f, cy - s * 0.12f, s * 0.26f, dp, cloud);
            c.drawPath(cloud, stroke);
        } else if (code == 3) {
            c.drawPath(cloudPath(cx, cy + s * 0.04f, s * 0.92f), stroke);
        } else if (code == 45 || code == 48) {
            c.drawPath(cloudPath(cx, cy - s * 0.12f, s * 0.8f), stroke);
            float y1 = cy + s * 0.26f;
            float y2 = cy + s * 0.42f;
            c.drawLine(cx - s * 0.42f, y1, cx + s * 0.3f, y1, stroke);
            c.drawLine(cx - s * 0.3f, y2, cx + s * 0.42f, y2, stroke);
        } else {
            Path cloud = cloudPath(cx, cy - s * 0.12f, s * 0.86f);
            c.drawPath(cloud, stroke);
            float top = cy + s * 0.22f;
            float bottom = cy + s * 0.46f;
            if (code >= 95) {
                Paint bolt = new Paint(Paint.ANTI_ALIAS_FLAG);
                bolt.setColor(BOLT);
                Path p = new Path();
                p.moveTo(cx + s * 0.04f, top - s * 0.06f);
                p.lineTo(cx - s * 0.12f, cy + s * 0.34f);
                p.lineTo(cx, cy + s * 0.34f);
                p.lineTo(cx - s * 0.06f, bottom + s * 0.04f);
                p.lineTo(cx + s * 0.14f, cy + s * 0.28f);
                p.lineTo(cx + s * 0.02f, cy + s * 0.28f);
                p.close();
                c.drawPath(p, bolt);
            } else if ((code >= 71 && code <= 77) || code == 85 || code == 86) {
                Paint flake = strokePaint(dp, 1.3f, WHITE);
                float r = s * 0.07f;
                for (float fx : new float[]{-0.24f, 0f, 0.24f}) {
                    float x = cx + fx * s;
                    float y = fx == 0f ? bottom - r : top + r;
                    for (int k = 0; k < 3; k++) {
                        double a = Math.PI / 3 * k;
                        float dx = (float) Math.cos(a) * r;
                        float dy = (float) Math.sin(a) * r;
                        c.drawLine(x - dx, y - dy, x + dx, y + dy, flake);
                    }
                }
            } else if (code >= 51 && code <= 57) {
                Paint drop = new Paint(Paint.ANTI_ALIAS_FLAG);
                drop.setColor(WHITE);
                for (float fx : new float[]{-0.22f, 0f, 0.22f}) {
                    c.drawCircle(cx + fx * s, top + s * 0.06f, 1.4f * dp, drop);
                    c.drawCircle(cx + fx * s - s * 0.05f, bottom - s * 0.02f, 1.4f * dp, drop);
                }
            } else {
                boolean heavy = code == 65 || code == 67 || code == 82;
                float[] offsets = heavy ? new float[]{-0.27f, -0.09f, 0.09f, 0.27f} : new float[]{-0.2f, 0f, 0.2f};
                for (float fx : offsets) {
                    float x = cx + fx * s;
                    c.drawLine(x, top, x - s * 0.08f, bottom, stroke);
                }
            }
        }
    }

    /** Wolke mit flacher Unterseite, Breite w, ungefähr mittig um (cx, cy). */
    private static Path cloudPath(float cx, float cy, float w) {
        float bottom = cy + 0.28f * w;
        Path p = new Path();
        p.addCircle(cx - 0.25f * w, bottom - 0.2f * w, 0.2f * w, Path.Direction.CW);
        Path big = new Path();
        big.addCircle(cx + 0.05f * w, bottom - 0.3f * w, 0.3f * w, Path.Direction.CW);
        Path right = new Path();
        right.addCircle(cx + 0.3f * w, bottom - 0.18f * w, 0.18f * w, Path.Direction.CW);
        Path base = new Path();
        base.addRect(cx - 0.25f * w, bottom - 0.2f * w, cx + 0.3f * w, bottom, Path.Direction.CW);
        p.op(big, Path.Op.UNION);
        p.op(right, Path.Op.UNION);
        p.op(base, Path.Op.UNION);
        return p;
    }

    /** Sonne mit Radius r (bis zu den Strahlenspitzen); clip wird ausgespart. */
    @SuppressWarnings("deprecation")
    private static void drawSun(Canvas c, float cx, float cy, float r, float dp, Path clip) {
        Paint p = strokePaint(dp, 1.6f, SUN);
        c.save();
        if (clip != null) c.clipPath(clip, Region.Op.DIFFERENCE);
        c.drawCircle(cx, cy, r * 0.45f, p);
        for (int k = 0; k < 8; k++) {
            double a = Math.PI / 4 * k;
            float cos = (float) Math.cos(a);
            float sin = (float) Math.sin(a);
            c.drawLine(cx + cos * r * 0.68f, cy + sin * r * 0.68f, cx + cos * r, cy + sin * r, p);
        }
        c.restore();
    }

    private static Path moonPath(float cx, float cy, float r) {
        Path moon = new Path();
        moon.addCircle(cx, cy, r, Path.Direction.CW);
        Path cut = new Path();
        cut.addCircle(cx + r * 0.55f, cy - r * 0.4f, r * 0.85f, Path.Direction.CW);
        moon.op(cut, Path.Op.DIFFERENCE);
        return moon;
    }

    private static void drawMoon(Canvas c, float cx, float cy, float r, float dp) {
        c.drawPath(moonPath(cx, cy, r), strokePaint(dp, 1.6f, MOON));
    }

    @SuppressWarnings("deprecation")
    private static void drawMoonClipped(Canvas c, float cx, float cy, float r, float dp, Path clip) {
        c.save();
        c.clipPath(clip, Region.Op.DIFFERENCE);
        drawMoon(c, cx, cy, r, dp);
        c.restore();
    }

    // ---------------------------------------------------------------------------------------------

    private static Paint strokePaint(float dp, float width, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(width * dp);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setColor(color);
        p.setShadowLayer(1.5f * dp, 0, 0.5f * dp, SHADOW);
        return p;
    }

    private static Paint textPaint(float dp, float sizeDp, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        p.setColor(WHITE);
        p.setTextSize(sizeDp * dp);
        p.setTypeface(Typeface.create("sans-serif-medium", bold ? Typeface.BOLD : Typeface.NORMAL));
        p.setShadowLayer(2 * dp, 0, 0.5f * dp, SHADOW);
        return p;
    }
}
