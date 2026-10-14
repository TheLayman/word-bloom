/*!
 * Word Bloom — hashing
 * ---------------------------------------------------------------------------
 * One shared 32-bit hash, because two real bugs lived in the three copies of
 * this function that used to exist:
 *
 *   1. `(h * 16777619) >>> 0` SILENTLY LOSES PRECISION. FNV's prime is ~2^24 and
 *      h reaches ~2^32, so the product (~2^56) exceeds JavaScript's 2^53 safe
 *      integer range and the low bits are wrong. Math.imul multiplies correctly
 *      in 32 bits.
 *
 *   2. FNV-1a's LOW BITS barely change for short, similar inputs like "1".."10".
 *      Every consumer used `hash(x) % n`, and for a SMALL modulus (n = 8, the
 *      bloom palette) that reads only the weak low bits: 60 consecutive levels
 *      produced just 4 of 8 flower colours. The murmur3 finalizer avalanches
 *      the high bits down into the low ones — same 60 levels now hit 8 of 8.
 *
 *      For a LARGE modulus the same flaw was harmless (the daily picker read
 *      many bits: 310 distinct puzzles over 365 days vs a 321 birthday-bound
 *      expectation), so it went unnoticed there.
 *
 * Both were invisible until a test asserted distribution rather than just
 * determinism.
 */
(function (root) {
  'use strict';

  function hash32(str) {
    var s = String(str);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // murmur3 finalizer — avalanche high bits into low bits.
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** Deterministic PRNG so a level's letter arrangement is stable on reload. */
  function seededRandom(seed) {
    var h = hash32(seed) || 1;
    return function () {
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17;
      h ^= h << 5; h >>>= 0;
      return h / 4294967296;
    };
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.hash32 = hash32;
  root.WordBloom.seededRandom = seededRandom;
})(typeof window !== 'undefined' ? window : globalThis);
