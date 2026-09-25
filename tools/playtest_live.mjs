// Live playtest harness: plays today's Daily Challenge on the LIVE site (not
// a local static server) end-to-end with real clicks, and checks the real
// /api/daily endpoint. Written for the daily scheduled playtest routine, but
// runs fine by hand too: `node tools/playtest_live.mjs`.
//
// Unlike tools/shot.mjs (which serves the repo's local files over a
// throwaway localhost server, purely for visual-regression screenshots),
// this script talks to the deployed site over the network, so it actually
// exercises what players see: the live JS bundle, the live flag manifest,
// and the live serverless /api/daily function + Redis.
//
// Exit code: 0 = all checks passed. 1 = at least one check failed (see the
// JSON summary on stdout, and the `issues` array in particular).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = (process.argv[2] || process.env.LIVE_URL || 'https://flagfillgame.vercel.app').replace(/\/$/, '');
const OUTDIR = process.argv[3] || 'playtest-out';
fs.mkdirSync(OUTDIR, { recursive: true });

const issues = [];
const note = msg => { console.error('  ' + msg); };
const fail = msg => { issues.push(msg); note('ISSUE: ' + msg); };

// ---------------------------------------------------------------- expected daily flag
// Re-derives the expected Daily Challenge flag independently of the page,
// using the SAME algorithm as js/game.js (mulberry32 + seededShuffle), but
// reading the constants and the flag catalogue straight off the live site.
// A mismatch here means the live deploy is stale or the manifest/epoch/seed
// have drifted out of sync with what's actually running.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rnd = mulberry32(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function computeExpectedDaily() {
  const gameJs = await (await fetch(`${BASE_URL}/js/game.js`)).text();
  const epochMatch = gameJs.match(/dailyEpoch:\s*Date\.UTC\((\d+),\s*(\d+),\s*(\d+)\)/);
  const seedMatch = gameJs.match(/dailySeed:\s*(\d+)/);
  if (!epochMatch || !seedMatch) throw new Error('could not find dailyEpoch/dailySeed in live js/game.js — has the file moved or been renamed?');
  const epoch = Date.UTC(+epochMatch[1], +epochMatch[2], +epochMatch[3]);
  const seed = +seedMatch[1];

  const manifest = await (await fetch(`${BASE_URL}/flags/manifest.json`)).json();
  const sorted = manifest.flags.slice().sort((a, b) => a.code.localeCompare(b.code));
  const order = seededShuffle(sorted, seed);

  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayNumber = Math.floor((midnight - epoch) / 86400000);
  const idx = ((dayNumber % order.length) + order.length) % order.length;
  return { number: dayNumber + 1, meta: order[idx], dateKey: now.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------- main
async function main() {
  console.error(`Live playtest: ${BASE_URL}`);
  const expected = await computeExpectedDaily();
  note(`Expected daily #${expected.number}: ${expected.meta.name} (${expected.meta.code})`);

  // /opt/pw-browsers/chromium is the pre-installed browser in the Claude
  // Code sandbox this routine runs in; fall back to Playwright's own
  // managed browser (`npx playwright install chromium`) anywhere else.
  const sandboxChromium = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // IMPORTANT: never let a playtest write a real score into the live
  // leaderboard — a fake bot score would permanently skew today's real
  // "average score" and player count for actual players, and there's no
  // way to undo it afterwards (the API only stores aggregate counters, no
  // per-submission log). So intercept the client's POST to /api/daily and
  // answer it locally instead of letting it reach the real endpoint. The
  // real endpoint is still checked for real, read-only, via a plain GET
  // after the browser closes (see below) — that's the actual health check.
  await page.route('**/api/daily', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* ignore */ }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ date: body.date, count: 1, avg: Number(body.score) || 0, beat: null }),
    });
  });

  let actual = null, unclickable = [], scorePoints = null;
  try {
    await page.goto(`${BASE_URL}/?daily`, { waitUntil: 'load', timeout: 30000 });
    // Wait not just for TC.state.daily (set synchronously when the round
    // starts) but for board.flag too — FlagBoard.load() awaits
    // Assets.loadFlag() before populating flag.labels, and regionAt()
    // returns 0 (unclickable) for every pixel until that resolves. Clicking
    // before this point looks exactly like a "no clickable pixels" bug but
    // is really just a race in the test, not the game.
    await page.waitForFunction(() => window.TC && window.TC.state && window.TC.state.daily && window.TC.board && window.TC.board.flag, { timeout: 15000 });

    actual = await page.evaluate(() => ({
      number: TC.state.daily.number,
      name: TC.state.daily.meta.name,
      code: TC.state.daily.meta.code,
      regions: TC.board.meta.regions.map(r => ({ id: r.id, hex: r.hex, cx: r.cx, cy: r.cy })),
    }));

    if (actual.code !== expected.meta.code || actual.number !== expected.number) {
      fail(`live site shows Daily #${actual.number} (${actual.name}/${actual.code}) but the seeded-shuffle logic predicts Daily #${expected.number} (${expected.meta.name}/${expected.meta.code}) — possible stale deploy, or dailyEpoch/dailySeed/catalogue drift.`);
    } else {
      note(`daily flag matches prediction: #${actual.number} ${actual.name}`);
    }

    // Real end-to-end clicks: move the mouse to each region's centroid (as
    // published in manifest.json) scaled onto the canvas's actual on-screen
    // rect, and click there — exactly what a player's tap does. A region
    // that doesn't register a fill this way is a real "can't be filled" bug.
    const manifest = await (await fetch(`${BASE_URL}/flags/manifest.json`)).json();
    const flagMeta = manifest.flags.find(f => f.code === actual.code);
    const flagW = manifest.width, flagH = manifest.height;

    for (const region of flagMeta.regions) {
      const before = await page.evaluate(() => TC.board.filledCount);
      const box = await page.locator('#flag-canvas').boundingBox();
      const x = box.x + (region.cx / flagW) * box.width;
      const y = box.y + (region.cy / flagH) * box.height;
      await page.mouse.click(x, y);
      const after = await page.evaluate(() => TC.board.filledCount);
      if (after <= before) unclickable.push({ id: region.id, hex: region.hex, cx: region.cx, cy: region.cy });
    }
    if (unclickable.length) {
      fail(`${unclickable.length} region(s) have no clickable pixels at their published centroid: ${JSON.stringify(unclickable)}`);
    } else {
      note(`all ${flagMeta.regions.length} region(s) clickable and fillable`);
    }

    // Submit (button only enables once every region is filled — if a region
    // was unclickable above, this will correctly stay disabled and time out,
    // which is itself useful signal, so give it a short timeout).
    const submitBtn = page.locator('#btn-submit');
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    const enabled = await submitBtn.isEnabled();
    if (!enabled) {
      fail('submit button never became enabled — not all regions could be filled');
    } else {
      await submitBtn.click();
      await page.waitForFunction(() => document.getElementById('result-points') && document.getElementById('result-points').textContent.trim() !== '', { timeout: 10000 });
      await page.waitForTimeout(400); // let the animated-number counter settle
      const pointsText = await page.locator('#result-points').textContent();
      scorePoints = Number(pointsText.trim());
      if (!Number.isFinite(scorePoints) || scorePoints < 0 || scorePoints > 1000) {
        fail(`submitted score is not sane: "${pointsText}"`);
      } else {
        note(`submitted score: ${scorePoints}/1000`);
      }
      await page.screenshot({ path: path.join(OUTDIR, 'daily-result.png') });
    }
  } catch (e) {
    fail(`playtest run threw: ${e.message}`);
    try { await page.screenshot({ path: path.join(OUTDIR, 'daily-error.png') }); } catch (_) { /* ignore */ }
  }

  if (consoleErrors.length) {
    fail(`${consoleErrors.length} console error(s): ${JSON.stringify(consoleErrors.slice(0, 5))}`);
  } else {
    note('no console errors');
  }

  await browser.close();

  // ---- live API check (independent of the browser session above) ----
  try {
    const res = await fetch(`${BASE_URL}/api/daily?date=${expected.dateKey}`);
    const body = await res.text();
    if (!res.ok) {
      fail(`GET /api/daily?date=${expected.dateKey} returned ${res.status}: ${body.slice(0, 300)}`);
    } else {
      let json;
      try { json = JSON.parse(body); } catch (e) { fail(`GET /api/daily returned non-JSON: ${body.slice(0, 300)}`); }
      if (json && (typeof json.count !== 'number' || typeof json.avg !== 'number')) {
        fail(`GET /api/daily response missing sane count/avg: ${body.slice(0, 300)}`);
      } else if (json) {
        note(`/api/daily ok: count=${json.count} avg=${json.avg}`);
      }
    }
  } catch (e) {
    fail(`GET /api/daily request failed: ${e.message}`);
  }

  const summary = {
    baseUrl: BASE_URL,
    dateKey: expected.dateKey,
    expectedDaily: { number: expected.number, name: expected.meta.name, code: expected.meta.code },
    actualDaily: actual ? { number: actual.number, name: actual.name, code: actual.code } : null,
    scorePoints,
    unclickableRegions: unclickable,
    consoleErrors,
    issues,
    ok: issues.length === 0,
  };
  fs.writeFileSync(path.join(OUTDIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(issues.length ? 1 : 0);
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
