package com.hydrateplus.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Small store shared by the home-screen widgets and the app bridge.
 *
 * The web app is the source of truth. It pushes the day's total and goal here, and the widgets
 * queue any water added from the home screen as "pending" entries until the app drains them.
 * The widget shows base total + pending, so nothing is lost if the app is closed.
 */
final class HydrateStore {
    private static final String PREFS = "hydrate_widget";
    private static final String K_DATE = "date";
    private static final String K_BASE = "base";
    private static final String K_GOAL = "goal";
    private static final String K_BASE_GOAL = "baseGoal";
    private static final String K_ADD = "addMl";
    private static final String K_PENDING = "pending";

    private HydrateStore() {}

    static String dayKey(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void setState(Context c, String date, int total, int goal, int baseGoal, int addMl) {
        sp(c).edit()
                .putString(K_DATE, date)
                .putInt(K_BASE, Math.max(0, total))
                .putInt(K_GOAL, Math.max(500, goal))
                .putInt(K_BASE_GOAL, Math.max(500, baseGoal))
                .putInt(K_ADD, Math.max(25, Math.min(2000, addMl)))
                .commit();
    }

    static int addMl(Context c) {
        return sp(c).getInt(K_ADD, 250);
    }

    private static JSONArray readPending(Context c) {
        String raw = sp(c).getString(K_PENDING, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void addPending(Context c, int ml) {
        JSONArray arr = readPending(c);
        try {
            JSONObject o = new JSONObject();
            o.put("t", System.currentTimeMillis());
            o.put("ml", ml);
            arr.put(o);
        } catch (JSONException e) {
            return;
        }
        sp(c).edit().putString(K_PENDING, arr.toString()).commit();
    }

    /** Returns every queued entry and clears the queue. */
    static synchronized JSONArray drain(Context c) {
        JSONArray arr = readPending(c);
        sp(c).edit().putString(K_PENDING, "[]").commit();
        return arr;
    }

    private static boolean isToday(Context c) {
        return dayKey(System.currentTimeMillis()).equals(sp(c).getString(K_DATE, ""));
    }

    static synchronized int total(Context c) {
        int sum = isToday(c) ? sp(c).getInt(K_BASE, 0) : 0;
        String today = dayKey(System.currentTimeMillis());
        JSONArray arr = readPending(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && today.equals(dayKey(o.optLong("t")))) {
                sum += o.optInt("ml");
            }
        }
        return sum;
    }

    static synchronized int goal(Context c) {
        SharedPreferences p = sp(c);
        return isToday(c) ? p.getInt(K_GOAL, 3500) : p.getInt(K_BASE_GOAL, 3500);
    }
}
