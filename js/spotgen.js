/* spotgen.js - puzzle generator for the "spot the real flag" mode (working title: True Colours).
   Pure logic, no DOM. Exposed on window.SpotGen. Needs js/color.js first.

   A puzzle is one flag drawn several times. One copy is the real flag from the flag set; the others have ONE of the
   flag's colours changed. The changed shades sit on a small grid in colour space (two axes out of: lighter/darker,
   rotated hue, fainter/stronger) with the real shade in a random cell. Two reasons for a grid rather than "the real
   flag plus some random edits":
     - If every wrong copy is the real one with one edit, the real one is the copy closest to all the others (and its
       shades are the most common ones), so a player can find it by comparing copies instead of remembering.
       On a grid the real shade is in a random cell, so nothing about the set gives it away.
     - Every pair of shades is at least CONFIG.gap apart (CIEDE2000), so no wrong copy is a near miss that a player
       who remembers a slightly different official shade could fairly choose.
   Everything is seeded (date + flag), so every player sees the same puzzle. Changing how puzzles are generated
   changes every past and future day: bump CONFIG.version only if that is intended. */
(function () {
  const C = window.Color;

  const CONFIG = {
    version: 1,                  // part of every seed
    options: 6,                  // copies of the flag shown (1 real + options-1 wrong)
    gap: 9,                      // minimum CIEDE2000 between any two copies' changed colour. ~2 is "just visible", 9 is clearly different side by side. Tune by playtest
    minChroma: 15,               // only colours at least this saturated are altered (never white, black or grey)
    perDay: 5,                   // flags per daily
    seed: 20261104,              // fixed shuffle of the pool: the order never changes
    epoch: Date.UTC(2026, 10, 4),// daily #1 (provisional until launch)
  };

  // Flags for the prototype: plain stripes, bands, crosses or a single disc, so nothing fine gets lost when a colour changes,
  // AND a main colour that can be shifted a long way while staying recognisably the same colour (see the rules in tryGrid).
  // Left out on purpose, because shade changes alone can't work for them and they want hand-made variants instead (swapped
  // stripes, moved details): flags whose key colour is already as saturated as a screen can show, such as the plain
  // red-and-white ones (at, pl, id, mc, ch, jp, pe), pure-primary tricolours (lu, ye, ie, ml, gn, ci, bd, cz, no), and flags whose
  // colours are all near the edge (fr, de, ro: half their puzzles end up with wrong copies that are obviously another colour).
  // `anchors`: other shades the same colour is commonly drawn in (other flag sets, official specs). No wrong copy may be
  // within CONFIG.gap of these either, so a player who knows Italy's green as #008c45 is never marked wrong for picking
  // that. Keyed by the colour as it appears in flags/<code>.svg. These are from memory and want a review.
  const POOL = [
    { code: 'it', anchors: { '#009246': ['#008c45', '#008d46'], '#ce2b37': ['#cd212a', '#d2232a'] } },
    { code: 'nl', anchors: { '#ae1c28': ['#c8102e', '#a91d2a'], '#21468b': ['#003082', '#1e4785'] } },
    { code: 'be' },
    { code: 'hu', anchors: { '#388d00': ['#477050', '#436f4d'], '#d43516': ['#ce2939', '#cd2a3e'] } },
    { code: 'bg', anchors: { '#00966e': ['#009b74'] } },
    { code: 'ru' }, { code: 'ee' }, { code: 'lt' }, { code: 'lv' }, { code: 'ua' }, { code: 'td' }, { code: 'dk' }, { code: 'se' },
    { code: 'fi' }, { code: 'mu' }, { code: 'ga' }, { code: 'co' }, { code: 'cr' }, { code: 'th' },
  ];

  // ------------------------------------------------------------------ random numbers
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {                       // FNV-1a, 32 bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ------------------------------------------------------------------ colours
  const NAMED = { red: '#ff0000', gold: '#ffd700', gray: '#808080', purple: '#800080', white: '#ffffff', black: '#000000' };
  function normHex(v) {
    v = String(v).trim().toLowerCase();
    if (NAMED[v]) return NAMED[v];
    if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return /^#[0-9a-f]{6}$/.test(v) ? v : null;
  }
  const labOf = hex => C.rgbToLab(...C.hexToRgb(hex));
  const chromaOf = hex => { const l = labOf(hex); return Math.hypot(l[1], l[2]); };
  const hueGap = (x, y) => { const a = labOf(x), b = labOf(y); let d = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1])) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
  const dE = (a, b) => C.hexDistance(a, b);
  // CIE Lab (D65, the same reference white as Color.rgbToLab) back to a hex colour, clipped into the sRGB gamut.
  function labToHex(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = t => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
    const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    const lin = [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
    return '#' + lin.map(v => {
      v = Math.min(1, Math.max(0, v));
      v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(v * 255).toString(16).padStart(2, '0');
    }).join('');
  }

  // ------------------------------------------------------------------ svg
  // Every distinct fill colour in the svg, as #rrggbb, in order of first use. (Named colours such as red are mapped to hex.)
  function fillsIn(svg) {
    const seen = [];
    for (const m of svg.matchAll(/fill="([^"]*)"/g)) { const h = normHex(m[1]); if (h && !seen.includes(h)) seen.push(h); }
    return seen;
  }
  // The svg with each fill in `map` ({ '#rrggbb': '#rrggbb' }) swapped.
  function recolour(svg, map) {
    return svg.replace(/fill="([^"]*)"/g, (m, v) => { const h = normHex(v); return h && map[h] ? `fill="${map[h]}"` : m; });
  }

  // ------------------------------------------------------------------ shade grids
  // Four ways to move a colour away from itself. k = how many steps, s = step size. (Lab a runs green to red, Lab b blue
  // to yellow; changing saturation alone barely registers, so it is not one of them.)
  const FAMILIES = [
    { name: 'lightness', start: 6, inc: 0.5, max: 28, at: (l, k, s) => [l[0] + k * s, l[1], l[2]] },
    { name: 'hue', start: 8, inc: 1, max: 50, at: (l, k, s) => { const t = k * s * Math.PI / 180, c = Math.cos(t), n = Math.sin(t); return [l[0], l[1] * c - l[2] * n, l[1] * n + l[2] * c]; } },
    { name: 'greener-redder', start: 6, inc: 1, max: 45, at: (l, k, s) => [l[0], l[1] + k * s, l[2]] },
    { name: 'bluer-yellower', start: 6, inc: 1, max: 45, at: (l, k, s) => [l[0], l[1], l[2] + k * s] },
  ];
  const RULE_SETS = [{ vivid: true, family: true }, { vivid: false, family: true }, { vivid: true, family: false }, { vivid: false, family: false }];
  const WANT = 6, MAX_TRIES = 150;   // per colour: try random axis pairs until WANT work (or MAX_TRIES), then use the subtlest
  const SAME_HUE = 18, FAMILY_CHROMA = 0.4;      // see tryGrid
  const MAX_FROM_REAL = 45;      // no copy is further than this from the real shade: past ~50 it is "a different colour"

  // The cells of a small grid for n copies: two rows (one if n < 4) of ceil(n/2) columns, losing a random cell if n is odd.
  function gridCells(n, rnd) {
    const rows = n < 4 ? 1 : 2, cols = Math.ceil(n / rows), cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
    while (cells.length > n) cells.splice(Math.floor(rnd() * cells.length), 1);
    return cells;
  }

  // The smallest step along one axis that keeps neighbouring cells at least `gap` apart. `ks` are the grid offsets in use.
  function minStep(fam, lab, gap, ks, sign) {
    for (let st = fam.start; st <= fam.max; st += fam.inc) {
      let ok = true;
      for (let i = 0; i + 1 < ks.length && ok; i++) {
        const x = ks[i] === 0 ? labToHex(...lab) : labToHex(...fam.at(lab, sign * ks[i], st));
        const y = ks[i + 1] === 0 ? labToHex(...lab) : labToHex(...fam.at(lab, sign * ks[i + 1], st));
        if (dE(x, y) < gap) ok = false;
      }
      if (ok) return st;
    }
    return null;
  }

  // n shades of `hex` laid out on a grid whose two axes are two different ways of changing a colour (say lighter/darker
  // and bluer/redder), the real shade in a random cell. Every pair at least `gap` apart, clear of the anchors and of the
  // flag's other colours (so a blue can't turn into the flag's white), and none too far from the real one. Each axis uses
  // the smallest step that works for it, widened a little if that is what it takes to satisfy everything else.
  // Returns null if this try fails; the caller tries again with other random choices.
  function tryGrid(hex, others, anchors, n, gap, rnd, rules) {
    const fams = shuffled(FAMILIES, rnd), A = fams[0], B = fams[1], lab = labOf(hex);
    const cells = gridCells(n, rnd), real = Math.floor(rnd() * cells.length), sa = rnd() < 0.5 ? 1 : -1, sb = rnd() < 0.5 ? 1 : -1;
    const c0 = cells[real][0], r0 = cells[real][1], sorted = a => [...new Set(a)].sort((x, y) => x - y);
    const sA = minStep(A, lab, gap, sorted(cells.map(c => c[0] - c0)), sa), sB = minStep(B, lab, gap, sorted(cells.map(c => c[1] - r0)), sb);
    if (sA == null || sB == null) return null;
    for (const fa of [1, 1.15, 1.3, 1.5]) {
      for (const fb of [1, 1.15, 1.3, 1.5]) {
        const stepA = sA * fa, stepB = sB * fb;
        const shades = cells.map(([c, r], i) => (i === real ? hex : labToHex(...B.at(A.at(lab, sa * (c - c0), stepA), sb * (r - r0), stepB))));
        let ok = true;
        for (let i = 0; i < n && ok; i++) {
          for (let j = i + 1; j < n; j++) if (dE(shades[i], shades[j]) < gap) { ok = false; break; }
          if (!ok || i === real) continue;
          if (dE(shades[i], hex) > MAX_FROM_REAL) { ok = false; break; }
          for (const x of others) if (dE(shades[i], x) < gap) { ok = false; break; }
          for (const x of anchors) if (dE(shades[i], x) < gap) { ok = false; break; }
        }
        // The real shade is usually as saturated as a screen can show, so shifted copies tend to be duller, and "pick the most
        // vivid" would beat chance without remembering anything. Refuse sets where the real one clearly out-saturates every other.
        if (ok && rules.vivid) { const c = chromaOf(hex); ok = shades.some((x, i) => i !== real && chromaOf(x) >= c); }
        // Same colour family: a wrong blue stays a blue (hue within SAME_HUE degrees, not faded towards grey). Without this the
        // wrong copies of a dark blue turn purple or maroon and the real one is simply "the only blue".
        if (ok && rules.family) ok = shades.every((x, i) => i === real || (chromaOf(x) >= FAMILY_CHROMA * chromaOf(hex) && hueGap(hex, x) <= SAME_HUE));
        if (ok) return { shades, real, family: A.name + '+' + B.name, reach: Math.max(...shades.map(x => dE(x, hex))) };
      }
    }
    return null;
  }

  // One puzzle. `svg` is the real flag's svg text; `rnd` a seeded generator. Returns
  //   { options: [{ svg, real, shade }], realIndex, changed: { from, family, shades } }
  // with the options already in their (seeded) display order. Throws if no colour of this flag can be changed, which
  // test_spot.mjs makes sure never happens for the pool.
  function generate(svg, anchorMap, rnd, n) {
    n = n || CONFIG.options;
    const fills = fillsIn(svg), colours = shuffled(fills.filter(h => chromaOf(h) >= CONFIG.minChroma), rnd);
    for (const hex of colours) {
      const anchors = ((anchorMap || {})[hex] || []).map(normHex).filter(Boolean), others = fills.filter(h => h !== hex);
      // Try several random axis pairs and keep the subtlest: the one whose furthest copy is nearest to the real shade.
      let best = null;
      // Rules in order of preference; a colour that can't meet them all falls back to the next set.
      for (const rules of RULE_SETS) {
        let found = 0;
        for (let attempt = 0; attempt < MAX_TRIES && found < WANT; attempt++) {
          const g = tryGrid(hex, others, anchors, n, CONFIG.gap, rnd, rules);
          if (!g) continue;
          found++;
          if (!best || g.reach < best.reach) best = g;
        }
        if (best) { best.rules = rules; break; }
      }
      if (!best) continue;
      const opts = best.shades.map((shade, i) => ({ svg: i === best.real ? svg : recolour(svg, { [hex]: shade }), real: i === best.real, shade }));
      const options = shuffled(opts, rnd);
      return { options, realIndex: options.findIndex(o => o.real), changed: { from: hex, family: best.family, rules: best.rules, shades: options.map(o => o.shade) } };
    }
    throw new Error('SpotGen: no set of shades possible for this flag');
  }

  // ------------------------------------------------------------------ the daily
  const dayKey = d => new Date(d).toISOString().slice(0, 10);
  const dayNumber = key => Math.floor((Date.parse(key + 'T00:00:00Z') - CONFIG.epoch) / 86400000) + 1;   // epoch day = #1
  // The flags for a day: five consecutive entries of one fixed shuffle of the pool, wrapping round.
  function dailyCodes(key) {
    const order = shuffled(POOL.map(p => p.code), mulberry32(CONFIG.seed)), start = (dayNumber(key) - 1) * CONFIG.perDay;
    return Array.from({ length: CONFIG.perDay }, (_, j) => order[(((start + j) % order.length) + order.length) % order.length]);
  }
  // The puzzle for a day and flag, from that flag's svg text.
  function puzzleFor(key, code, svg) {
    const rnd = mulberry32(hashSeed(`${key}:${code}:v${CONFIG.version}`));
    const entry = POOL.find(p => p.code === code);
    return generate(svg, entry && entry.anchors, rnd);
  }

  window.SpotGen = { CONFIG, POOL, mulberry32, hashSeed, fillsIn, recolour, normHex, labToHex, generate, dayKey, dayNumber, dailyCodes, puzzleFor };
})();
