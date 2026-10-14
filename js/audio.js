/*!
 * Word Bloom — audio
 * ---------------------------------------------------------------------------
 * Synthesised with the WebAudio API rather than shipped as files: zero asset
 * weight and zero loading time, which matters because portal guidelines call
 * out fast time-to-first-frame, and CrazyGames flags slow loading as a top
 * retention killer.
 *
 * Browsers block audio until a user gesture, so context creation is deferred
 * and resumed on first interaction.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }

  /** One shaped tone. Kept short and quiet — puzzle games reward subtlety. */
  function tone(freq, startOffset, duration, type, peak) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (startOffset || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak || 0.5, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  var api = {
    unlock: unlock,
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },

    tap: function () { tone(520, 0, 0.06, 'triangle', 0.25); },

    /** Rising arpeggio, pitched up for longer words. */
    found: function (length) {
      var base = 523.25 * Math.pow(1.06, Math.max(0, (length || 3) - 3));
      tone(base, 0, 0.10, 'sine', 0.4);
      tone(base * 1.26, 0.05, 0.12, 'sine', 0.34);
      tone(base * 1.5, 0.10, 0.16, 'sine', 0.28);
    },

    bonus: function () {
      tone(880, 0, 0.07, 'triangle', 0.28);
      tone(1174.7, 0.06, 0.12, 'triangle', 0.24);
    },

    invalid: function () {
      tone(180, 0, 0.13, 'sawtooth', 0.16);
      tone(150, 0.06, 0.14, 'sawtooth', 0.14);
    },

    hint: function () {
      tone(700, 0, 0.09, 'sine', 0.3);
      tone(1050, 0.07, 0.14, 'sine', 0.26);
    },

    complete: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], i * 0.09, 0.30, 'sine', 0.34);
      }
    },

    coin: function () {
      tone(988, 0, 0.06, 'square', 0.14);
      tone(1318.5, 0.05, 0.10, 'square', 0.12);
    }
  };

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
