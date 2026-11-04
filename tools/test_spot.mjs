// Tests for js/spotgen.js, the puzzle generator behind the "spot the real flag" mode. No browser needed:
//   node tools/test_spot.mjs        (or: npm run test:spot)
// Checks every rule for every pool flag over many seeds, and measures whether the real flag can be found WITHOUT
// remembering it (by being the "middle" copy, the most vivid, the lightest...). Exit code 0 = all passed.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const win = {};
for (const f of ['color', 'spotgen']) new Function('window', fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'))(win);
const { SpotGen: G, Color: C } = win;
const svgOf = code => fs.readFileSync(new URL(`../flags/${code}.svg`, import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../flags/manifest.json', import.meta.url), 'utf8'));
const SEEDS = 40;      // puzzles per flag per rule (about 20ms each; raise for a thorough run)
const dE = C.hexDistance;

// the colour that differs between an option and the real svg: [realHex, optionHex], or null if identical
function changedColour(realSvg, optSvg) {
  const a = G.fillsIn(realSvg), b = G.fillsIn(optSvg);
  const diff = a.map((h, i) => [h, b[i]]).filter(([x, y]) => x !== y);
  return diff;
}

let failed = 0;
const tests = {
  'pool flags exist, are playable and have a colour that can be changed'() {
    const ok = new Set(manifest.flags.map(f => f.code)), ex = new Set(manifest.excluded);
    for (const { code } of G.POOL) {
      assert.ok(ok.has(code), code + ' is not in the manifest');
      assert.ok(!ex.has(code), code + ' is excluded from play');
      assert.ok(G.fillsIn(svgOf(code)).some(h => { const l = C.rgbToLab(...C.hexToRgb(h)); return Math.hypot(l[1], l[2]) >= G.CONFIG.minChroma; }), code + ' has nothing to change');
    }
  },
  'every puzzle: one real flag, the rest differ in exactly one colour by at least the gap and clear of the anchors'() {
    for (const { code, anchors } of G.POOL) {
      const real = svgOf(code);
      for (let s = 0; s < SEEDS; s++) {
        const p = G.generate(real, anchors, G.mulberry32(s * 7919 + 1));
        assert.equal(p.options.length, G.CONFIG.options, code);
        assert.equal(p.options.filter(o => o.real).length, 1, code + ' real count');
        assert.equal(p.options[p.realIndex].svg, real, code + ' real flag must be untouched');
        const shades = [];
        for (const o of p.options) {
          if (o.real) { shades.push(p.changed.from); continue; }
          const d = changedColour(real, o.svg);
          assert.equal(d.length, 1, `${code} seed ${s}: an option changes ${d.length} colours`);
          assert.ok(dE(d[0][0], d[0][1]) >= G.CONFIG.gap - 0.01, `${code} seed ${s}: wrong copy only ${dE(d[0][0], d[0][1]).toFixed(1)} from the real colour`);
          for (const a of (anchors && anchors[d[0][0]]) || []) assert.ok(dE(d[0][1], a) >= G.CONFIG.gap - 0.01, `${code} seed ${s}: wrong copy too close to anchor ${a}`);
          shades.push(d[0][1]);
        }
        for (let i = 0; i < shades.length; i++) for (let j = i + 1; j < shades.length; j++)
          assert.ok(dE(shades[i], shades[j]) >= G.CONFIG.gap - 0.01, `${code} seed ${s}: two copies only ${dE(shades[i], shades[j]).toFixed(1)} apart`);
      }
    }
  },
  'the wrong copies stay the same colour family in at least 85% of puzzles (the rest are the fallback described in spotgen.js)'() {
    let strict = 0, n = 0;
    for (const { code, anchors } of G.POOL) for (let s = 0; s < SEEDS; s++) { const r = G.generate(svgOf(code), anchors, G.mulberry32(s * 31 + 5)).changed.rules; n++; if (r.family) strict++; }
    console.log(`  same-family puzzles: ${(100 * strict / n).toFixed(1)}%`);
    assert.ok(strict / n >= 0.85, `only ${(100 * strict / n).toFixed(1)}% of puzzles keep the wrong copies in the same colour family`);
  },
  'same date and flag always give the same puzzle; a different date gives a different one'() {
    const real = svgOf('it');
    const a = G.puzzleFor('2026-11-05', 'it', real), b = G.puzzleFor('2026-11-05', 'it', real), c = G.puzzleFor('2026-11-06', 'it', real);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.changed.shades, c.changed.shades);
  },
  'each daily has five different flags, from the pool, and every flag comes round'() {
    const seen = new Set(), pool = new Set(G.POOL.map(p => p.code));
    for (let d = 0; d < 40; d++) {
      const key = new Date(G.CONFIG.epoch + d * 86400000).toISOString().slice(0, 10), codes = G.dailyCodes(key);
      assert.equal(codes.length, 5); assert.equal(new Set(codes).size, 5, key);
      codes.forEach(c => { assert.ok(pool.has(c)); seen.add(c); });
    }
    assert.equal(seen.size, pool.size);
    assert.equal(G.dayNumber(new Date(G.CONFIG.epoch).toISOString().slice(0, 10)), 1);
  },
  'nothing about the set gives the real flag away (no tell picks it more than 40% of the time)'() {
    // Each "tell" is a rule a player could apply by comparing the copies with no memory of the flag. Chance for a
    // rule that picks one copy is 1/6 = 17%. Anything well above that is a leak.
    const tells = { medoid: 0, mostVivid: 0, leastVivid: 0, lightest: 0, darkest: 0 };
    let n = 0;
    for (const { code, anchors } of G.POOL) {
      const real = svgOf(code);
      for (let s = 0; s < SEEDS; s++) {
        const p = G.generate(real, anchors, G.mulberry32(s * 104729 + 3)), sh = p.changed.shades, lab = sh.map(h => C.rgbToLab(...C.hexToRgb(h)));
        const total = sh.map((a, i) => sh.reduce((t, b, j) => t + (i === j ? 0 : dE(a, b)), 0));
        const best = (vals, fn) => { const t = fn(...vals); return vals.indexOf(t) === p.realIndex && vals.filter(v => v === t).length === 1; };
        n++;
        if (best(total, Math.min)) tells.medoid++;
        const chroma = lab.map(l => Math.hypot(l[1], l[2]));
        if (best(chroma, Math.max)) tells.mostVivid++;
        if (best(chroma, Math.min)) tells.leastVivid++;
        const L = lab.map(l => l[0]);
        if (best(L, Math.max)) tells.lightest++;
        if (best(L, Math.min)) tells.darkest++;
      }
    }
    const pct = Object.fromEntries(Object.entries(tells).map(([k, v]) => [k, +(100 * v / n).toFixed(1)]));
    console.log('  tell rates (% of puzzles the real flag is picked by each rule; chance for one copy is 16.7):', JSON.stringify(pct));
    for (const [k, v] of Object.entries(pct)) assert.ok(v <= 40, `the real flag is the ${k} copy in ${v}% of puzzles`);
  },
};

for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n')[0]); }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
