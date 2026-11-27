package com.hydrateplus.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Lets the web app talk to the home-screen widgets. JS name: HydrateBridge. */
@CapacitorPlugin(name = "HydrateBridge")
public class HydrateBridgePlugin extends Plugin {

    /** Push today's numbers so the widgets show the same progress as the app. */
    @PluginMethod
    public void setState(PluginCall call) {
        Context c = getContext();
        String date = call.getString("date", "");
        Integer total = call.getInt("total", 0);
        Integer goal = call.getInt("goal", 3500);
        Integer baseGoal = call.getInt("baseGoal", 3500);
        Integer addMl = call.getInt("addMl", 250);
        HydrateStore.setState(c, date,
                total == null ? 0 : total,
                goal == null ? 3500 : goal,
                baseGoal == null ? 3500 : baseGoal,
                addMl == null ? 250 : addMl);
        WidgetRenderer.refreshAll(c);
        call.resolve();
    }

    /** Return and clear the water that was added from the widgets while the app was closed. */
    @PluginMethod
    public void drainPending(PluginCall call) {
        JSONArray pending = HydrateStore.drain(getContext());
        JSArray out = new JSArray();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject o = pending.optJSONObject(i);
            if (o == null) continue;
            try {
                JSObject e = new JSObject();
                e.put("t", o.getLong("t"));
                e.put("ml", o.getInt("ml"));
                out.put(e);
            } catch (JSONException ignored) {
                // skip a malformed entry
            }
        }
        JSObject ret = new JSObject();
        ret.put("entries", out);
        call.resolve(ret);
    }

    /** Ask the launcher to pin a widget (supported by most launchers on Android 8+). */
    @PluginMethod
    public void pinWidget(PluginCall call) {
        String kind = call.getString("kind", "wide");
        Context c = getContext();
        JSObject ret = new JSObject();
        boolean supported = false;
        boolean requested = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            if (m != null && m.isRequestPinAppWidgetSupported()) {
                supported = true;
                Class<?> cls = "small".equals(kind) ? HydrateWidgetSmall.class : HydrateWidgetWide.class;
                requested = m.requestPinAppWidget(new ComponentName(c, cls), null, null);
            }
        }
        ret.put("supported", supported);
        ret.put("requested", requested);
        call.resolve(ret);
    }
}
