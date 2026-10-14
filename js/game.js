/*!
 * Word Bloom — game engine
 * ---------------------------------------------------------------------------
 * Core loop: a ring of letter tiles -> build a word by dragging or tapping ->
 * valid words fill slots in the puzzle -> clearing every slot completes the
 * level and advances.
 *
 * Design decisions that matter for an ad-funded build:
 *   - Selection is by TILE INDEX, never by letter. Duplicate letters (the "T"
 *     in TOMATO appearing twice) are handled correctly and a tile cannot be
 *     reused within one word.
 *   - Hints cost coins; coins run out quickly on purpose, which is the exact
 *     moment the rewarded-ad offer appears. That's the monetisation hook we
 *     need to measure.
 *   - Progress is saved mid-level, because portal sessions are short and get
 *     interrupted by ads, tab switches and reloads.
 */
(function (root) {
  'use strict';

  var WB = root.WordBloom = root.WordBloom || {};
  var W = WB.words;
  var MIN_WORD = 3;
  var HINT_COST = 25;
  var START_COINS = 60;

  var el = {};          // cached DOM
  var cb = {};          // callbacks into the app shell
  var S = null;         // live game state

  /* ---------------------------------------------------------------- utils */

  /** Deterministic PRNG so a level's letter arrangement is stable on reload. */
  var seededRandom = WB.seededRandom;

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function poolFromLetters(letters) {
    var p = {};
    for (var i = 0; i < letters.length; i++) p[letters[i]] = (p[letters[i]] || 0) + 1;
    return p;
  }

  /**
   * The signature moment: when a word is found, petals burst from the slot and
   * it settles into place. This is the animation that makes the name true and
   * makes the game feel authored rather than generated — "feels like a
   * prototype" is an explicit portal rejection reason.
   */
  function bloomBurst(anchor, seed, intensity) {
    if (!anchor || !WB.garden) return;
    var rect = anchor.getBoundingClientRect();
    var b = WB.garden.bloomFor(seed);
    var count = Math.max(8, Math.min(18, (intensity || 8)));

    var wrap = document.createElement('div');
    wrap.className = 'bloom-burst';
    wrap.style.left = (rect.left + rect.width / 2) + 'px';
    wrap.style.top = (rect.top + rect.height / 2) + 'px';
    wrap.style.setProperty('--p', b.p);
    wrap.style.setProperty('--c', b.c);

    for (var i = 0; i < count; i++) {
      var petal = document.createElement('i');
      var angle = (360 / count) * i + (i % 3) * 9;
      // Rotation goes through a custom property so the keyframe owns the
      // transform (animations override inline styles).
      petal.style.setProperty('--rot', angle + 'deg');
      petal.style.animationDelay = (i * 11) + 'ms';
      petal.style.setProperty('--dist', (26 + ((i * 37) % 26)) + 'px');
      wrap.appendChild(petal);
    }
    var core = document.createElement('b');
    wrap.appendChild(core);

    document.body.appendChild(wrap);
    setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }, 1000);
  }

  function hideIntro() {
    if (el.intro && !el.intro.classList.contains('is-hidden')) {
      el.intro.classList.add('is-hidden');
      report('intro_dismissed', {});
    }
  }

  function showIntro() {
    if (el.intro) el.intro.classList.remove('is-hidden');
  }

  /* ------------------------------------------------------------- lifecycle */

  function init(opts) {
    el.mount = opts.mount;
    cb = opts.callbacks || {};
    buildDom();
    bindInput();
  }

  function buildDom() {
    el.mount.innerHTML = [
      '<div class="game">',
        '<header class="hud">',
          '<div class="hud__left">',
            '<div class="hud__level" data-level>Level 1</div>',
            '<div class="hud__mode" data-mode></div>',
          '</div>',
          '<div class="hud__right">',
            '<div class="hud__coins" data-coins><span class="coin"></span><span data-coins-n>0</span></div>',
          '</div>',
        '</header>',
        '<div class="bar"><div class="bar__fill" data-bar></div></div>',
        '<div class="slots" data-slots></div>',
        '<div class="bonus" data-bonus></div>',
        '<div class="wordbar" data-wordbar><span class="wordbar__text" data-word></span></div>',
        '<div class="wheel" data-wheel>',
          '<svg class="wheel__trail" data-trail viewBox="0 0 100 100" preserveAspectRatio="none"></svg>',
          '<div class="intro is-hidden" data-intro>',
            '<div class="intro__pulse"></div>',
            '<div class="intro__text">Swipe or tap the letters</div>',
          '</div>',
        '</div>',
        '<div class="controls">',
          '<button class="btn btn--ghost" data-shuffle type="button">Shuffle</button>',
          '<button class="btn btn--ghost" data-undo type="button">Undo</button>',
          '<button class="btn btn--ghost" data-submit type="button">Submit</button>',
          '<button class="btn btn--hint" data-hint type="button">',
            '<span class="btn__icon">&#128161;</span> Hint <span class="btn__cost" data-hint-cost>25</span>',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    var m = el.mount;
    el.level = m.querySelector('[data-level]');
    el.mode = m.querySelector('[data-mode]');
    el.coins = m.querySelector('[data-coins-n]');
    el.bar = m.querySelector('[data-bar]');
    el.slots = m.querySelector('[data-slots]');
    el.bonus = m.querySelector('[data-bonus]');
    el.word = m.querySelector('[data-word]');
    el.wordbar = m.querySelector('[data-wordbar]');
    el.wheel = m.querySelector('[data-wheel]');
    el.trail = m.querySelector('[data-trail]');
    el.intro = m.querySelector('[data-intro]');
    el.shuffle = m.querySelector('[data-shuffle]');
    el.undo = m.querySelector('[data-undo]');
    el.submit = m.querySelector('[data-submit]');
    el.hint = m.querySelector('[data-hint]');
    el.hintCost = m.querySelector('[data-hint-cost]');

    el.hintCost.textContent = String(HINT_COST);
    el.shuffle.addEventListener('click', function () { manualShuffle(); });
    el.undo.addEventListener('click', function () { undo(); });
    el.submit.addEventListener('click', function () { submit(); });
    el.hint.addEventListener('click', function () { requestHint(); });
  }

  /**
   * @param {number} level      1-based level number
   * @param {string} mode       'level' | 'daily'
   * @param {object} progress   persisted player progress
   * @param {object} deps       { levels, restore }
   */
  function startLevel(level, mode, progress, deps) {
    var puzzle = mode === 'daily'
      ? deps.levels.forDate(new Date())
      : deps.levels.forLevel(level);

    if (!puzzle) return null;

    var rnd = seededRandom(puzzle.id + ':' + level + ':' + mode);
    var letters = shuffle(puzzle.letters, rnd);

    var restore = deps.restore || null;

    S = {
      mode: mode,
      level: level,
      puzzle: puzzle,
      pool: poolFromLetters(letters),
      letters: letters,
      rnd: rnd,
      found: {},
      bonusFound: {},
      revealed: {},        // word -> number of letters revealed by hints
      selection: [],       // tile indices, in selection order
      startedAt: Date.now(),
      hintsUsed: 0,
      busy: false,
      finished: false
    };

    if (restore && Array.isArray(restore.found)) {
      for (var i = 0; i < restore.found.length; i++) {
        var w = restore.found[i];
        if (puzzle.words.indexOf(w) !== -1) S.found[w] = true;
        else if (puzzle.bonus.indexOf(w) !== -1) S.bonusFound[w] = true;
      }
      if (typeof restore.hintsUsed === 'number') S.hintsUsed = restore.hintsUsed;
    }

    if (cb.onProgress) cb.onProgress(progress);
    renderAll();
    // First-ever level: point at the letters instead of assuming the player
    // guesses the swipe gesture. Onboarding is where portal retention is won
    // or lost, and it costs nothing to dismiss.
    if (deps.showIntro) showIntro(); else hideIntro();
    report('level_start', {
      level: level,
      mode: mode,
      puzzleId: puzzle.id,
      tiles: puzzle.letters.length,
      slots: puzzle.words.length,
      restored: !!(restore && restore.found && restore.found.length)
    });

    // Already complete (e.g. reloaded right after finishing) -> don't re-fire.
    if (isComplete()) S.finished = true;

    return puzzle;
  }

  function report(name, data) {
    if (WB.telemetry) WB.telemetry.track(name, data);
  }

  /* -------------------------------------------------------------- rendering */

  function renderAll() {
    if (!S) return;
    renderHud();
    renderSlots();
    renderBonus();
    renderWheel();
    renderSelection();
  }

  function renderHud() {
    el.level.textContent = S.mode === 'daily' ? 'Daily Challenge' : 'Level ' + S.level;
    el.mode.textContent = S.mode === 'daily'
      ? 'Puzzle of the day'
      : (S.puzzle.words.length + ' words to find');
    var total = S.puzzle.words.length;
    var done = foundCount();
    el.bar.style.width = (total ? (done / total) * 100 : 0) + '%';
    // Coins live in persisted progress (owned by the shell), so read them back.
    el.coins.textContent = String(cb.getCoins ? cb.getCoins() : 0);
    el.hint.classList.toggle('btn--poor', !(cb.getCoins && cb.getCoins() >= HINT_COST));
  }

  function foundCount() {
    var n = 0;
    for (var i = 0; i < S.puzzle.words.length; i++) {
      if (S.found[S.puzzle.words[i]]) n++;
    }
    return n;
  }

  function renderSlots() {
    var html = '';
    for (var i = 0; i < S.puzzle.words.length; i++) {
      var word = S.puzzle.words[i];
      var isFound = !!S.found[word];
      var reveal = S.revealed[word] || 0;
      html += '<div class="slot' + (isFound ? ' slot--found' : '') + '">';
      for (var j = 0; j < word.length; j++) {
        var show = isFound || j < reveal;
        html += '<span class="cell' + (show ? ' cell--on' : '') + '">' +
                  (show ? word[j] : '') +
                '</span>';
      }
      html += '</div>';
    }
    el.slots.innerHTML = html;
  }

  function renderBonus() {
    var words = Object.keys(S.bonusFound);
    if (!words.length) { el.bonus.innerHTML = ''; return; }
    var html = '<span class="bonus__label">Bonus</span>';
    for (var i = 0; i < words.length; i++) {
      html += '<span class="bonus__word">' + words[i] + '</span>';
    }
    el.bonus.innerHTML = html;
  }

  function renderWheel() {
    var n = S.letters.length;
    var R = 33;   // percent radius
    var frag = document.createDocumentFragment();
    // Remove old tiles but keep the SVG trail.
    var old = el.wheel.querySelectorAll('.tile');
    for (var k = 0; k < old.length; k++) old[k].parentNode.removeChild(old[k]);

    for (var i = 0; i < n; i++) {
      var angle = (-90 + (360 / n) * i) * Math.PI / 180;
      var x = 50 + R * Math.cos(angle);
      var y = 50 + R * Math.sin(angle);
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.textContent = S.letters[i];
      t.style.left = x + '%';
      t.style.top = y + '%';
      t.setAttribute('data-idx', String(i));
      // Cache geometry for hit-testing and for the connector trail.
      t.__cx = x;
      t.__cy = y;
      frag.appendChild(t);
    }
    el.wheel.appendChild(frag);
  }

  function renderSelection() {
    var tiles = el.wheel.querySelectorAll('.tile');
    var selSet = {};
    for (var i = 0; i < S.selection.length; i++) selSet[S.selection[i]] = i + 1;
    for (var k = 0; k < tiles.length; k++) {
      var idx = Number(tiles[k].getAttribute('data-idx'));
      var order = selSet[idx];
      tiles[k].classList.toggle('tile--sel', !!order);
      tiles[k].setAttribute('data-order', order ? String(order) : '');
    }

    var word = currentWord();
    el.word.textContent = word;
    el.wordbar.classList.toggle('wordbar--active', word.length > 0);

    // Connector trail through the selected tile centres.
    var pts = [];
    for (var s = 0; s < S.selection.length; s++) {
      var tile = el.wheel.querySelector('.tile[data-idx="' + S.selection[s] + '"]');
      if (tile) pts.push(tile.__cx + ',' + tile.__cy);
    }
    el.trail.innerHTML = pts.length > 1
      ? '<polyline points="' + pts.join(' ') + '" />'
      : '';

    el.submit.classList.toggle('btn--ready', word.length >= MIN_WORD);
    el.undo.disabled = S.selection.length === 0;
  }

  function currentWord() {
    var out = '';
    for (var i = 0; i < S.selection.length; i++) out += S.letters[S.selection[i]];
    return out;
  }

  /* ------------------------------------------------------------------ input */

  function bindInput() {
    var dragging = false;

    function tileFromPoint(clientX, clientY) {
      var node = document.elementFromPoint(clientX, clientY);
      if (!node) return null;
      var t = node.closest ? node.closest('.tile') : null;
      return (t && el.wheel.contains(t)) ? t : null;
    }

    function addTile(tile) {
      var idx = Number(tile.getAttribute('data-idx'));
      if (S.selection.indexOf(idx) !== -1) return;   // no tile reuse
      S.selection.push(idx);
      if (WB.audio) WB.audio.tap();
      renderSelection();
    }

    el.wheel.addEventListener('pointerdown', function (ev) {
      if (!S || S.busy || S.finished) return;
      ev.preventDefault();
      hideIntro();
      dragging = true;
      S.selection = [];
      if (WB.audio) WB.audio.unlock();
      var t = tileFromPoint(ev.clientX, ev.clientY);
      if (t) addTile(t);
      renderSelection();
    });

    root.addEventListener('pointermove', function (ev) {
      if (!dragging || !S || S.busy) return;
      var t = tileFromPoint(ev.clientX, ev.clientY);
      if (t) addTile(t);
    });

    root.addEventListener('pointerup', function () {
      if (!dragging || !S) return;
      dragging = false;
      // A drag of a full word submits immediately; short taps accumulate so
      // players can build a word letter by letter and press Submit.
      if (currentWord().length >= MIN_WORD) submit();
      else renderSelection();
    });

    root.addEventListener('pointercancel', function () {
      dragging = false;
      if (S && !S.busy) renderSelection();
    });

    document.addEventListener('keydown', function (ev) {
      if (!S || S.busy || S.finished) return;
      if (ev.key === 'Enter') { submit(); return; }
      if (ev.key === 'Backspace') { ev.preventDefault(); undo(); return; }
      if (ev.key === 'Escape') { S.selection = []; renderSelection(); return; }
      if (/^[a-zA-Z]$/.test(ev.key)) {
        var letter = ev.key.toUpperCase();
        for (var i = 0; i < S.letters.length; i++) {
          if (S.letters[i] === letter && S.selection.indexOf(i) === -1) {
            S.selection.push(i);
            renderSelection();
            return;
          }
        }
      }
    });
  }

  function undo() {
    if (!S || S.busy) return;
    S.selection.pop();
    renderSelection();
  }

  function manualShuffle() {
    if (!S || S.busy || S.finished) return;
    S.selection = [];
    S.letters = shuffle(S.letters, Math.random);
    renderWheel();
    renderSelection();
    report('shuffle', { level: S.level, mode: S.mode });
  }

  /* ----------------------------------------------------------------- submit */

  function clearSelection() {
    S.selection = [];
    renderSelection();
  }

  function submit() {
    if (!S || S.busy || S.finished) return;
    hideIntro();
    var word = currentWord();
    if (word.length < MIN_WORD) { clearSelection(); return; }

    // Because selection is tile-based, the word is always spellable; the only
    // question is whether it is a real word.
    if (!W.has(word)) { rejectWord(word, 'not_a_word'); return; }

    if (S.found[word] || S.bonusFound[word]) { rejectWord(word, 'already_found'); return; }

    var idx = S.puzzle.words.indexOf(word);
    if (idx !== -1) {
      S.found[word] = true;
      var gain = 10 * word.length;
      addCoins(gain);
      if (WB.audio) WB.audio.found(word.length);
      clearSelection();
      renderSlots();
      renderHud();
      // Bloom out of the slot that just filled — the reward moment.
      var slotEl = el.slots.children[idx];
      if (slotEl) {
        slotEl.classList.add('slot--bloom');
        bloomBurst(slotEl, S.level + ':' + word, word.length * 2);
      }
      report('word_found', { word: word, level: S.level, mode: S.mode, letters: word.length, elapsedMs: Date.now() - S.startedAt });
      if (cb.onWordFound) cb.onWordFound(word, false);
      checkComplete();
      return;
    }

    if (S.puzzle.bonus.indexOf(word) !== -1) {
      S.bonusFound[word] = true;
      addCoins(15);
      if (WB.audio) WB.audio.bonus();
      bloomBurst(el.wordbar, 7, 7);
      clearSelection();
      renderBonus();
      report('bonus_found', { word: word, level: S.level, mode: S.mode });
      if (cb.onWordFound) cb.onWordFound(word, true);
      return;
    }

    // Spellable from the tiles and a real word, but not part of this puzzle.
    rejectWord(word, 'not_in_puzzle');
  }

  function rejectWord(word, reason) {
    if (WB.audio) WB.audio.invalid();
    el.wordbar.classList.add('wordbar--bad');
    setTimeout(function () { el.wordbar.classList.remove('wordbar--bad'); }, 380);
    report('word_rejected', { word: word, reason: reason, level: S.level });
    var sel = S.selection.slice();
    clearSelection();
    // Keep the tiles highlighted briefly so the player sees what was rejected.
    void sel;
  }

  function addCoins(n) {
    S.coinsDelta = (S.coinsDelta || 0) + n;
    if (cb.onCoins) cb.onCoins(n);
    renderHud();
  }

  function isComplete() {
    return foundCount() === S.puzzle.words.length;
  }

  function checkComplete() {
    if (!isComplete()) return;
    S.finished = true;
    var elapsed = Math.round((Date.now() - S.startedAt) / 1000);

    var wordCoins = 0;
    for (var i = 0; i < S.puzzle.words.length; i++) {
      wordCoins += 10 * S.puzzle.words[i].length;
    }
    var bonusCoins = Object.keys(S.bonusFound).length * 15;
    var completion = 50;
    var noHintBonus = S.hintsUsed === 0 ? 25 : 0;
    var total = completion + noHintBonus;

    addCoins(total);
    if (WB.audio) WB.audio.complete();

    var result = {
      level: S.level,
      mode: S.mode,
      puzzleId: S.puzzle.id,
      seconds: elapsed,
      hintsUsed: S.hintsUsed,
      wordsFound: S.puzzle.words.length,
      bonusFound: Object.keys(S.bonusFound).length,
      coinsEarned: wordCoins + bonusCoins + total,
      perfect: S.hintsUsed === 0
    };

    report('level_complete', result);
    if (cb.onLevelComplete) cb.onLevelComplete(result);
  }

  /* ------------------------------------------------------------------ hints */

  function affordableHint() {
    return S && cb.getCoins && cb.getCoins() >= HINT_COST;
  }

  function requestHint() {
    if (!S || S.busy || S.finished) return;
    if (isComplete()) return;

    if (affordableHint()) {
      if (cb.spendCoins) cb.spendCoins(HINT_COST);
      applyHint('coins');
      return;
    }

    // Out of coins: this is the monetisation moment. Offer a rewarded ad.
    S.busy = true;
    report('hint_ad_offer', { level: S.level, mode: S.mode, coins: cb.getCoins ? cb.getCoins() : 0 });
    Promise.resolve(cb.onHintAdNeeded ? cb.onHintAdNeeded() : false)
      .then(function (granted) {
        S.busy = false;
        if (granted) applyHint('ad');
        else if (cb.onToast) cb.onToast('No reward earned');
      }, function () { S.busy = false; });
  }

  /** Reveal one more letter of the word closest to completion. */
  function applyHint(via) {
    var best = null, bestReveal = -1;
    for (var i = 0; i < S.puzzle.words.length; i++) {
      var w = S.puzzle.words[i];
      if (S.found[w]) continue;
      var r = S.revealed[w] || 0;
      if (r > bestReveal) { bestReveal = r; best = w; }
    }
    if (!best) return false;

    S.revealed[best] = (S.revealed[best] || 0) + 1;
    S.hintsUsed++;
    if (WB.audio) WB.audio.hint();
    renderSlots();
    report('hint_used', { word: best, via: via, level: S.level, mode: S.mode, hintsUsed: S.hintsUsed });
    if (cb.onHintUsed) cb.onHintUsed(via, best);
    return true;
  }

  /** Called by the shell when the rewarded ad completes. */
  function grantHintFromAd() {
    if (!S || S.finished) return false;
    return applyHint('ad');
  }

  WB.game = {
    init: init,
    startLevel: startLevel,
    requestHint: requestHint,
    grantHintFromAd: grantHintFromAd,
    applyHint: applyHint,
    undo: undo,
    submit: submit,
    HINT_COST: HINT_COST,
    START_COINS: START_COINS,
    /** Snapshot for the shell: current level, coins delta, found words. */
    snapshot: function () {
      if (!S) return null;
      return {
        level: S.level,
        mode: S.mode,
        puzzleId: S.puzzle.id,
        found: Object.keys(S.found),
        bonus: Object.keys(S.bonusFound),
        hintsUsed: S.hintsUsed,
        complete: isComplete()
      };
    },
    state: function () { return S; },
    /** Exposed for tests. */
    _internals: {
      shuffle: shuffle,
      seededRandom: seededRandom,
      poolFromLetters: poolFromLetters,
      renderSelection: renderSelection,
      currentWord: currentWord
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
