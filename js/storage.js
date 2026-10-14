/*!
 * Word Bloom — persistence
 * ---------------------------------------------------------------------------
 * localStorage is not guaranteed: portals embed games in sandboxed iframes,
 * Safari private mode throws, and some platforms wipe storage between sessions.
 * Every access therefore goes through a try/catch with an in-memory fallback,
 * so a storage failure degrades to "progress lost on reload" rather than a
 * crashed game.
 */
(function (root) {
  'use strict';

  var KEY = 'wordbloom.progress.v1';
  var memory = null;      // fallback store when localStorage is unavailable
  var available = null;   // lazily probed

  function probe() {
    if (available !== null) return available;
    try {
      var t = '__wb_probe__';
      root.localStorage.setItem(t, '1');
      root.localStorage.removeItem(t);
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  function readRaw() {
    if (!probe()) return memory;
    try { return root.localStorage.getItem(KEY); } catch (e) { return memory; }
  }

  function writeRaw(str) {
    memory = str;
    if (!probe()) return false;
    try { root.localStorage.setItem(KEY, str); return true; } catch (e) { return false; }
  }

  function todayKey(d) {
    var date = d || new Date();
    var m = String(date.getMonth() + 1);
    var day = String(date.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return date.getFullYear() + '-' + m + '-' + day;
  }

  function defaults() {
    return {
      version: 1,
      level: 1,
      coins: 0,
      seeded: false,
      streak: 0,
      lastDailyKey: null,
      levelsCleared: 0,
      wordsFound: 0,
      bonusFound: 0,
      hintsUsed: 0,
      adsWatched: 0,
      adsRequested: 0,
      totalPlaySeconds: 0,
      sessions: 0,
      createdAt: new Date().toISOString(),
      firstOpenDay: todayKey(),
      lastOpenDay: null,
      // Distinct calendar days on which the game was opened. This is how the
      // build measures its own D1/D7 retention during a portal pilot, without
      // depending on the platform's dashboard.
      daysPlayed: []
    };
  }

  function load() {
    var raw = readRaw();
    if (!raw) return defaults();
    try {
      var parsed = JSON.parse(raw);
      var base = defaults();
      for (var k in base) {
        if (!Object.prototype.hasOwnProperty.call(parsed, k)) parsed[k] = base[k];
      }
      if (!Array.isArray(parsed.daysPlayed)) parsed.daysPlayed = [];
      return parsed;
    } catch (e) {
      return defaults();
    }
  }

  function save(progress) {
    try { return writeRaw(JSON.stringify(progress)); } catch (e) { return false; }
  }

  function reset() {
    memory = null;
    if (probe()) { try { root.localStorage.removeItem(KEY); } catch (e) {} }
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.storage = {
    KEY: KEY,
    load: load,
    save: save,
    reset: reset,
    defaults: defaults,
    todayKey: todayKey,
    isPersistent: function () { return probe(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
