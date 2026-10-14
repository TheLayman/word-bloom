/*!
 * Word Bloom — telemetry
 * ---------------------------------------------------------------------------
 * The entire point of a $1,000 pilot is the DATA, so the build instruments
 * itself from day one. Three audiences:
 *
 *   1. The portal dashboard (aggregate, delayed) — out of our control.
 *   2. This event log (raw, local, immediate) — exportable as JSON for
 *      analysis, and the only source of session-length data.
 *   3. A host hook (window.__WB_TRACK) so any analytics SDK can be wired in
 *      without touching game code.
 *
 * Events are a capped ring buffer persisted to storage, so a long pilot cannot
 * blow the ~5MB localStorage quota.
 */
(function (root) {
  'use strict';

  var MAX_EVENTS = 600;
  var STORE_KEY = 'wordbloom.telemetry.v1';

  var events = [];
  var sessionId = null;
  var sessionStart = 0;
  var sessionEvents = 0;

  function now() { return Date.now(); }

  function readStore() {
    try {
      var raw = root.localStorage.getItem(STORE_KEY);
      if (raw) events = JSON.parse(raw) || [];
    } catch (e) { events = []; }
    if (!Array.isArray(events)) events = [];
    return events;
  }

  function writeStore() {
    try {
      root.localStorage.setItem(STORE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    } catch (e) { /* quota or blocked — telemetry must never break gameplay */ }
  }

  function uid() {
    return now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Record one event. Never throws, never blocks the game loop. */
  function track(name, data) {
    var evt = { t: now(), e: name, s: sessionId, d: data || {} };
    events.push(evt);
    if (events.length > MAX_EVENTS) events.shift();
    sessionEvents++;
    writeStore();

    // Host hook: let a portal/analytics SDK observe events.
    try {
      if (typeof root.__WB_TRACK === 'function') root.__WB_TRACK(name, evt.d);
    } catch (e) {}

    return evt;
  }

  function startSession() {
    readStore();
    sessionId = uid();
    sessionStart = now();
    sessionEvents = 0;
    track('session_start', {
      // Screen size and orientation matter when triaging portal crashes.
      w: root.innerWidth || 0,
      h: root.innerHeight || 0,
      portrait: (root.innerHeight || 0) >= (root.innerWidth || 0)
    });
  }

  /** Returns the session's duration in seconds. */
  function endSession(reason) {
    var secs = Math.round((now() - sessionStart) / 1000);
    track('session_end', { seconds: secs, reason: reason || 'unknown', events: sessionEvents });
    return secs;
  }

  function getEvents() { return events.slice(); }

  function clear() {
    events = [];
    try { root.localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function dayOffset(dayKey, n) {
    var parts = String(dayKey).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + n);
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /**
   * Derived KPIs — the numbers the pilot is actually trying to move.
   * Computed from persisted progress + the event log.
   */
  function kpis(progress) {
    var p = progress || {};
    var days = (p.daysPlayed || []).slice().sort();
    var first = p.firstOpenDay || (days[0] || null);
    var sessions = 0, totalSecs = 0, levelsStarted = 0, levelsCleared = 0;
    var words = 0, bonus = 0, hints = 0;
    var adsRequested = 0, adsStarted = 0, adsCompleted = 0, adsFailed = 0;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      switch (ev.e) {
        case 'session_start': sessions++; break;
        case 'session_end': totalSecs += (ev.d.seconds || 0); break;
        case 'level_start': levelsStarted++; break;
        case 'level_complete': levelsCleared++; break;
        case 'word_found': words++; break;
        case 'bonus_found': bonus++; break;
        case 'hint_used': hints++; break;
        case 'ad_requested': adsRequested++; break;
        case 'ad_started': adsStarted++; break;
        case 'ad_completed': adsCompleted++; break;
        case 'ad_failed': adsFailed++; break;
        default: break;
      }
    }

    var avgSession = sessions > 0 ? Math.round(totalSecs / sessions) : 0;
    var served = adsStarted || 1;

    return {
      firstOpenDay: first,
      daysPlayed: days.length,
      returnedDay1: first ? days.indexOf(dayOffset(first, 1)) !== -1 : false,
      returnedDay7: first ? days.indexOf(dayOffset(first, 7)) !== -1 : false,
      returnedWithin7: first ? days.some(function (d) {
        return d > first && d <= dayOffset(first, 7);
      }) : false,
      sessions: sessions,
      totalPlaySeconds: totalSecs,
      avgSessionSeconds: avgSession,
      avgSessionMinutes: +(avgSession / 60).toFixed(2),
      levelsStarted: levelsStarted,
      levelsCleared: levelsCleared,
      levelsPerSession: sessions ? +(levelsCleared / sessions).toFixed(2) : 0,
      wordsFound: words,
      bonusFound: bonus,
      hintsUsed: hints,
      adsRequested: adsRequested,
      adsStarted: adsStarted,
      adsCompleted: adsCompleted,
      adsFailed: adsFailed,
      adCompletionRate: +(adsCompleted / served).toFixed(3),
      adRequestsPerSession: sessions ? +(adsRequested / sessions).toFixed(2) : 0,
      // CrazyGames reports top word games at ~7.9 impressions per play.
      impressionsPerSession: sessions
        ? +(((adsCompleted) / sessions)).toFixed(2)
        : 0,
      progressed: p.level || 1,
      eventCount: events.length
    };
  }

  /** Download the raw log + derived KPIs as one JSON file. */
  function exportJSON(progress) {
    var payload = {
      exportedAt: new Date().toISOString(),
      build: 'word-bloom-pilot-1',
      kpis: kpis(progress),
      progress: progress,
      events: events
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'word-bloom-telemetry-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return payload;
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.telemetry = {
    track: track,
    startSession: startSession,
    endSession: endSession,
    getEvents: getEvents,
    clear: clear,
    kpis: kpis,
    exportJSON: exportJSON,
    get sessionId() { return sessionId; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
