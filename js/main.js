/*!
 * Word Bloom — app shell
 * ---------------------------------------------------------------------------
 * Owns everything the engine deliberately does not: navigation, persisted
 * progress, the coin economy, ad pacing rules, the daily challenge and the
 * telemetry export.
 *
 * Ad pacing rules (deliberately conservative — platforms reject builds that
 * spam ads, and spam also destroys the retention the ad revenue depends on):
 *   - Midgame ad: at most once every 3 completed levels AND never inside the
 *     3-minute platform cooldown (enforced in ads.js).
 *   - Rewarded ad: only ever user-initiated, via the Hint button when the
 *     player cannot afford a hint.
 *   - Never during typing or dragging — midgame only fires on level complete.
 */
(function (root) {
  'use strict';

  var WB = root.WordBloom;
  var storage = WB.storage;
  var telemetry = WB.telemetry;
  var ads = WB.ads;
  var audio = WB.audio;

  var MIDGAME_EVERY_N_LEVELS = 3;

  /* Flipped to false by tools/build.mjs for production builds. Gates the dev
     URL parameters (?autostart / ?solve / ?ad) so the shipped build cannot be
     manipulated by a curious player. */
  var DEV = false;

  var progress, levels, catalog;
  var screen = 'home';
  var audioWasOn = true;

  var dom = {};

  /* ------------------------------------------------------------------ boot */

  function boot() {
    progress = storage.load();
    catalog = WB.levels.generateCatalog();
    levels = WB.levels.create(catalog);

    // Grant the starting coin float exactly once. This is a monetisation
    // sequencing decision, not a nicety: the player should experience hints as
    // a normal affordance first, hit the ad wall a few levels in, and only then
    // see the rewarded-ad offer. That yields a clean funnel to measure.
    if (!progress.seeded) {
      progress.coins = Math.max(progress.coins, WB.game.START_COINS);
      progress.seeded = true;
    }

    markToday();
    progress.sessions = (progress.sessions || 0) + 1;
    telemetry.startSession();

    cacheDom();
    buildHome();

    var adapter = ads.init({
      onAdStart: function () {
        // Platform requirement: mute audio and pause while an ad plays.
        audioWasOn = audio.isEnabled();
        audio.setEnabled(false);
        document.body.classList.add('is-ad');
      },
      onAdEnd: function () {
        audio.setEnabled(audioWasOn);
        document.body.classList.remove('is-ad');
      }
    });

    WB.game.init({
      mount: dom.gameMount,
      callbacks: {
        getCoins: function () { return progress.coins; },
        spendCoins: function (n) { progress.coins = Math.max(0, progress.coins - n); save(); },
        onCoins: function (n) { progress.coins += n; save(); },
        onProgress: function () { updateHomeStats(); },
        onWordFound: function () {
          progress.wordsFound = (progress.wordsFound || 0) + 1;
          persistLevel();
          save();
        },
        onHintUsed: function (via) {
          progress.hintsUsed = (progress.hintsUsed || 0) + 1;
          if (via === 'ad') progress.adsWatched = (progress.adsWatched || 0) + 1;
          persistLevel();
          save();
        },
        onHintAdNeeded: function () { return offerRewardedHint(); },
        onLevelComplete: function (result) { onLevelComplete(result); },
        onToast: function (msg) { toast(msg); }
      }
    });

    // Initialise the bridge if it is present, then re-detect the adapter.
    initBridge(adapter);

    window.addEventListener('beforeunload', function () {
      telemetry.endSession('unload');
      progress.totalPlaySeconds = (progress.totalPlaySeconds || 0) +
        Math.round((Date.now() - sessionStartedAt) / 1000);
      save();
    });

    document.addEventListener('visibilitychange', function () {
      telemetry.track('visibility', { state: document.visibilityState });
    });

    telemetry.track('boot', {
      adapter: ads.adapterName(),
      persistentStorage: storage.isPersistent(),
      catalogSize: catalog.length,
      level: progress.level,
      firstOpenDay: progress.firstOpenDay
    });

    renderHome();
    if (DEV) applyDevParams();
  }

  /**
   * Dev affordances, driven by the URL so they work in a headless browser:
   *   ?autostart=1   jump straight into the current level
   *   ?daily=1       jump straight into the daily challenge
   *   ?ad=demo       preview the rewarded-ad stub
   * These are harmless in production (a player never sees them) and they make
   * the build smoke-testable and screenshot-able in CI.
   */
  function applyDevParams() {
    var q = String(root.location.search || '');
    if (!/[?&](autostart|daily|ad)=/.test(q)) return;
    root.setTimeout(function () {
      if (/[?&]daily=/.test(q)) startLevel(1, 'daily', null);
      else if (/[?&]autostart=/.test(q)) startLevel(progress.level, 'level', null);
      if (/[?&]ad=demo/.test(q)) ads.showRewarded();
      var m = q.match(/[?&]solve=(\d+)/);
      if (m) autoSolve(parseInt(m[1], 10));
    }, 30);
  }

  /** Dev-only: populates the board so demos and screenshots show real state. */
  function autoSolve(n) {
    var S = WB.game.state();
    if (!S) return;
    for (var i = 0; i < S.puzzle.words.length && n > 0; i++) {
      var word = S.puzzle.words[i];
      if (S.found[word]) continue;
      var used = {}, sel = [], ok = true;
      for (var k = 0; k < word.length; k++) {
        var hit = -1;
        for (var j = 0; j < S.letters.length; j++) {
          if (!used[j] && S.letters[j] === word[k]) { hit = j; break; }
        }
        if (hit === -1) { ok = false; break; }
        used[hit] = 1; sel.push(hit);
      }
      if (!ok) continue;
      S.selection = sel;
      WB.game.submit();
      n--;
    }
  }

  var sessionStartedAt = Date.now();

  function initBridge(adapter) {
    var bridge = root.bridge;
    if (!bridge || typeof bridge.initialize !== 'function') {
      noteAdapter(adapter);
      return;
    }
    // Playgama guarantees safe defaults off-platform, so this is safe to call
    // unconditionally. Re-init ads afterwards to pick up the live adapter.
    Promise.resolve(bridge.initialize()).then(function () {
      var live = ads.init({
        onAdStart: function () {
          audioWasOn = audio.isEnabled();
          audio.setEnabled(false);
          document.body.classList.add('is-ad');
        },
        onAdEnd: function () {
          audio.setEnabled(audioWasOn);
          document.body.classList.remove('is-ad');
        }
      });
      telemetry.track('bridge_ready', { adapter: live });
      noteAdapter(live);
    }, function () {
      telemetry.track('bridge_failed', {});
      noteAdapter(ads.adapterName());
    });
  }

  function noteAdapter(name) {
    if (!dom.adapterNote) return;
    // Internal diagnostic — not something a public visitor should ever read.
    // In production the live adapter is still visible in Pilot stats and is
    // logged to telemetry as `ads_init`.
    if (!DEV) { dom.adapterNote.style.display = 'none'; return; }
    dom.adapterNote.textContent = name === 'stub'
      ? 'Local build — ads are simulated'
      : 'Ad adapter: ' + name;
  }

  function markToday() {
    var today = storage.todayKey();
    if (!Array.isArray(progress.daysPlayed)) progress.daysPlayed = [];
    if (progress.daysPlayed.indexOf(today) === -1) progress.daysPlayed.push(today);
    progress.lastOpenDay = today;
    save();
  }

  function save() { storage.save(progress); }

  function persistLevel() {
    var snap = WB.game.snapshot();
    if (!snap || snap.complete) return;
    progress.currentLevel = {
      level: snap.level,
      mode: snap.mode,
      found: snap.found,
      bonus: snap.bonus,
      hintsUsed: snap.hintsUsed
    };
  }

  /* --------------------------------------------------------------- DOM glue */

  function cacheDom() {
    dom.app = document.getElementById('app');
    dom.home = document.getElementById('screen-home');
    dom.game = document.getElementById('screen-game');
    dom.gameMount = document.getElementById('game-mount');
    dom.overlay = document.getElementById('overlay');
    dom.toast = document.getElementById('toast');
    dom.adapterNote = document.getElementById('adapter-note');
    dom.statLevel = document.getElementById('stat-level');
    dom.statCoins = document.getElementById('stat-coins');
    dom.statStreak = document.getElementById('stat-streak');
    dom.statSession = document.getElementById('stat-session');
    dom.btnPlay = document.getElementById('btn-play');
    dom.btnDaily = document.getElementById('btn-daily');
    dom.btnStats = document.getElementById('btn-stats');
    dom.btnSound = document.getElementById('btn-sound');
    dom.playLabel = document.getElementById('play-label');
    dom.dailyNote = document.getElementById('daily-note');
  }

  function buildHome() {
    dom.btnPlay.addEventListener('click', function () {
      audio.unlock();
      var resume = progress.currentLevel;
      if (resume && resume.mode === 'level') startLevel(resume.level, 'level', resume);
      else startLevel(progress.level, 'level', null);
    });

    dom.btnDaily.addEventListener('click', function () {
      audio.unlock();
      var today = storage.todayKey();
      if (progress.lastDailyKey === today) { toast('Daily challenge already done today'); return; }
      startLevel(1, 'daily', null);
    });

    dom.btnStats.addEventListener('click', function () { showStats(); });
    dom.btnSound.addEventListener('click', function () {
      var on = !audio.isEnabled();
      audio.setEnabled(on);
      dom.btnSound.textContent = on ? 'Sound on' : 'Sound off';
      telemetry.track('sound_toggle', { on: on });
    });
  }

  function renderHome() {
    screen = 'home';
    dom.home.classList.remove('is-hidden');
    dom.game.classList.add('is-hidden');
    updateHomeStats();

    var resume = progress.currentLevel;
    dom.playLabel.textContent = resume && resume.mode === 'level'
      ? 'Continue Level ' + resume.level
      : 'Play Level ' + progress.level;

    var today = storage.todayKey();
    var doneToday = progress.lastDailyKey === today;
    dom.btnDaily.disabled = doneToday;
    dom.dailyNote.textContent = doneToday
      ? 'Completed today — streak ' + progress.streak
      : (progress.streak ? 'Streak: ' + progress.streak + ' days' : 'Play to start a streak');
  }

  function updateHomeStats() {
    if (!dom.statLevel) return;
    dom.statLevel.textContent = String(progress.level);
    dom.statCoins.textContent = String(progress.coins);
    dom.statStreak.textContent = String(progress.streak || 0);
    var secs = Math.round((Date.now() - sessionStartedAt) / 1000);
    dom.statSession.textContent = Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  }
  setInterval(updateHomeStats, 1000);

  function startLevel(level, mode, restore) {
    dom.home.classList.add('is-hidden');
    dom.game.classList.remove('is-hidden');
    screen = 'game';
    WB.game.startLevel(level, mode, progress, {
      levels: levels,
      restore: restore || null
    });
  }

  /* ------------------------------------------------------------ ad flows */

  function offerRewardedHint() {
    progress.adsRequested = (progress.adsRequested || 0) + 1;
    save();
    toast('Watch an ad to reveal a letter');
    return ads.showRewarded();
  }

  function onLevelComplete(result) {
    // Bank progress before any ad can interrupt.
    if (result.mode === 'level') {
      progress.level = Math.max(progress.level, result.level + 1);
      progress.levelsCleared = (progress.levelsCleared || 0) + 1;
      progress.currentLevel = null;
    } else {
      var today = storage.todayKey();
      if (progress.lastDailyKey !== today) {
        // Streak continues if the previous daily was yesterday.
        var y = new Date();
        y.setDate(y.getDate() - 1);
        progress.streak = (progress.lastDailyKey === storage.todayKey(y))
          ? (progress.streak || 0) + 1
          : 1;
        progress.lastDailyKey = today;
        progress.coins += 100;
      }
    }
    save();

    showComplete(result);
  }

  function showComplete(result) {
    var stars = result.hintsUsed === 0 ? 3 : (result.hintsUsed <= 2 ? 2 : 1);
    var starHtml = '';
    for (var i = 0; i < 3; i++) starHtml += '<span class="star' + (i < stars ? ' star--on' : '') + '">&#9733;</span>';

    var rows = [
      ['Words found', result.wordsFound],
      ['Bonus words', result.bonusFound],
      ['Hints used', result.hintsUsed],
      ['Time', result.seconds + 's'],
      ['Coins earned', result.coinsEarned + (result.mode === 'daily' ? ' + 100 daily' : '')]
    ];
    var html = '';
    for (var r = 0; r < rows.length; r++) {
      html += '<div class="row"><span>' + rows[r][0] + '</span><b>' + rows[r][1] + '</b></div>';
    }

    openOverlay(
      '<div class="sheet">' +
        '<div class="stars">' + starHtml + '</div>' +
        '<h2>' + (result.mode === 'daily' ? 'Daily complete!' : 'Level ' + result.level + ' complete') + '</h2>' +
        '<div class="rows">' + html + '</div>' +
        '<button class="btn btn--primary btn--wide" data-next type="button">' +
          (result.mode === 'daily' ? 'Back to menu' : 'Next level') +
        '</button>' +
      '</div>',
      function (overlay) {
        overlay.querySelector('[data-next]').addEventListener('click', function () {
          closeOverlay();
          if (result.mode === 'daily') { renderHome(); return; }
          maybeMidgameAd(result.level);
        });
      }
    );
  }

  function maybeMidgameAd(completedLevel) {
    var shouldShow = completedLevel % MIDGAME_EVERY_N_LEVELS === 0;
    if (!shouldShow) { startLevel(progress.level, 'level', null); return; }

    ads.showMidgame().then(function () {
      startLevel(progress.level, 'level', null);
    });
  }

  /* ------------------------------------------------------------- overlays */

  function openOverlay(html, after) {
    dom.overlay.innerHTML = html;
    dom.overlay.classList.remove('is-hidden');
    if (after) after(dom.overlay);
  }

  function closeOverlay() {
    dom.overlay.classList.add('is-hidden');
    dom.overlay.innerHTML = '';
  }

  function toast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { dom.toast.classList.remove('is-on'); }, 2200);
  }

  function showStats() {
    var k = telemetry.kpis(progress);
    var rows = [
      ['Sessions', k.sessions],
      ['Avg session', k.avgSessionMinutes + ' min'],
      ['Total play', Math.round(k.totalPlaySeconds / 60) + ' min'],
      ['Days played', k.daysPlayed],
      ['Returned next day', k.returnedDay1 ? 'yes' : 'no'],
      ['Returned within 7 days', k.returnedWithin7 ? 'yes' : 'no'],
      ['Levels cleared', k.levelsCleared],
      ['Levels / session', k.levelsPerSession],
      ['Words found', k.wordsFound],
      ['Bonus words', k.bonusFound],
      ['Hints used', k.hintsUsed],
      ['Impressions / session', k.impressionsPerSession],
      ['Ad requests / session', k.adRequestsPerSession],
      ['Ad completion rate', (k.adCompletionRate * 100).toFixed(0) + '%'],
      ['Ad adapter', ads.adapterName()]
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="row"><span>' + rows[i][0] + '</span><b>' + rows[i][1] + '</b></div>';
    }

    openOverlay(
      '<div class="sheet sheet--tall">' +
        '<h2>Pilot stats</h2>' +
        '<p class="muted">Local counters for this device. These are the numbers the pilot is judged on.</p>' +
        '<div class="rows">' + html + '</div>' +
        '<button class="btn btn--primary btn--wide" data-export type="button">Export telemetry JSON</button>' +
        '<button class="btn btn--ghost btn--wide" data-reset type="button">Reset progress</button>' +
        '<button class="btn btn--ghost btn--wide" data-close type="button">Close</button>' +
      '</div>',
      function (overlay) {
        overlay.querySelector('[data-export]').addEventListener('click', function () {
          telemetry.exportJSON(progress);
          toast('Telemetry exported');
        });
        overlay.querySelector('[data-reset]').addEventListener('click', function () {
          storage.reset();
          telemetry.clear();
          toast('Progress reset — reloading');
          setTimeout(function () { root.location.reload(); }, 600);
        });
        overlay.querySelector('[data-close]').addEventListener('click', function () {
          closeOverlay();
          renderHome();
        });
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
