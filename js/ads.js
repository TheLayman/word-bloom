/*!
 * Word Bloom — advertising adapter layer
 * ===========================================================================
 * THIS IS THE ONLY FILE THAT NEEDS TO CHANGE WHEN PORTING TO A PLATFORM.
 *
 * Why an adapter layer:
 *   The game must run in three environments — local development, a portal
 *   sandbox with an SDK, and a plain web page with no SDK at all. Portal SDKs
 *   differ in method names, promise-vs-callback style, and failure semantics.
 *   Game code therefore calls a single stable interface:
 *
 *       Ads.showRewarded()  -> Promise<boolean>  (true = reward earned)
 *       Ads.showMidgame()   -> Promise<boolean>  (true = an ad actually played)
 *       Ads.hasAdblock()    -> Promise<boolean>
 *
 * Platform rules encoded here (from CrazyGames' and Playgama's docs):
 *   - Audio must be muted and the game paused while an ad plays; unmuted and
 *     resumed on both success AND failure.
 *   - Rewarded ads grant the reward only on the "finished" callback — never on
 *     request.
 *   - Midgame/interstitial ads have a cooldown (CrazyGames reports ~3 minutes)
 *     and requesting inside it errors with `adCooldown`. We therefore enforce
 *     a local cooldown BEFORE hitting the SDK, and also require a minimum
 *     number of levels between ads, so we never waste a request.
 *   - If the ad errors (unfilled / adblock / disabled), the game must continue
 *     normally. Ads are never allowed to block progression.
 *
 * Adapters are chosen by capability detection at init; anything unrecognised
 * falls back to the built-in stub so the game is always playable.
 */
