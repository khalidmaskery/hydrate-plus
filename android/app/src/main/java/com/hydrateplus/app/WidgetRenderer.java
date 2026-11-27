package com.hydrateplus.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.util.Locale;

/** Draws the wave-fill background and builds the RemoteViews for both widgets. */
final class WidgetRenderer {
    static final String ACTION_ADD = "com.hydrateplus.app.ADD_WATER";

    private WidgetRenderer() {}

    static boolean isNight(Context c) {
        int mode = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    static String fmtL(int ml) {
        double l = Math.round(ml / 10.0) / 100.0;
        String s = String.valueOf(l);
        if (s.endsWith(".0")) s = s.substring(0, s.length() - 2);
        return s + " L";
    }

    private static void wave(Canvas cv, int w, int h, float level, float amp, float period, float phase, Paint paint) {
        Path p = new Path();
        p.moveTo(0, h);
        float step = Math.max(2f, w / 160f);
        for (float x = 0; x <= w + step; x += step) {
            float y = level + amp * (float) Math.sin(2 * Math.PI * x / period + phase);
            p.lineTo(x, y);
        }
        p.lineTo(w + step, h);
        p.close();
        cv.drawPath(p, paint);
    }

    /** Rounded card whose water level and wave reflect the fraction of today's goal. */
    static Bitmap card(Context c, int w, int h, float pct, float radiusDp) {
        float density = c.getResources().getDisplayMetrics().density;
        boolean dark = isNight(c);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float r = radiusDp * density;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), r, r, Path.Direction.CW);
        cv.clipPath(clip);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(dark ? 0xFF0F1C32 : 0xFFEAF4FF);
        cv.drawRect(0, 0, w, h, bg);

        float f = Math.max(0f, Math.min(1f, pct));
        if (f > 0.004f) {
            float level = h * (1f - f);
            float amp = Math.min(h * 0.06f, 5f * density) * Math.min(1f, (1f - f) * 10f);
            float period = Math.max(h * 1.2f, 70f * density);

            Paint back = new Paint(Paint.ANTI_ALIAS_FLAG);
            back.setShader(new LinearGradient(0, level, 0, h,
                    dark ? 0x662F7BFF : 0x667CCBFF, dark ? 0x661747E8 : 0x663E8DFF, Shader.TileMode.CLAMP));
            wave(cv, w, h, level - amp * 0.6f, amp, period, 1.9f, back);

            Paint front = new Paint(Paint.ANTI_ALIAS_FLAG);
            front.setShader(new LinearGradient(0, level, 0, h,
                    dark ? 0xFF2F7BFF : 0xFF7CCBFF, dark ? 0xFF1747E8 : 0xFF3E8DFF, Shader.TileMode.CLAMP));
            wave(cv, w, h, level, amp, period, 0f, front);
        }
        return bmp;
    }

    private static int[] sizePx(Context c, AppWidgetManager m, int id, int defW, int defH) {
        float density = c.getResources().getDisplayMetrics().density;
        Bundle o = m.getAppWidgetOptions(id);
        int wDp = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int hDp = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (wDp <= 0) wDp = defW;
        if (hDp <= 0) hDp = defH;
        int w = Math.round(wDp * density);
        int h = Math.round(hDp * density);
        float scale = Math.min(1f, Math.min(900f / w, 450f / h));
        return new int[]{Math.max(32, Math.round(w * scale)), Math.max(32, Math.round(h * scale))};
    }

    private static PendingIntent addIntent(Context c, Class<?> provider, int widgetId) {
        Intent i = new Intent(c, provider).setAction(ACTION_ADD);
        return PendingIntent.getBroadcast(c, widgetId, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context c) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (i == null) i = new Intent();
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static float fraction(int total, int goal) {
        return goal > 0 ? (float) total / (float) goal : 0f;
    }

    static RemoteViews wide(Context c, AppWidgetManager m, int id) {
        int total = HydrateStore.total(c), goal = HydrateStore.goal(c), add = HydrateStore.addMl(c);
        float pct = fraction(total, goal);
        int[] px = sizePx(c, m, id, 180, 70);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_wide);
        rv.setImageViewBitmap(R.id.bg, card(c, px[0], px[1], pct, 22f));
        rv.setTextViewText(R.id.value, fmtL(total));
        rv.setTextViewText(R.id.sub, String.format(Locale.US, "of %s  ·  %d%%", fmtL(goal), Math.round(pct * 100f)));
        rv.setTextViewText(R.id.add, "+" + add);
        rv.setOnClickPendingIntent(R.id.add, addIntent(c, HydrateWidgetWide.class, id));
        rv.setOnClickPendingIntent(R.id.info, openApp(c));
        return rv;
    }

    static RemoteViews small(Context c, AppWidgetManager m, int id) {
        int total = HydrateStore.total(c), goal = HydrateStore.goal(c), add = HydrateStore.addMl(c);
        float pct = fraction(total, goal);
        int[] px = sizePx(c, m, id, 72, 72);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_small);
        rv.setImageViewBitmap(R.id.bg, card(c, px[0], px[1], pct, 22f));
        rv.setTextViewText(R.id.pct, Math.round(pct * 100f) + "%");
        rv.setTextViewText(R.id.add, "+" + add + " ml");
        rv.setOnClickPendingIntent(R.id.root, addIntent(c, HydrateWidgetSmall.class, id));
        return rv;
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] wideIds = m.getAppWidgetIds(new ComponentName(c, HydrateWidgetWide.class));
        for (int id : wideIds) m.updateAppWidget(id, wide(c, m, id));
        int[] smallIds = m.getAppWidgetIds(new ComponentName(c, HydrateWidgetSmall.class));
        for (int id : smallIds) m.updateAppWidget(id, small(c, m, id));
    }
}
