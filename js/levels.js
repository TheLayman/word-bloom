/*!
 * Word Bloom — level generation
 * ---------------------------------------------------------------------------
 * Puzzles are DERIVED, not hand-authored. For each candidate "seed" word we
 * take its letter multiset as the wheel, then find every curated word that can
 * be spelled from those letters. The puzzle is: can you find all of them?
 *
 * This is exactly how the commercial word games scale content, and it means
 * adding words to words.js automatically adds levels here.
 *
 * Difficulty ramps on (wheel size, word count) so early levels are gentle.
 */
(function (root) {
  'use strict';

  var W = root.WordBloom.words;

  var MIN_WORD_LEN = 3;
  var MAX_WORD_LEN = 7;
  var MIN_POOL_SIZE = 4;
  var MIN_SOLUTIONS = 5;   // a pool needs at least this many findable words
  var MAX_GRID_WORDS = 7;  // slots shown per level

  /**
   * Build the full puzzle catalog once, at load time.
   * ~1300 curated words x ~300 seeds is a sub-100ms brute force, fine at boot.
   */
  function generateCatalog() {
    var all = W.all;
    var seeds = [];
    for (var i = 0; i < all.length; i++) {
      var len = all[i].length;
      if (len >= 5 && len <= MAX_WORD_LEN) seeds.push(all[i]);
    }

    var byPool = Object.create(null);
    var puzzles = [];

    for (var s = 0; s < seeds.length; s++) {
      var seed = seeds[s];
      var pool = W.letterCounts(seed);
      var unique = Object.keys(pool).sort();
      if (unique.length < MIN_POOL_SIZE) continue;

      var key = unique.join('');
      if (byPool[key]) continue;                 // one puzzle per letter-multiset

      var solutions = [];
      for (var w = 0; w < all.length; w++) {
        if (W.fitsPool(all[w], pool)) solutions.push(all[w]);
      }
      if (solutions.length < MIN_SOLUTIONS) continue;

      byPool[key] = true;

      // Grid words: longest first (long words feel like the "real" answers).
      solutions.sort(function (a, b) {
        return (b.length - a.length) || a.localeCompare(b);
      });

      var gridCount = Math.min(MAX_GRID_WORDS, Math.max(4, solutions.length - 2));
      var grid = solutions.slice(0, gridCount);
      if (grid.indexOf(seed) === -1) grid[grid.length - 1] = seed;
      // Re-sort so the slot list reads long-to-short on screen.
      grid.sort(function (a, b) {
        return (b.length - a.length) || a.localeCompare(b);
      });

      puzzles.push({
        id: key,
        // The wheel is the FULL multiset, duplicates included — "CATCH" must
        // offer two C tiles, not one. Alphabetical here; the UI shuffles it
        // deterministically per level so letter order never hints the answer.
        letters: expandLetters(pool),
        tileCount: seed.length,
        pool: pool,                        // letter -> count, for validation
        words: grid,                       // slots the player must fill
        bonus: solutions.slice(gridCount)  // valid extras, rewarded but not required
      });
    }

    puzzles.sort(function (a, b) {
      return (a.tileCount - b.tileCount) ||
             (a.words.length - b.words.length) ||
             a.id.localeCompare(b.id);
    });

    return puzzles;
  }

  /** Expand a letter->count map into a sorted array of individual tiles. */
  function expandLetters(pool) {
    var out = [];
    var letters = Object.keys(pool).sort();
    for (var i = 0; i < letters.length; i++) {
      for (var n = 0; n < pool[letters[i]]; n++) out.push(letters[i]);
    }
    return out;
  }

  /**
   * Stable string hash — used to pick the daily puzzle deterministically
   * so every player in every timezone-agnostic build sees the same board.
   */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function ymd(date) {
    var d = date || new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function create(catalog) {
    var list = catalog || generateCatalog();

    return {
      catalog: list,
      total: list.length,

      /** 1-based level number -> puzzle. Wraps once content is exhausted. */
      forLevel: function (level) {
        if (!list.length) return null;
        var idx = (Math.max(1, level) - 1) % list.length;
        return list[idx];
      },

      /** True when the requested level reuses an earlier puzzle. */
      isRemix: function (level) {
        return list.length > 0 && (level - 1) >= list.length;
      },

      /** Deterministic puzzle-of-the-day. */
      forDate: function (date) {
        if (!list.length) return null;
        var key = ymd(date);
        return list[hash(key) % list.length];
      },

      todayKey: ymd
    };
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.levels = {
    generateCatalog: generateCatalog,
    create: create,
    hash: hash,
    ymd: ymd
  };
})(typeof window !== 'undefined' ? window : globalThis);
