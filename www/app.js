/* Hydrate+ : water tracker with reminders for the Galaxy Fit3 (via notification mirroring).
   Vanilla JS, no build step. State lives in localStorage under "hydrateplus.v1". */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ config */
  const KEY = 'hydrateplus.v1';
  const VERSION = '1.0';
  const TYPES = {
    water: { n: 'Water', i: '💧', e: false },
    ors: { n: 'ORS', i: '⚡', e: true },
    soup: { n: 'Soup', i: '🥣', e: true },
    laban: { n: 'Laban', i: '🥛', e: true },
    tea: { n: 'Tea / coffee', i: '🍵', e: false }
  };
  const DROP = 'M0,-46 C0,-46 -30,-8 -30,16 C-30,34 -17,46 0,46 C17,46 30,34 30,16 C30,-8 0,-46 0,-46 Z';
  const PLUS = 'M0,-9 V9 M-9,0 H9';
  const NOTE_BODIES = [
    'Time for a glass of water.',
    'Sip up: about 250 ml keeps you on pace.',
    'Water break. Take a few good sips.',
    'Top up your bottle and drink some.',
    'Small sips add up. Drink some water now.',
    'Add an electrolyte drink, soup or laban if you have not yet.',
    'Keep going, your next glass is due.',
    'Hydration check: how much have you had?'
  ];
  const ID_BASE = 1000, ID_MAX = 1999, ID_TEST = 999;

  /* ------------------------------------------------------------------- state */
  const DEFAULTS = () => ({
    v: 1,
    goal: 3500,
    bonus: 500,
    presets: [150, 250, 330, 500],
    elec: 750,
    widgetMl: 250,
    theme: 'auto',
    type: 'water',
    days: {},
    rem: { on: false, start: '07:30', end: '21:30', every: 90, actions: true }
  });

  function sanitize(o) {
    const d = DEFAULTS();
    if (!o || typeof o !== 'object') return d;
    if (Number.isFinite(o.goal) && o.goal >= 500 && o.goal <= 8000) d.goal = Math.round(o.goal);
    if ([0, 250, 500, 750, 1000].includes(o.bonus)) d.bonus = o.bonus;
    if (Array.isArray(o.presets) && o.presets.length === 4 && o.presets.every(n => Number.isFinite(n) && n >= 25 && n <= 2000)) d.presets = o.presets.map(Math.round);
    if (Number.isFinite(o.elec) && o.elec >= 0 && o.elec <= 4000) d.elec = Math.round(o.elec);
    if (Number.isFinite(o.widgetMl) && o.widgetMl >= 25 && o.widgetMl <= 2000) d.widgetMl = Math.round(o.widgetMl);
    if (['auto', 'light', 'dark'].includes(o.theme)) d.theme = o.theme;
    if (TYPES[o.type]) d.type = o.type;
    if (o.days && typeof o.days === 'object') {
      Object.keys(o.days).forEach(k => {
        const x = o.days[k];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !x || !Array.isArray(x.e)) return;
        d.days[k] = {
          e: x.e.filter(en => en && Number.isFinite(en.ml) && en.ml > 0 && Number.isFinite(en.t))
            .map(en => ({ id: String(en.id || (en.t + '' + en.ml)), t: en.t, ml: Math.round(en.ml), ty: TYPES[en.ty] ? en.ty : 'water' })),
          w: !!x.w, h: !!x.h, g: Number.isFinite(x.g) ? x.g : d.goal
        };
      });
    }
    if (o.rem && typeof o.rem === 'object') {
      const r = o.rem;
      d.rem.on = !!r.on;
      if (/^\d{2}:\d{2}$/.test(r.start)) d.rem.start = r.start;
      if (/^\d{2}:\d{2}$/.test(r.end)) d.rem.end = r.end;
      if ([45, 60, 90, 120, 150, 180].includes(r.every)) d.rem.every = r.every;
      d.rem.actions = r.actions !== false;
    }
    return d;
  }

  let S;
  function load() {
    try { const r = localStorage.getItem(KEY); if (r) return sanitize(JSON.parse(r)); } catch (e) { /* ignore */ }
    return DEFAULTS();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } queueWidget(); }
  S = load();

  const ui = { tab: 'today', range: 7, sheet: null, perm: 'unknown', exact: 'unknown', armed: null };
  let lastPct = 0;

  /* ----------------------------------------------------------------- helpers */
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const dkey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dkey();
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const fromMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const fmtMin = m => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtTs = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtMl = n => Math.round(n).toLocaleString('en-US');
  const fmtL = ml => String(Math.round(ml / 10) / 100);
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const nativeLN = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => { try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } };
  const HINT_KEY = 'hydrateplus.installhint';
  function hintDismissed() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; } }
  function dismissHint() { try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ } }
  const isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' ? window.Capacitor.isNativePlatform() : nativeLN());

  /* -------------------------------------------------------------- day model */
  function day(k, create) {
    let d = S.days[k];
    if (!d && create) d = S.days[k] = { e: [], w: false, h: false, g: S.goal };
    return d;
  }
  const dayTotal = d => (d ? d.e.reduce((a, x) => a + x.ml, 0) : 0);
  const dayElec = d => (d ? d.e.reduce((a, x) => a + (TYPES[x.ty] && TYPES[x.ty].e ? x.ml : 0), 0) : 0);
  function dayGoal(k) {
    const d = S.days[k];
    const base = (k === today() || !d || !d.g) ? S.goal : d.g;
    return base + (d && d.w ? S.bonus : 0) + (d && d.h ? S.bonus : 0);
  }
  const met = k => { const d = S.days[k]; return !!d && dayTotal(d) >= dayGoal(k); };
  function streak() {
    let k = today(), n = 0;
    if (!met(k)) k = addDays(k, -1);
    while (met(k)) { n++; k = addDays(k, -1); }
    return n;
  }
  function addEntry(ml, ty, o) {
    o = o || {};
    ml = Math.round(ml);
    if (!(ml > 0 && ml <= 3000)) return null;
    const k = o.k || today();
    const d = day(k, true);
    const before = dayTotal(d);
    const en = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: o.t || Date.now(), ml, ty: TYPES[ty] ? ty : 'water' };
    d.e.push(en);
    d.e.sort((a, b) => a.t - b.t);
    save();
    return { en, k, crossed: k === today() && before < dayGoal(k) && dayTotal(d) >= dayGoal(k) };
  }
  function removeEntry(k, id) {
    const d = S.days[k];
    if (!d) return null;
    const i = d.e.findIndex(x => x.id === id);
    if (i < 0) return null;
    const en = d.e.splice(i, 1)[0];
    save();
    return en;
  }
  function restoreEntry(k, en) {
    const d = day(k, true);
    d.e.push(en);
    d.e.sort((a, b) => a.t - b.t);
    save();
  }

  /* ------------------------------------------------------------------ pace */
  function pace() {
    const k = today(), total = dayTotal(S.days[k]), goal = dayGoal(k);
    if (total >= goal) return { cls: '', txt: 'Goal reached. Well done' };
    const s = toMin(S.rem.start), e = toMin(S.rem.end), m = nowMin();
    if (e <= s) return { cls: 'info', txt: fmtMl(goal - total) + ' ml to go' };
    if (m < s) return { cls: 'info', txt: 'Day starts at ' + fmtMin(s) };
    if (m >= e) return { cls: 'warn', txt: fmtMl(goal - total) + ' ml short of today\'s goal' };
    const exp = goal * Math.min(1, (m - s) / (e - s));
    const gap = exp - total;
    if (gap <= goal * 0.06) return { cls: '', txt: 'On track' };
    return { cls: 'warn', txt: 'Behind by about ' + fmtMl(Math.round(gap / 50) * 50) + ' ml' };
  }

  function tip() {
    const k = today(), d = S.days[k], total = dayTotal(d), goal = dayGoal(k);
    const recent = d ? d.e.filter(x => Date.now() - x.t < 45 * 60000).reduce((a, x) => a + x.ml, 0) : 0;
    if (recent >= 750) return { c: 'warn', i: '🫗', t: 'Spread it out', p: 'Large amounts at once can feel heavy or bubbly. Take smaller sips through the next hour.' };
    const m = nowMin(), e = toMin(S.rem.end);
    if (total < goal && e - m <= 90 && e - m > -120 && goal - total > 750) return { c: 'warn', i: '🌙', t: 'Late in the day', p: 'You still have a way to go. Sip steadily and avoid drinking it all at bedtime.' };
    if (S.elec > 0 && dayElec(d) < S.elec && m >= 12 * 60 && total > 0) return { c: '', i: '⚡', t: 'Electrolytes', p: 'Add some ORS, soup or laban today to balance the plain water.' };
    return null;
  }

  /* ---------------------------------------------------------------- visuals */
  function waveD(amp) {
    let d = 'M-80,0';
    for (let i = 0; i < 4; i++) d += ' q10,' + (-amp) + ' 20,0 t20,0';
    return d + ' L80,120 L-80,120 Z';
  }
  const levelY = p => 46 - 92 * Math.max(0, Math.min(1, p));

  function logoSvg() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs>' +
      '<linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1747E8"/><stop offset="1" stop-color="#16C6E8"/></linearGradient>' +
      '<linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DDF3FF"/></linearGradient>' +
      '<clipPath id="lgc"><path d="' + DROP + '"/></clipPath></defs>' +
      '<rect width="100" height="100" fill="url(#lg1)"/>' +
      '<g transform="translate(50,52) scale(.6)"><path d="' + DROP + '" fill="url(#lg2)"/>' +
      '<g clip-path="url(#lgc)"><path d="M-40,14 C-27,6 -14,22 0,14 C14,6 27,22 40,14 L40,60 L-40,60 Z" fill="#1B6BFF"/></g>' +
      '<path d="' + PLUS + '" transform="translate(0,-2)" stroke="#1747E8" stroke-width="6.2" stroke-linecap="round" fill="none"/></g></svg>';
  }

  function heroSvg(pct) {
    return '<svg class="drop" viewBox="-36 -52 72 104" role="img" aria-label="' + Math.round(pct * 100) + ' percent of today\'s goal">' +
      '<defs><clipPath id="dclip"><path d="' + DROP + '"/></clipPath>' +
      '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--water-a)"/><stop offset="1" style="stop-color:var(--water-b)"/></linearGradient></defs>' +
      '<path class="shell" d="' + DROP + '"/>' +
      '<g clip-path="url(#dclip)"><g class="water" style="transform:translateY(' + levelY(lastPct) + 'px)">' +
      '<path class="wv2" d="' + waveD(2.6) + '" fill="url(#wg)" opacity=".45"/>' +
      '<path class="wv1" d="' + waveD(2.2) + '" fill="url(#wg)"/></g></g>' +
      '<path d="M-17,4 C-21,13 -20,22 -14,29" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>' +
      '</svg>';
  }

  const ICONS = {
    today: '<path d="M12 3C12 3 5 11 5 15a7 7 0 0 0 14 0C19 11 12 3 12 3Z"/>',
    history: '<path d="M5 20v-6M12 20V6M19 20v-9"/>',
    remind: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5"/>'
  };

  /* ------------------------------------------------------------------ views */
  function installBanner() {
    if (isNative() || isStandalone() || hintDismissed()) return '';
    return '<div class="tip"><span class="ic">📲</span><p><b>Install Hydrate+</b>' + (isIOS() ? 'Add it to your home screen to use it like an app and keep your data.' : 'Install it to open it like an app, even offline.') +
      '<br><button class="btn sm" data-act="install-help">Show me how</button></p><button class="dismiss" data-act="install-dismiss" aria-label="Dismiss">×</button></div>';
  }

  function vToday() {
    const k = today(), d = S.days[k], total = dayTotal(d), goal = dayGoal(k), pct = Math.min(1, total / goal);
    const p = pace(), t = tip(), st = streak();
    const log = d ? d.e.slice().reverse() : [];
    const elec = dayElec(d);
    return '<div class="top"><div class="brand">' + logoSvg() + '<div><h1>Hydrate<span>+</span></h1><small>' +
      new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '</small></div></div>' +
      '<span class="chip">' + (st > 0 ? '🔥 <b>' + st + '</b> day' + (st > 1 ? 's' : '') : 'Goal <b>' + fmtL(goal) + ' L</b>') + '</span></div>' +
      '<section class="hero' + (total >= goal ? ' done' : '') + '" id="hero">' + heroSvg(pct) +
      '<div class="big">' + fmtL(total) + '<small>L</small></div>' +
      '<div class="of">of ' + fmtL(goal) + ' L · ' + (total >= goal ? '+' + fmtMl(total - goal) + ' ml over' : fmtMl(goal - total) + ' ml to go') + '</div>' +
      '<div class="pace ' + p.cls + '">' + p.txt + '</div></section>' +
      '<div class="quick">' + S.presets.map(ml => '<button class="qbtn" data-act="add" data-ml="' + ml + '">+' + ml + '<small>ml</small></button>').join('') + '</div>' +
      '<div class="drinks" role="radiogroup" aria-label="Drink type">' + Object.keys(TYPES).map(id =>
        '<button class="dchip' + (S.type === id ? ' on' : '') + '" role="radio" aria-checked="' + (S.type === id) + '" data-act="type" data-t="' + id + '">' + TYPES[id].i + ' ' + TYPES[id].n + '</button>').join('') + '</div>' +
      '<div class="actions"><button class="btn" data-act="custom">Custom amount</button><button class="btn ghost" data-act="undo"' + (log.length ? '' : ' disabled') + '>Undo last</button></div>' +
      installBanner() +
      (t ? '<div class="tip ' + t.c + '"><span class="ic">' + t.i + '</span><p><b>' + t.t + '</b>' + t.p + '</p></div>' : '') +
      '<div class="card"><h3>Today\'s extras</h3>' +
      '<div class="set"><div><div class="t">Workout or exercise</div><div class="d">Adds ' + S.bonus + ' ml to today\'s goal</div></div><label class="switch"><input type="checkbox" data-bonus="w"' + (d && d.w ? ' checked' : '') + ' aria-label="Workout day"><i></i></label></div>' +
      '<div class="set"><div><div class="t">Hot or humid day</div><div class="d">Adds ' + S.bonus + ' ml to today\'s goal</div></div><label class="switch"><input type="checkbox" data-bonus="h"' + (d && d.h ? ' checked' : '') + ' aria-label="Hot day"><i></i></label></div></div>' +
      (S.elec > 0 ? '<div class="card"><div class="row"><h2>Electrolytes</h2><span class="muted">' + fmtMl(elec) + ' / ' + fmtMl(S.elec) + ' ml</span></div>' +
        '<div class="meter" style="margin-top:10px"><i class="' + (elec >= S.elec ? 'hit' : '') + '" style="width:' + Math.min(100, elec / S.elec * 100) + '%"></i></div>' +
        '<p class="muted" style="margin-top:8px">ORS, soup and laban count here as well as toward your total.</p></div>' : '') +
      '<div class="card"><h2>Today\'s log</h2>' + (log.length ? '<ul class="entries">' + log.map(en =>
        '<li class="entry"><span class="e-ic">' + TYPES[en.ty].i + '</span><div><div class="e-name">' + TYPES[en.ty].n + '</div><div class="e-time">' + fmtTs(en.t) + '</div></div>' +
        '<span class="e-ml">' + fmtMl(en.ml) + ' ml</span>' +
        '<button class="x' + (ui.armed === en.id ? ' arm' : '') + '" data-act="rm" data-k="' + k + '" data-id="' + en.id + '" aria-label="Delete entry">' + (ui.armed === en.id ? 'Delete?' : '×') + '</button></li>').join('') + '</ul>'
        : '<div class="empty">Nothing logged yet. Tap a size above after each drink.</div>') + '</div>';
  }

  function rangeKeys(n) {
    const out = [];
    let k = today();
    for (let i = 0; i < n; i++) { out.unshift(k); k = addDays(k, -1); }
    return out;
  }

  function chartSvg(keys) {
    const W = 320, H = 156, L = 30, R = 6, T = 12, B = 22;
    const pw = W - L - R, ph = H - T - B, n = keys.length;
    const totals = keys.map(k => dayTotal(S.days[k]));
    const goalNow = dayGoal(today());
    const max = Math.max(goalNow, ...totals) * 1.08;
    const bw = pw / n * 0.62;
    const y = v => T + ph - (v / max) * ph;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily intake chart">' +
      '<defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent2)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient>' +
      '<linearGradient id="barhit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD07E"/><stop offset="1" stop-color="#12A150"/></linearGradient></defs>';
    s += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(goalNow) + '" y2="' + y(goalNow) + '"/>';
    s += '<text x="' + (L - 4) + '" y="' + (y(goalNow) + 3) + '" text-anchor="end">' + fmtL(goalNow) + '</text>';
    s += '<text x="' + (L - 4) + '" y="' + (T + ph + 3) + '" text-anchor="end">0</text>';
    keys.forEach((k, i) => {
      const x = L + (pw / n) * i + (pw / n - bw) / 2;
      const h = Math.max(totals[i] > 0 ? 2 : 0, (totals[i] / max) * ph);
      s += '<rect class="bar' + (met(k) ? ' hit' : '') + (k === today() ? ' today' : '') + '" data-act="day" data-k="' + k + '" x="' + x.toFixed(1) + '" y="' + (T + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/>';
      const show = n <= 7 || (n <= 14 && i % 2 === (n - 1) % 2) || (n > 14 && (n - 1 - i) % 5 === 0);
      if (show) {
        const dt = parseKey(k);
        const lab = n <= 7 ? dt.toLocaleDateString('en-GB', { weekday: 'short' }) : String(dt.getDate());
        s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + lab + '</text>';
      }
    });
    return s + '</svg>';
  }

  function dayLabel(k) {
    if (k === today()) return 'Today';
    if (k === addDays(today(), -1)) return 'Yesterday';
    return parseKey(k).toLocaleDateString('en-GB', { weekday: 'long' });
  }

  function vHistory() {
    const keys = rangeKeys(ui.range);
    const tots = keys.map(k => dayTotal(S.days[k]));
    const logged = tots.filter(t => t > 0);
    const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
    const hits = keys.filter(met).length;
    const best = Math.max(0, ...tots);
    return '<div class="top"><div class="brand"><div><h1>History</h1><small>Your daily totals</small></div></div>' +
      '<div class="seg" role="tablist">' + [7, 14, 30].map(n => '<button class="' + (ui.range === n ? 'on' : '') + '" data-act="range" data-n="' + n + '">' + n + 'd</button>').join('') + '</div></div>' +
      '<div class="card" style="margin-top:0">' + chartSvg(keys) + '<p class="muted" style="margin-top:6px">Green bars reached the goal. Tap a bar to see or fix that day.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="v">' + (avg ? fmtL(avg) + ' L' : '–') + '</div><div class="l">Average per logged day</div></div>' +
      '<div class="stat"><div class="v">' + hits + ' / ' + keys.length + '</div><div class="l">Days goal reached</div></div>' +
      '<div class="stat"><div class="v">' + (best ? fmtL(best) + ' L' : '–') + '</div><div class="l">Best day</div></div>' +
      '<div class="stat"><div class="v">' + streak() + '</div><div class="l">Current streak (days)</div></div></div>' +
      '<div class="card"><h2>Days</h2>' + keys.slice().reverse().map(k => {
        const t = dayTotal(S.days[k]), g = dayGoal(k);
        return '<button class="dayrow" data-act="day" data-k="' + k + '"><span class="dn">' + dayLabel(k) + '<small>' + parseKey(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</small></span>' +
          '<span class="meter"><i class="' + (t >= g ? 'hit' : '') + '" style="width:' + Math.min(100, t / g * 100) + '%"></i></span><span class="dv">' + fmtL(t) + ' L</span></button>';
      }).join('') + '</div>';
  }

  function reminderTimes() {
    const s = toMin(S.rem.start), e = toMin(S.rem.end), out = [];
    if (e <= s) return out;
    for (let t = s; t <= e && out.length < 40; t += S.rem.every) out.push(t);
    return out;
  }

  function vRemindWeb() {
    const times = reminderTimes();
    return '<div class="top"><div class="brand"><div><h1>Reminders</h1><small>Drink times to follow</small></div></div></div>' +
      '<div class="card" style="margin-top:0"><h2>Reminders need the Android app</h2>' +
      '<p class="muted">A web app on ' + (isIOS() ? 'iPhone' : 'this device') + ' cannot schedule its own notifications. Use your phone\'s own tools with the schedule below.</p>' +
      '<div class="set"><div class="t">First drink</div><input type="time" data-set="rem-start" value="' + S.rem.start + '"></div>' +
      '<div class="set"><div class="t">Last drink</div><input type="time" data-set="rem-end" value="' + S.rem.end + '"></div>' +
      '<div class="set"><div class="t">Every</div><select data-set="rem-every" aria-label="Interval">' + [45, 60, 90, 120, 150, 180].map(n => '<option value="' + n + '"' + (S.rem.every === n ? ' selected' : '') + '>' + (n % 60 === 0 ? n / 60 + ' h' : n + ' min') + '</option>').join('') + '</select></div>' +
      (times.length ? '<div class="times">' + times.map(t => '<span>' + fmtMin(t) + '</span>').join('') + '</div>' : '<p class="muted" style="margin-top:10px">Set the last drink later than the first.</p>') + '</div>' +
      '<div class="card"><h2>Set reminders on your phone</h2><ol class="steps">' +
      '<li><span>Open the <b>Clock</b> app and add alarms at the times above.</span></li>' +
      '<li><span>Label each one <b>Drink water</b> and set it to repeat every day.</span></li>' +
      '<li><span>Or use <b>Shortcuts → Automation → Time of Day</b> to show a notification at each time.</span></li></ol>' +
      '<p class="muted" style="margin-top:8px">Automatic reminders, home-screen widgets and Galaxy Fit3 alerts are available in the Android app.</p></div>';
  }

  function vRemind() {
    if (!isNative()) return vRemindWeb();
    const times = reminderTimes();
    const native = isNative();
    const permBadge = !native ? '<span class="badge off">App only</span>' : ui.perm === 'granted' ? '<span class="badge">Allowed</span>' : ui.perm === 'denied' ? '<span class="badge off">Blocked</span>' : '<span class="badge off">Not allowed yet</span>';
    return '<div class="top"><div class="brand"><div><h1>Reminders</h1><small>Gentle nudges through the day</small></div></div></div>' +
      '<div class="card" style="margin-top:0"><div class="set"><div><div class="t">Drink reminders ' + permBadge + '</div><div class="d">' + (S.rem.on ? times.length + ' per day, repeating daily' : 'Off') + '</div></div>' +
      '<label class="switch"><input type="checkbox" data-set="rem-on"' + (S.rem.on ? ' checked' : '') + ' aria-label="Drink reminders"><i></i></label></div>' +
      '<div class="set"><div class="t">First reminder</div><input type="time" data-set="rem-start" value="' + S.rem.start + '"></div>' +
      '<div class="set"><div class="t">Last reminder</div><input type="time" data-set="rem-end" value="' + S.rem.end + '"></div>' +
      '<div class="set"><div class="t">Every</div><select data-set="rem-every" aria-label="Interval">' + [45, 60, 90, 120, 150, 180].map(n => '<option value="' + n + '"' + (S.rem.every === n ? ' selected' : '') + '>' + (n % 60 === 0 ? n / 60 + ' h' : n + ' min') + '</option>').join('') + '</select></div>' +
      '<div class="set"><div><div class="t">Quick-add buttons</div><div class="d">Show +250 and +500 ml on the notification</div></div><label class="switch"><input type="checkbox" data-set="rem-actions"' + (S.rem.actions ? ' checked' : '') + ' aria-label="Quick add buttons"><i></i></label></div>' +
      (times.length ? '<div class="times">' + times.map(t => '<span>' + fmtMin(t) + '</span>').join('') + '</div>' : '<p class="muted" style="margin-top:10px">Set the last reminder later than the first.</p>') +
      (ui.exact === 'denied' ? '<div class="tip warn"><span class="ic">⏰</span><p><b>Exact alarms are off</b>Android may delay reminders. <button class="btn sm" data-act="exact" style="margin-top:8px">Allow exact alarms</button></p></div>' : '') +
      '<div class="actions"><button class="btn" data-act="test"' + (native ? '' : ' disabled') + '>Send a test reminder</button></div></div>' +
      '<div class="card"><h2>Galaxy Fit3 setup</h2>' +
      '<p class="muted">The Fit3 cannot run apps itself. It mirrors this phone\'s notifications, so every Hydrate+ reminder buzzes your wrist.</p>' +
      '<ol class="steps"><li><span>Open the <b>Galaxy Wearable</b> app on this phone and select your Fit3.</span></li>' +
      '<li><span>Go to <b>Band settings → Notifications → App notifications</b>.</span></li>' +
      '<li><span>Switch on <b>Hydrate+</b> in the list.</span></li>' +
      '<li><span>Optional: turn on <b>Show alerts even when phone in use</b> so the band still buzzes while you hold the phone.</span></li>' +
      '<li><span>Wear the band. It only mirrors alerts while it is on your wrist.</span></li></ol>' +
      '<p class="muted" style="margin-top:8px">Log your drinks on the phone. The band shows reminders only, and Hydrate+ does not sync to Samsung Health.</p></div>';
  }

  function widgetOptions() {
    const list = Array.from(new Set(S.presets.concat([S.widgetMl]))).sort((a, b) => a - b);
    return list.map(n => '<option value="' + n + '"' + (S.widgetMl === n ? ' selected' : '') + '>+' + n + ' ml</option>').join('');
  }

  function widgetCard() {
    if (!isNative()) {
      if (isStandalone()) return '';
      return '<div class="card"><h3>Install on your phone</h3><p class="muted">' + (isIOS() ? 'Open this page in Safari, tap Share, then Add to Home Screen. Start logging after you open it from the home screen, because data saved in Safari does not carry over.' : 'Use your browser menu and choose Install app or Add to Home screen.') + '</p>' +
        '<div class="actions"><button class="btn" data-act="install-help">Show the steps</button></div></div>';
    }
    return '<div class="card"><h3>Home-screen widget</h3><p class="muted">Add water from your home screen with one tap. The wave shows today\'s progress and matches the app.</p>' +
      '<div class="set"><div><div class="t">Widget button adds</div></div><select data-set="wml" aria-label="Widget amount">' + widgetOptions() + '</select></div>' +
      '<div class="actions"><button class="btn" data-act="pin" data-kind="wide">Add 2×1 widget</button><button class="btn" data-act="pin" data-kind="small">Add 1×1 button</button></div>' +
      '<p class="muted" style="margin-top:10px">Or touch and hold an empty spot on the home screen, tap Widgets, and choose Hydrate+.</p></div>';
  }

  function sheetInstall() {
    const ios = isIOS();
    openSheet('<h2>Install Hydrate+</h2>' +
      (ios ? '<ol class="steps"><li><span>Open this page in <b>Safari</b>. Other iPhone browsers cannot add it.</span></li>' +
        '<li><span>Tap the <b>Share</b> button (the square with an arrow).</span></li>' +
        '<li><span>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>' +
        '<li><span>Open <b>Hydrate+</b> from your home screen and start logging there.</span></li></ol>' +
        '<p class="muted">Data saved while browsing in Safari stays in Safari. Install first, then log.</p>'
        : '<ol class="steps"><li><span>Open the browser menu (the three dots).</span></li><li><span>Tap <b>Install app</b> or <b>Add to Home screen</b>.</span></li><li><span>Open <b>Hydrate+</b> from your home screen.</span></li></ol>') +
      '<div class="actions"><button class="btn primary" data-act="close">Got it</button></div>');
  }

  function vSettings() {
    return '<div class="top"><div class="brand"><div><h1>Settings</h1><small>Goal, sizes and data</small></div></div></div>' +
      '<div class="card" style="margin-top:0"><h3>Daily goal</h3><div class="row"><div class="stepper"><button data-act="goal" data-d="-250" aria-label="Decrease goal">−</button><output>' + fmtL(S.goal) + ' L</output><button data-act="goal" data-d="250" aria-label="Increase goal">+</button></div></div>' +
      '<p class="muted" style="margin-top:10px">Default is 3.5 L. Set it to the amount your doctor advised.</p>' +
      '<div class="sep"></div>' +
      '<div class="set"><div><div class="t">Workout or hot day bonus</div></div><select data-set="bonus" aria-label="Bonus">' + [0, 250, 500, 750, 1000].map(n => '<option value="' + n + '"' + (S.bonus === n ? ' selected' : '') + '>+' + n + ' ml</option>').join('') + '</select></div>' +
      '<div class="set"><div><div class="t">Electrolyte target</div><div class="d">ORS, soup and laban. 0 turns it off</div></div><input type="number" inputmode="numeric" min="0" max="4000" step="50" data-set="elec" value="' + S.elec + '" aria-label="Electrolyte target ml"></div></div>' +
      widgetCard() +
      '<div class="card"><h3>Quick-add sizes (ml)</h3><div class="row" style="gap:8px">' + S.presets.map((p, i) => '<input type="number" inputmode="numeric" min="25" max="2000" step="25" style="width:100%;text-align:center" data-set="preset" data-i="' + i + '" value="' + p + '" aria-label="Size ' + (i + 1) + '">').join('') + '</div></div>' +
      '<div class="card"><h3>Appearance</h3><div class="seg">' + ['auto', 'light', 'dark'].map(t => '<button class="' + (S.theme === t ? 'on' : '') + '" data-act="theme" data-t="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div></div>' +
      '<div class="card"><h3>Your data</h3><p class="muted">Everything is stored on this phone only. Export a backup before changing phones.</p>' +
      '<div class="actions"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Restore backup</button></div>' +
      '<div class="actions"><button class="btn danger" data-act="reset">Erase all data</button></div></div>' +
      '<div class="card"><h3>About</h3><p class="muted">Hydrate+ ' + VERSION + '. A simple water tracker. It is not medical advice. If you have lasting dizziness, cramps or breathlessness, speak to your doctor. For chest pain, fainting or breathlessness at rest, seek emergency care.</p></div>';
  }

  /* ----------------------------------------------------------------- render */
  function renderNav() {
    const items = [['today', 'Today'], ['history', 'History'], ['remind', 'Reminders'], ['settings', 'Settings']];
    $('#nav').innerHTML = items.map(([id, l]) => '<button class="' + (ui.tab === id ? 'on' : '') + '" data-act="tab" data-tab="' + id + '" aria-current="' + (ui.tab === id) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[id] + '</svg>' + l + '</button>').join('');
  }

  function render() {
    const main = $('#main');
    const top = main.scrollTop;
    main.innerHTML = ({ today: vToday, history: vHistory, remind: vRemind, settings: vSettings })[ui.tab]();
    main.scrollTop = top;
    renderNav();
    if (ui.tab === 'today') {
      const k = today(), pct = Math.min(1, dayTotal(S.days[k]) / dayGoal(k));
      const w = main.querySelector('.water');
      if (w) requestAnimationFrame(() => requestAnimationFrame(() => { w.style.transform = 'translateY(' + levelY(pct) + 'px)'; }));
      lastPct = pct;
    }
  }

  /* ---------------------------------------------------------- toast & sheet */
  let toastTimer = null, toastUndo = null;
  function toast(msg, undo) {
    const el = $('#toast');
    toastUndo = undo || null;
    el.innerHTML = '<span>' + msg + '</span>' + (undo ? '<button data-act="toast-undo">Undo</button>' : '');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2600);
  }
  function openSheet(html) {
    const r = $('#sheet-root');
    r.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    r.classList.add('open');
    ui.sheet = true;
  }
  function closeSheet() {
    const r = $('#sheet-root');
    r.classList.remove('open');
    r.innerHTML = '';
    ui.sheet = null;
  }
  const typeOptions = sel => Object.keys(TYPES).map(id => '<option value="' + id + '"' + (sel === id ? ' selected' : '') + '>' + TYPES[id].n + '</option>').join('');

  function sheetCustom() {
    openSheet('<h2>Custom amount</h2><div class="field"><label for="c-ml">Amount (ml)</label><input id="c-ml" type="number" inputmode="numeric" min="10" max="3000" step="10" placeholder="e.g. 400"></div>' +
      '<div class="field"><label for="c-ty">Drink</label><select id="c-ty" style="width:100%">' + typeOptions(S.type) + '</select></div>' +
      '<div class="actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="custom-add">Add</button></div>');
    setTimeout(() => { const i = $('#c-ml'); if (i) i.focus(); }, 60);
  }

  function sheetDay(k) {
    const d = S.days[k], list = d ? d.e.slice().reverse() : [], g = dayGoal(k), t = dayTotal(d);
    const dflt = k === today() ? fromMin(nowMin()) : '12:00';
    openSheet('<h2>' + dayLabel(k) + ' · ' + parseKey(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + '</h2>' +
      '<p class="muted">' + fmtL(t) + ' L of ' + fmtL(g) + ' L' + (t >= g ? ' · goal reached' : '') + '</p>' +
      (list.length ? '<ul class="entries" style="margin-top:8px">' + list.map(en => '<li class="entry"><span class="e-ic">' + TYPES[en.ty].i + '</span><div><div class="e-name">' + TYPES[en.ty].n + '</div><div class="e-time">' + fmtTs(en.t) + '</div></div><span class="e-ml">' + fmtMl(en.ml) + ' ml</span><button class="x" data-act="sheet-rm" data-k="' + k + '" data-id="' + en.id + '" aria-label="Delete entry">×</button></li>').join('') + '</ul>' : '<div class="empty">No entries this day.</div>') +
      '<div class="sep"></div><h3 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Add a missed drink</h3>' +
      '<div class="row" style="gap:8px"><input id="d-ml" type="number" inputmode="numeric" min="10" max="3000" step="10" placeholder="ml" style="width:100px;text-align:left"><select id="d-ty" style="flex:1">' + typeOptions('water') + '</select><input id="d-tm" type="time" value="' + dflt + '"></div>' +
      '<div class="actions"><button class="btn ghost" data-act="close">Close</button><button class="btn primary" data-act="day-add" data-k="' + k + '">Add</button></div>');
  }

  function sheetBackup(mode) {
    if (mode === 'export') {
      openSheet('<h2>Backup</h2><p class="muted">Copy this text and keep it somewhere safe, such as a note or an email to yourself.</p><div class="field"><textarea id="bk" readonly>' + JSON.stringify(S) + '</textarea></div>' +
        '<div class="actions"><button class="btn ghost" data-act="close">Close</button><button class="btn primary" data-act="copy">Copy</button></div>');
    } else {
      openSheet('<h2>Restore backup</h2><p class="muted">Paste a backup here. It replaces the data on this phone.</p><div class="field"><textarea id="bk" placeholder="Paste backup text"></textarea></div>' +
        '<div class="actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="restore">Restore</button></div>');
    }
  }

  /* ------------------------------------------------------- home-screen widgets */
  const HB = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HydrateBridge) || null;
  let widgetTimer = null;
  function queueWidget() {
    if (!HB()) return;
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(widgetPush, 150);
  }
  function widgetPush() {
    const bridge = HB();
    if (!bridge || !S) return;
    const k = today();
    try {
      bridge.setState({ date: k, total: dayTotal(S.days[k]), goal: dayGoal(k), baseGoal: S.goal, addMl: S.widgetMl });
    } catch (e) { /* ignore */ }
  }
  /** Bring in water that was added from the home-screen widgets while the app was closed. */
  async function widgetPull() {
    const bridge = HB();
    if (!bridge) return 0;
    let n = 0;
    try {
      const r = await bridge.drainPending();
      (r && r.entries || []).forEach(en => {
        if (en && Number.isFinite(en.t) && Number.isFinite(en.ml) && addEntry(en.ml, 'water', { k: dkey(new Date(en.t)), t: en.t })) n++;
      });
    } catch (e) { /* ignore */ }
    widgetPush();
    if (n) { render(); toast('Added ' + n + ' drink' + (n > 1 ? 's' : '') + ' from the widget'); }
    return n;
  }

  /* --------------------------------------------------------- notifications */
  async function refreshPerm() {
    const LN = nativeLN();
    if (!LN) { ui.perm = 'na'; ui.exact = 'na'; return; }
    try { ui.perm = (await LN.checkPermissions()).display; } catch (e) { ui.perm = 'unknown'; }
    try { if (LN.checkExactNotificationSetting) ui.exact = (await LN.checkExactNotificationSetting()).exact_alarm; } catch (e) { ui.exact = 'unknown'; }
  }

  async function setupNative() {
    const LN = nativeLN();
    if (!LN) return;
    try { await LN.createChannel({ id: 'hydrate', name: 'Water reminders', description: 'Drink reminders', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* ignore */ }
    try {
      await LN.registerActionTypes({ types: [{ id: 'HYDRATE', actions: [{ id: 'add250', title: '+250 ml' }, { id: 'add500', title: '+500 ml' }] }] });
    } catch (e) { /* ignore */ }
    try {
      await LN.addListener('localNotificationActionPerformed', ev => {
        const a = ev && ev.actionId;
        if (a === 'add250' || a === 'add500') {
          const ml = a === 'add250' ? 250 : 500;
          const r = addEntry(ml, 'water');
          if (r) { ui.tab = 'today'; render(); toast('Added ' + ml + ' ml' + (r.crossed ? ' · goal reached' : '')); }
        } else { ui.tab = 'today'; render(); }
      });
    } catch (e) { /* ignore */ }
    await refreshPerm();
    if (S.rem.on && ui.perm === 'granted') await syncReminders();
  }

  async function cancelAll() {
    const LN = nativeLN();
    if (!LN) return;
    try {
      const p = await LN.getPending();
      const ids = (p.notifications || []).map(n => n.id).filter(id => id >= ID_BASE && id <= ID_MAX);
      if (ids.length) await LN.cancel({ notifications: ids.map(id => ({ id })) });
    } catch (e) { /* ignore */ }
  }

  async function syncReminders() {
    const LN = nativeLN();
    if (!LN) return;
    await cancelAll();
    if (!S.rem.on) return;
    const times = reminderTimes();
    const notifications = times.map((t, i) => ({
      id: ID_BASE + i,
      title: 'Hydrate+',
      body: NOTE_BODIES[i % NOTE_BODIES.length],
      channelId: 'hydrate',
      schedule: { on: { hour: Math.floor(t / 60), minute: t % 60 }, allowWhileIdle: true },
      actionTypeId: S.rem.actions ? 'HYDRATE' : undefined,
      extra: { slot: i }
    }));
    if (notifications.length) {
      try { await LN.schedule({ notifications }); } catch (e) { toast('Could not schedule reminders'); }
    }
  }

  async function enableReminders() {
    const LN = nativeLN();
    if (!LN) { toast('Reminders work in the Android app'); return false; }
    await refreshPerm();
    if (ui.perm !== 'granted') {
      try { ui.perm = (await LN.requestPermissions()).display; } catch (e) { /* ignore */ }
    }
    if (ui.perm !== 'granted') { toast('Allow notifications in Android settings'); return false; }
    return true;
  }

  async function sendTest() {
    const LN = nativeLN();
    if (!LN) return;
    if (!(await enableReminders())) { render(); return; }
    try {
      await LN.schedule({ notifications: [{ id: ID_TEST, title: 'Hydrate+', body: 'Test reminder. Check your Fit3.', channelId: 'hydrate', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, actionTypeId: S.rem.actions ? 'HYDRATE' : undefined }] });
      toast('Test reminder in 5 seconds');
    } catch (e) { toast('Could not send the test'); }
  }

  /* ---------------------------------------------------------------- actions */
  function doAdd(ml, ty) {
    const r = addEntry(ml, ty || S.type);
    if (!r) { toast('Enter an amount between 10 and 3000 ml'); return; }
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* ignore */ }
    render();
    const hero = $('#hero');
    if (hero && r.crossed) { hero.classList.add('pulse'); setTimeout(() => hero.classList.remove('pulse'), 1000); }
    toast('Added ' + r.en.ml + ' ml' + (r.crossed ? ' · goal reached' : ''), () => { removeEntry(r.k, r.en.id); render(); });
  }

  function copyText(txt) {
    const done = () => toast('Copied');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, fallback); return; }
    } catch (e) { /* fall through */ }
    fallback();
    function fallback() {
      const ta = $('#bk');
      if (ta) { ta.removeAttribute('readonly'); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Select the text and copy it'); } }
    }
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (a !== 'rm') ui.armed = null;
    switch (a) {
      case 'tab': ui.tab = el.dataset.tab; if (ui.tab === 'remind') { await refreshPerm(); } render(); $('#main').scrollTop = 0; break;
      case 'add': doAdd(Number(el.dataset.ml)); break;
      case 'type': S.type = el.dataset.t; save(); render(); break;
      case 'custom': sheetCustom(); break;
      case 'custom-add': { const v = Number($('#c-ml').value); const ty = $('#c-ty').value; if (v > 0 && v <= 3000) { closeSheet(); doAdd(v, ty); } else toast('Enter an amount between 10 and 3000 ml'); break; }
      case 'undo': { const d = S.days[today()]; if (d && d.e.length) { const en = d.e[d.e.length - 1]; removeEntry(today(), en.id); render(); toast('Removed ' + en.ml + ' ml', () => { restoreEntry(today(), en); render(); }); } break; }
      case 'rm': {
        if (ui.armed === el.dataset.id) {
          const en = removeEntry(el.dataset.k, el.dataset.id); ui.armed = null; render();
          if (en) toast('Entry deleted', () => { restoreEntry(el.dataset.k, en); render(); });
        } else {
          ui.armed = el.dataset.id; render();
          const id = el.dataset.id; setTimeout(() => { if (ui.armed === id) { ui.armed = null; if (!ui.sheet) render(); } }, 3000);
        }
        break;
      }
      case 'toast-undo': if (toastUndo) { const f = toastUndo; toastUndo = null; f(); $('#toast').classList.remove('show'); } break;
      case 'range': ui.range = Number(el.dataset.n); render(); break;
      case 'day': sheetDay(el.dataset.k); break;
      case 'sheet-rm': { const k = el.dataset.k; const en = removeEntry(k, el.dataset.id); sheetDay(k); render(); if (en) toast('Entry deleted', () => { restoreEntry(k, en); render(); }); break; }
      case 'day-add': {
        const k = el.dataset.k, v = Number($('#d-ml').value), ty = $('#d-ty').value, tm = $('#d-tm').value || '12:00';
        if (!(v > 0 && v <= 3000)) { toast('Enter an amount between 10 and 3000 ml'); break; }
        const dt = parseKey(k); dt.setHours(Math.floor(toMin(tm) / 60), toMin(tm) % 60, 0, 0);
        addEntry(v, ty, { k, t: dt.getTime() }); sheetDay(k); render(); toast('Added ' + v + ' ml'); break;
      }
      case 'close': closeSheet(); break;
      case 'goal': {
        const g = Math.max(1000, Math.min(6000, S.goal + Number(el.dataset.d)));
        S.goal = g; const d = S.days[today()]; if (d) d.g = g; save(); render(); break;
      }
      case 'theme': S.theme = el.dataset.t; save(); applyTheme(); render(); break;
      case 'export': sheetBackup('export'); break;
      case 'import': sheetBackup('import'); break;
      case 'copy': copyText($('#bk').value); break;
      case 'restore': {
        try {
          const o = JSON.parse($('#bk').value.trim());
          if (!o || typeof o !== 'object' || typeof o.days !== 'object') throw new Error('bad');
          S = sanitize(o); save(); closeSheet(); applyTheme(); render(); toast('Backup restored'); syncReminders();
        } catch (err) { toast('That is not a valid backup'); }
        break;
      }
      case 'reset': {
        if (el.dataset.sure) {
          S = DEFAULTS(); save(); await cancelAll(); applyTheme(); render(); toast('All data erased');
        } else {
          el.dataset.sure = '1'; el.textContent = 'Tap again to erase everything';
          setTimeout(() => { if (el.isConnected) { delete el.dataset.sure; el.textContent = 'Erase all data'; } }, 3500);
        }
        break;
      }
      case 'test': sendTest(); break;
      case 'install-help': sheetInstall(); break;
      case 'install-dismiss': dismissHint(); render(); break;
      case 'pin': {
        const bridge = HB();
        if (!bridge) { toast('Widgets work in the Android app'); break; }
        try {
          const r = await bridge.pinWidget({ kind: el.dataset.kind });
          toast(r && r.requested ? 'Confirm on your home screen' : 'Touch and hold the home screen, then tap Widgets');
        } catch (err) { toast('Touch and hold the home screen, then tap Widgets'); }
        break;
      }
      case 'exact': { const LN = nativeLN(); try { await LN.changeExactNotificationSetting(); } catch (err) { /* ignore */ } break; }
      default: break;
    }
  });

  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.bonus) {
      const d = day(today(), true); d[el.dataset.bonus] = el.checked; save(); render(); return;
    }
    const s = el.dataset.set;
    if (!s) return;
    switch (s) {
      case 'rem-on':
        if (el.checked) {
          const ok = await enableReminders();
          S.rem.on = ok; save();
          if (ok) await syncReminders();
        } else { S.rem.on = false; save(); await cancelAll(); }
        render(); break;
      case 'rem-start': case 'rem-end': {
        if (!/^\d{2}:\d{2}$/.test(el.value)) { render(); break; }
        S.rem[s === 'rem-start' ? 'start' : 'end'] = el.value; save();
        if (S.rem.on) await syncReminders();
        render(); break;
      }
      case 'rem-every': S.rem.every = Number(el.value); save(); if (S.rem.on) await syncReminders(); render(); break;
      case 'rem-actions': S.rem.actions = el.checked; save(); if (S.rem.on) await syncReminders(); render(); break;
      case 'bonus': S.bonus = Number(el.value); save(); render(); break;
      case 'wml': S.widgetMl = Number(el.value); save(); render(); break;
      case 'elec': { const v = Math.round(Number(el.value)); S.elec = Number.isFinite(v) && v >= 0 && v <= 4000 ? v : S.elec; save(); render(); break; }
      case 'preset': {
        const v = Math.round(Number(el.value)), i = Number(el.dataset.i);
        if (Number.isFinite(v) && v >= 25 && v <= 2000) { S.presets[i] = v; save(); } else toast('Sizes must be 25 to 2000 ml');
        render(); break;
      }
      default: break;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target && e.target.id === 'c-ml') { e.preventDefault(); const b = document.querySelector('[data-act="custom-add"]'); if (b) b.click(); }
    if (e.key === 'Escape' && ui.sheet) closeSheet();
  });

  /* ------------------------------------------------------------------ boot */
  function applyTheme() { document.documentElement.setAttribute('data-theme', S.theme); }

  let currentDay = today();
  function tick() {
    if (ui.sheet) return;
    const t = today();
    if (t !== currentDay) { currentDay = t; lastPct = 0; render(); return; }
    if (ui.tab === 'today') render();
  }
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') { await widgetPull(); await refreshPerm(); tick(); if (ui.tab === 'remind' && !ui.sheet) render(); }
  });

  applyTheme();
  render();
  setupNative().then(() => { if (ui.tab === 'remind') render(); });
  widgetPull();
  if (!isNative() && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ }); });
  }

  // Small hook for automated tests.
  window.__hydrate = { get state() { return S; }, dayTotal, dayGoal, streak, pace, reminderTimes, syncReminders };
})();
