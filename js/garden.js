/*!
 * Word Bloom — garden
 * ---------------------------------------------------------------------------
 * The identity layer. "Word Bloom" promised something botanical and the game
 * delivered flat letter tiles, so this is the fix: every completed level
 * plants a flower, and the garden persists.
 *
 * Two jobs, both commercial:
 *   1. DIFFERENTIATION. Portals reject clones and reskins. A word game with a
 *      growing garden is a recognisable product, not another letter grid.
 *   2. RETENTION. An unfinished garden is a reason to come back, which is the
 *      metric CrazyGames gates monetisation on.
 *
 * Flowers are pure CSS (no images), deterministic per level so a garden always
 * looks the same on reload.
 */
(function (root) {
  'use strict';

  // Petal / centre pairs. Warm and varied so a full garden reads as a garden
  // rather than a colour ramp.
  var BLOOMS = [
    { p: '#f472b6', c: '#fbbf24' },  // pink / gold
    { p: '#fb923c', c: '#fde68a' },  // coral / cream
    { p: '#a78bfa', c: '#f0abfc' },  // violet / lilac
    { p: '#38bdf8', c: '#bae6fd' },  // sky
    { p: '#f87171', c: '#fecaca' },  // red
    { p: '#facc15', c: '#fef08a' },  // yellow
    { p: '#4ade80', c: '#bbf7d0' },  // green
    { p: '#fb7185', c: '#fda4af' }   // rose
  ];

  // Single shared hash — see js/hash.js for why this is centralised.
  var hash = root.WordBloom.hash32;

  /** Deterministic bloom for a level so the garden is stable across reloads. */
  function bloomFor(seed) {
    return BLOOMS[hash(String(seed)) % BLOOMS.length];
  }

  var PETAL_COUNT = 5;

  /**
   * Build one flower element.
   * @param {number|string} seed  level number (determines colour + size)
   * @param {boolean} full        render at full size (garden) vs. mini (chip)
   */
  function flowerEl(seed, full) {
    var b = bloomFor(seed);
    var w = full ? 26 : 18;
    var petal = w * 0.44;
    var centre = w * 0.30;
    // Gentle per-flower rotation and size variance, deterministic but not
    // uniform — a grid of identical flowers still reads as a prototype.
    var h = hash('rot' + seed);
    var tilt = (h % 60) - 30;
    var scale = full ? (0.86 + ((h >> 8) % 30) / 100) : 1;

    var el = document.createElement('span');
    el.className = 'flower' + (full ? ' flower--full' : '');
    el.style.width = w + 'px';
    el.style.height = w + 'px';
    el.style.setProperty('--p', b.p);
    el.style.setProperty('--c', b.c);
    el.style.transform = 'rotate(' + tilt + 'deg) scale(' + scale + ')';

    for (var i = 0; i < PETAL_COUNT; i++) {
      var petalEl = document.createElement('i');
      var angle = (360 / PETAL_COUNT) * i;
      var dist = (w - petal) / 2 + 1;
      petalEl.style.width = petal + 'px';
      petalEl.style.height = petal + 'px';
      // Centre first, then rotate outwards — otherwise each petal is offset by
      // half its own size.
      petalEl.style.transform =
        'translate(-50%, -50%) rotate(' + angle + 'deg) translateY(-' + dist + 'px)';
      el.appendChild(petalEl);
    }
    var core = document.createElement('b');
    core.style.width = centre + 'px';
    core.style.height = centre + 'px';
    el.appendChild(core);

    return el;
  }

  /**
   * Render the garden strip on the home screen.
   * @param {HTMLElement} host
   * @param {Array} garden   [{ level, id }] in planting order
   * @param {number} capacity visible slots
   */
  function render(host, garden, capacity) {
    if (!host) return;
    var cap = capacity || 14;
    var plants = Array.isArray(garden) ? garden : [];

    host.innerHTML = '';

    var bed = document.createElement('div');
    bed.className = 'garden__bed';

    // Show the most recent flowers, oldest → newest, so growth reads
    // left-to-right like a real planting row.
    var recent = plants.slice(-cap);
    for (var i = 0; i < recent.length; i++) {
      var slot = document.createElement('span');
      slot.className = 'garden__slot garden__slot--grown';
      slot.style.animationDelay = (i * 45) + 'ms';
      slot.appendChild(flowerEl(recent[i].level, true));
      bed.appendChild(slot);
    }

    // Empty slots show where the next flowers will go — a visible goal.
    for (var j = recent.length; j < cap; j++) {
      var empty = document.createElement('span');
      empty.className = 'garden__slot';
      empty.innerHTML = '<i class="garden__sprout"></i>';
      bed.appendChild(empty);
    }

    host.appendChild(bed);

    var label = document.createElement('div');
    label.className = 'garden__label';
    if (plants.length === 0) {
      label.textContent = 'Finish a level to plant your first flower';
    } else if (plants.length === 1) {
      label.textContent = '1 flower grown';
    } else {
      label.innerHTML = '<b>' + plants.length + '</b> flowers grown';
    }
    host.appendChild(label);
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.garden = {
    BLOOMS: BLOOMS,
    bloomFor: bloomFor,
    flowerEl: flowerEl,
    render: render,
    hash: hash
  };
})(typeof window !== 'undefined' ? window : globalThis);