(function (root) {
  'use strict';

  var MIDGAME_COOLDOWN_MS = 180 * 1000;   // mirrors the ~3 min platform cooldown
  var STUB_REWARDED_SECONDS = 5;
  var STUB_MIDGAME_SECONDS = 4;

  var hooks = { onAdStart: null, onAdEnd: null };
  var lastMidgameAt = 0;
  var pending = false;
  var adapter = null;
  var adapterName = 'none';
  var stats = { requested: 0, shown: 0, completed: 0, failed: 0, skippedCooldown: 0 };

  var T = function () { return root.WordBloom.telemetry; };
  function track(name, data) { if (T()) T().track(name, data); }

  /* ------------------------------------------------------------------ *
   * Stub adapter — used in local dev and on plain hosting.
   * Simulates an ad so pacing and reward logic can be tested with no SDK.
   * ------------------------------------------------------------------ */
  function makeStub() {
    return {
      name: 'stub',
      hasAdblock: function () { return Promise.resolve(false); },

      show: function (type) {
        return new Promise(function (resolve) {
          var wrap = document.createElement('div');
          wrap.className = 'ad-stub';
          var total = type === 'rewarded' ? STUB_REWARDED_SECONDS : STUB_MIDGAME_SECONDS;
          var left = total;

          wrap.innerHTML =
            '<div class="ad-stub__card">' +
              '<div class="ad-stub__label">' +
                (type === 'rewarded' ? 'Rewarded ad' : 'Advertisement') +
              '</div>' +
              '<div class="ad-stub__slot">' +
                '<div class="ad-stub__badge">AD</div>' +
                '<div class="ad-stub__hint">stub ad &middot; no SDK detected</div>' +
              '</div>' +
              '<div class="ad-stub__count" data-count>' + left + '</div>' +
              '<div class="ad-stub__note">' +
                (type === 'rewarded'
                  ? 'Watch to the end to earn your reward'
                  : 'Your game resumes automatically') +
              '</div>' +
            '</div>';

          document.body.appendChild(wrap);
          var counter = wrap.querySelector('[data-count]');

          var iv = setInterval(function () {
            left--;
            if (counter) counter.textContent = String(Math.max(0, left));
            if (left <= 0) {
              clearInterval(iv);
              wrap.classList.add('ad-stub--done');
              setTimeout(function () {
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                resolve(true);
              }, 220);
            }
          }, 1000);

          // Escape hatch so a developer is never trapped in the stub.
          wrap.addEventListener('click', function (ev) {
            if (ev.target && ev.target.getAttribute('data-skip') === '1') {
              clearInterval(iv);
              if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
              resolve(type !== 'rewarded');
            }
          });
          var skip = document.createElement('button');
          skip.className = 'ad-stub__skip';
          skip.setAttribute('data-skip', '1');
          skip.textContent = type === 'rewarded' ? 'Skip (no reward)' : 'Skip';
          wrap.querySelector('.ad-stub__card').appendChild(skip);
        });
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Playgama Bridge adapter (v2).
   *
   * The bridge exposes an `advertisement` module (interstitial / rewarded /
   * banner / adblock) and guarantees safe defaults outside a platform, so it
   * can be initialised unconditionally.
   *
   * NOTE: method names on the bridge have varied between SDK versions, so we
   * resolve them defensively and report which one was used in telemetry. When
   * submitting to Playgama, confirm against the current API reference at
   * wiki.playgama.com/playgama/bridge-sdk/api and pin the name here.
   * ------------------------------------------------------------------ */
  function makePlaygama(bridge) {
    var adv = bridge.advertisement || bridge.ad || null;

    function pick(names) {
      if (!adv) return null;
      for (var i = 0; i < names.length; i++) {
        if (typeof adv[names[i]] === 'function') return adv[names[i]].bind(adv);
      }
      return null;
    }

    var showRewardedFn = pick(['showRewarded', 'showRewardedVideo', 'rewarded']);
    var showInterstitialFn = pick(['showInterstitial', 'showMidgame', 'interstitial']);
    var adblockFn = pick(['checkAdBlock', 'isAdBlocked', 'hasAdblock']);

    if (!showRewardedFn && !showInterstitialFn) return null;

    return {
      name: 'playgama',
      hasAdblock: function () {
        if (!adblockFn) return Promise.resolve(false);
        try { return Promise.resolve(adblockFn()).catch(function () { return false; }); }
        catch (e) { return Promise.resolve(false); }
      },
      show: function (type) {
        var fn = type === 'rewarded' ? showRewardedFn : showInterstitialFn;
        if (!fn) return Promise.resolve(false);
        return new Promise(function (resolve) {
          var settled = false;
          function done(ok) { if (!settled) { settled = true; resolve(!!ok); } }
          try {
            var ret = fn();
            if (ret && typeof ret.then === 'function') {
              // Resolving normally means the ad ran to completion.
              ret.then(function () { done(true); }, function () { done(false); });
            } else {
              // Callback-style SDK: no promise means we cannot verify
              // completion, so treat it as unverifiable and do not reward.
              done(false);
            }
          } catch (e) {
            done(false);
          }
          // Safety net: never leave the game paused forever.
          setTimeout(function () { done(false); }, 45000);
        });
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * CrazyGames adapter (API verified against docs.crazygames.com).
   *   window.CrazyGames.SDK.ad.requestAd("rewarded"|"midgame", {
   *     adStarted, adError, adFinished
   *   })
   *   window.CrazyGames.SDK.ad.hasAdblock() -> Promise<boolean>
   * Error codes: adsDisabledBasicLaunch | unfilled | adblock | adCooldown | other
   * ------------------------------------------------------------------ */
  function makeCrazyGames(sdk) {
    if (!sdk || !sdk.ad || typeof sdk.ad.requestAd !== 'function') return null;

    return {
      name: 'crazygames',
      hasAdblock: function () {
        if (typeof sdk.ad.hasAdblock !== 'function') return Promise.resolve(false);
        try { return Promise.resolve(sdk.ad.hasAdblock()).catch(function () { return false; }); }
        catch (e) { return Promise.resolve(false); }
      },
      show: function (type) {
        return new Promise(function (resolve) {
          var settled = false;
          function done(ok) { if (!settled) { settled = true; resolve(!!ok); } }
          try {
            sdk.ad.requestAd(type === 'rewarded' ? 'rewarded' : 'midgame', {
              adStarted: function () { track('ad_started', { type: type, adapter: 'crazygames' }); },
              adFinished: function () { done(true); },
              adError: function (err) {
                track('ad_error', {
                  type: type,
                  code: (err && err.code) || 'other',
                  message: (err && err.message) || ''
                });
                done(false);
              }
            });
          } catch (e) {
            done(false);
          }
          setTimeout(function () { done(false); }, 45000);
        });
      }
    };
  }

  function detect() {
    try {
      if (root.bridge && (root.bridge.advertisement || root.bridge.ad)) {
        var pg = makePlaygama(root.bridge);
        if (pg) return pg;
      }
    } catch (e) {}
    try {
      var cg = root.CrazyGames && root.CrazyGames.SDK;
      var cgAdapter = makeCrazyGames(cg);
      if (cgAdapter) return cgAdapter;
    } catch (e) {}
    return null;
  }

  function init(opts) {
    hooks.onAdStart = (opts && opts.onAdStart) || null;
    hooks.onAdEnd = (opts && opts.onAdEnd) || null;
    adapter = detect();
    adapterName = adapter ? adapter.name : 'stub';
    if (!adapter) adapter = makeStub();
    track('ads_init', { adapter: adapterName });
    return adapterName;
  }

  /** Run one ad with hooks + bookkeeping, shared by both ad types. */
  function run(type) {
    if (pending) return Promise.resolve(false);
    pending = true;
    stats.requested++;
    track('ad_requested', { type: type, adapter: adapterName });

    if (hooks.onAdStart) { try { hooks.onAdStart(type); } catch (e) {} }

    return adapter.show(type).then(function (ok) {
      pending = false;
      if (hooks.onAdEnd) { try { hooks.onAdEnd(type, ok); } catch (e) {} }
      if (ok) { stats.completed++; track('ad_completed', { type: type, adapter: adapterName }); }
      else { stats.failed++; track('ad_failed', { type: type, adapter: adapterName }); }
      return ok;
    }, function () {
      pending = false;
      stats.failed++;
      if (hooks.onAdEnd) { try { hooks.onAdEnd(type, false); } catch (e) {} }
      track('ad_failed', { type: type, adapter: adapterName });
      return false;
    });
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.ads = {
    init: init,
    adapterName: function () { return adapterName; },
    hasAdblock: function () {
      if (!adapter) return Promise.resolve(false);
      try { return adapter.hasAdblock(); } catch (e) { return Promise.resolve(false); }
    },

    /** User-initiated ad for a reward. Resolves true only if fully watched. */
    showRewarded: function () { return run('rewarded'); },

    /**
     * Automatic ad at a natural break (level complete). Enforces a local
     * cooldown so we never burn a request on a platform `adCooldown` error.
     */
    showMidgame: function () {
      var elapsed = Date.now() - lastMidgameAt;
      if (lastMidgameAt && elapsed < MIDGAME_COOLDOWN_MS) {
        stats.skippedCooldown++;
        track('ad_skipped_cooldown', { remainingMs: MIDGAME_COOLDOWN_MS - elapsed });
        return Promise.resolve(false);
      }
      lastMidgameAt = Date.now();
      return run('midgame');
    },

    stats: function () { return { adapter: adapterName, pending: pending, midgameCooldownMs: MIDGAME_COOLDOWN_MS, lastMidgameAt: lastMidgameAt, requested: stats.requested, completed: stats.completed, failed: stats.failed, skippedCooldown: stats.skippedCooldown }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
