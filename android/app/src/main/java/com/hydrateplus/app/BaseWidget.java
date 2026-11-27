package com.hydrateplus.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

/** Shared behaviour for both widgets: redraw on update and handle the add-water tap. */
abstract class BaseWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        WidgetRenderer.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        WidgetRenderer.refreshAll(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (WidgetRenderer.ACTION_ADD.equals(action)) {
            int ml = HydrateStore.addMl(context);
            int before = HydrateStore.total(context);
            HydrateStore.addPending(context, ml);
            WidgetRenderer.refreshAll(context);
            int total = HydrateStore.total(context);
            int goal = HydrateStore.goal(context);
            String msg = "+" + ml + " ml  ·  " + WidgetRenderer.fmtL(total) + " of " + WidgetRenderer.fmtL(goal);
            if (before < goal && total >= goal) msg = "Goal reached  ·  " + WidgetRenderer.fmtL(total);
            Toast.makeText(context.getApplicationContext(), msg, Toast.LENGTH_SHORT).show();
            return;
        }
        if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            WidgetRenderer.refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }
}
