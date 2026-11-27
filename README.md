# Hydrate+

A focused water-intake tracker for Android, built with Capacitor. Reminders reach a Samsung Galaxy Fit3 through notification mirroring.

## Features
- Animated water-drop progress toward a daily goal (default 3.5 L)
- One-tap quick-add sizes (editable), custom amounts, undo, and a daily log
- Drink types: water, ORS, soup, laban, tea/coffee, with an electrolyte tracker
- Workout and hot-day bonus on the goal
- Pace indicator, streak, 7/14/30-day history chart, fix or backfill any day
- Daily reminders on a schedule you choose, with +250 ml and +500 ml buttons on the notification
- Home-screen widgets: a 2x1 with a wave water level, today's total and a one-tap add button, and a 1x1 one-tap button. They show the same percentage as the app
- Light, dark or automatic theme, JSON backup and restore, data stays on the phone

## Home-screen widgets
Two standard Android widgets that work on Samsung One UI:
- **Hydrate+ progress (2x1):** wave level and total for today, tap the button to add water (default 250 ml, editable in Settings), tap the left side to open the app.
- **Hydrate+ button (1x1):** tap anywhere to add water; the wave shows today's percentage.

Add one from Settings in the app, or touch and hold the home screen, tap Widgets, choose Hydrate+.
Water added from a widget is queued on the phone and merged into the app log the next time the app opens, so nothing is lost. The wave updates on every tap but does not animate continuously (Android widgets cannot run animations).

Code: `HydrateStore` (shared prefs), `WidgetRenderer` (draws the wave bitmap), `BaseWidget`/`HydrateWidgetWide`/`HydrateWidgetSmall`, and `HydrateBridgePlugin` (the link to the web app).

## Galaxy Fit3
The Fit3 cannot run third-party apps. It mirrors phone notifications:
1. Open Galaxy Wearable, select the Fit3.
2. Band settings, Notifications, App notifications, switch on Hydrate+.
3. Wear the band. Optional: enable "Show alerts even when phone in use".

Logging is done on the phone. There is no sync to Samsung Health (its Health Connect support does not include hydration).

## Build (GitHub Actions)
Push to `main` or run the **Build Android APK** workflow. Add these repository secrets to publish a signed release:
`KEYSTORE_B64` (or `KEYSTORE_B64_1` and `KEYSTORE_B64_2`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
Without them the workflow builds a debug APK artifact only. `versionCode` is the run number, so each build installs over the last one.

## Local development
```
npm ci
npx cap sync android
```
`www/` is plain HTML, CSS and JS, so it can be opened through any static server for a browser preview (reminders need the Android app).

App id: `com.hydrateplus.app`
