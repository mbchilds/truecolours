/* game.js - screens, game modes, scoring, daily challenge and sharing. */
(function () {
  const C = window.Color, S = window.Streak, Assets = window.FlagAssets;

  // ----------------------------------------------------------------- config
  const CONFIG = {
    siteName: 'FlagFill',
    rounds: 5,                                  // quick play rounds
    dailyEpoch: Date.UTC(2026, 8, 1),           // Daily #1 = 1 Sep 2026 (UTC)
    dailySeed: 20260901,                        // fixed shuffle so the daily order never changes
    api: '',                                    // '' = same origin (Vercel). Point elsewhere if you host the API separately.
  };

  // ----------------------------------------------------------------- helpers
  const $ = id => document.getElementById(id);
  const track = (name, params) => { try { if (window.gtag) gtag('event', name, params || {}); } catch (e) { /* ignore */ } };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
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
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function utcDateKey(d = new Date()) { return d.toISOString().slice(0, 10); }
  function dayNumber(d = new Date()) {
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor((midnight - CONFIG.dailyEpoch) / 86400000);
  }
  function clientId() {
    let id = store.get('cid');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('cid', id); }
    return id;
  }
  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === screenId));
    window.scrollTo(0, 0);
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 300); }, 2200);
  }
  const fmt = n => Math.round(n).toLocaleString('en-GB');

  // ----------------------------------------------------------------- scoring
  // Every distinct colour in the real flag is worth an equal share of 1000.
  // Within a colour, regions are weighted by area.
  function scoreAttempt(meta, fills) {
    const groups = new Map();
    for (const r of meta.regions) {
      if (!groups.has(r.hex)) groups.set(r.hex, { hex: r.hex, regions: [] });
      groups.get(r.hex).regions.push(r);
    }
    const out = [];
    const rows = [];
    for (const g of groups.values()) {
      let totalArea = 0, weighted = 0, best = null;
      const byFill = new Map();
      for (const r of g.regions) {
        const yours = fills.get(r.id) || '#f4f4f1';
        const pts = C.pointsFor(C.hexDistance(yours, g.hex));
        weighted += pts * r.area; totalArea += r.area;
        if (!best || r.area > best.area) best = { area: r.area, hex: yours };
        if (!byFill.has(yours)) byFill.set(yours, { yours, points: pts, area: 0, count: 0 });
        const fillGroup = byFill.get(yours);
        fillGroup.area += r.area; fillGroup.count += 1;
      }
      const points = Math.round(weighted / totalArea);
      const mixed = byFill.size > 1;
      out.push({ hex: g.hex, yours: best.hex, points, verdict: C.verdict(points), mixed, area: totalArea });
      // Breakdown detail: one row per distinct fill used within this colour, so
      // a wrongly-coloured region shows up on its own rather than being
      // averaged away into the rest of the same-coloured regions.
      for (const fillGroup of [...byFill.values()].sort((a, b) => b.area - a.area)) {
        rows.push({
          hex: g.hex, yours: fillGroup.yours, points: fillGroup.points,
          verdict: C.verdict(fillGroup.points), count: fillGroup.count, groupArea: totalArea, area: fillGroup.area,
        });
      }
    }
    out.sort((a, b) => b.area - a.area);
    rows.sort((a, b) => b.groupArea - a.groupArea || b.area - a.area);
    const points = Math.round(out.reduce((s, g) => s + g.points, 0) / out.length);
    return { points, groups: out, rows };
  }
  function emojiBar(groups) {
    return groups.map(g => g.points >= 900 ? '🟩' : g.points >= 600 ? '🟨' : g.points >= 300 ? '🟧' : '🟥').join('');
  }
  function overallVerdict(points, max) {
    const p = points / max;
    if (p >= 0.98) return 'Vexillologist';
    if (p >= 0.9) return 'Flag expert';
    if (p >= 0.78) return 'Well travelled';
    if (p >= 0.6) return 'Not bad at all';
    if (p >= 0.4) return 'Getting there';
    return 'Back to the atlas';
  }

  // ----------------------------------------------------------------- state
  const state = { mode: null, round: 0, flags: [], results: [], total: 0, meta: null };
  let manifest, board, picker, dailyOrder, dailySubstitutes, excluded;

  // ----------------------------------------------------------------- boot
  async function init() {
    manifest = await Assets.manifestLoad();
    // Flags listed in manifest.excluded (tools/countries.py EXCLUDED) are temporarily out of play.
    // The Daily order is still shuffled from the FULL catalogue, so every other day keeps its flag;
    // only days that land on an excluded flag are swapped for a substitute (a second fixed shuffle
    // of the playable flags), so removing or restoring a flag never reshuffles the calendar.
    excluded = new Set(manifest.excluded || []);
    const byCode = manifest.flags.slice().sort((a, b) => a.code.localeCompare(b.code));
    dailyOrder = seededShuffle(byCode, CONFIG.dailySeed);
    dailySubstitutes = seededShuffle(byCode.filter(f => !excluded.has(f.code)), CONFIG.dailySeed + 1);
    setLogoFlag();

    board = new window.FlagBoard($('flag-canvas'));
    picker = new window.Picker($('picker'), { onChange: hex => { board.currentColour = hex; } });
    board.currentColour = picker.hex;
    board.onFill = (id, hex) => { picker.remember(hex); updateProgress(); };

    $('btn-daily').addEventListener('click', startDaily);
    $('btn-quick').addEventListener('click', startQuick);
    $('btn-home').addEventListener('click', goHome);
    $('btn-final-home').addEventListener('click', goHome);
    $('btn-again').addEventListener('click', startQuick);
    $('btn-clear').addEventListener('click', () => { board.clear(); updateProgress(); });
    $('btn-submit').addEventListener('click', submit);
    $('btn-how').addEventListener('click', () => $('modal-how').hidden = false);
    $('btn-how-close').addEventListener('click', () => $('modal-how').hidden = true);
    $('modal-how').addEventListener('click', e => { if (e.target.id === 'modal-how') e.target.hidden = true; });

    refreshDailyCard(); refreshStreaks();
    if (new URLSearchParams(location.search).has('daily')) startDaily();
  }

  function goHome() {
    state.mode = null; refreshDailyCard(); refreshStreaks(); show('screen-home');
    history.replaceState(null, '', location.pathname);
  }

  // ----------------------------------------------------------------- home logo (decorative only, unrelated to the daily challenge)
  function setLogoFlag() {
    const img = $('logo-flag-img');
    if (!img) return;
    const rnd = mulberry32(Number(utcDateKey().replace(/-/g, '')));
    const pick = manifest.flags[Math.floor(rnd() * manifest.flags.length)];
    img.src = Assets.url(pick.code, 'svg');
    img.alt = `${pick.name} flag`;
  }

  // ----------------------------------------------------------------- daily card
  function todaysDaily() {
    const n = dayNumber();
    let meta = dailyOrder[((n % dailyOrder.length) + dailyOrder.length) % dailyOrder.length];
    if (excluded.has(meta.code)) meta = dailySubstitutes[((n % dailySubstitutes.length) + dailySubstitutes.length) % dailySubstitutes.length];
    return { number: n + 1, meta, key: utcDateKey() };
  }
  function refreshDailyCard() {
    const d = todaysDaily(), played = store.get('daily:' + d.key);
    $('daily-kicker').textContent = `Daily Challenge · #${d.number}`;
    if (played) {
      $('daily-title').textContent = `${d.meta.name}: ${played.points}/1000`;
      $('daily-desc').textContent = 'You\'ve done today\'s flag. See your result, compare with other players and share.';
    } else {
      $('daily-title').textContent = "Today's flag";
      $('daily-desc').textContent = 'One flag, one attempt, the same for everyone. See how you rank and share your score.';
    }
  }

  // ----------------------------------------------------------------- streaks
  // A day counts once you've played it: the Daily Challenge, or a finished Quick Play game. Days are UTC, like the
  // daily reset. Daily streaks are read straight from the saved daily results, so players who were already playing
  // keep theirs; Quick Play keeps a small per-day log of its own. Both live in this browser only.
  const MILESTONES = { 3: 'Hat-trick', 7: 'One week', 14: 'Two weeks', 30: 'One month', 50: '50 days', 100: 'Century', 365: 'One year' };
  const FLAME = '<svg class="flame" aria-hidden="true"><use href="#i-flame"/></svg>';
  const quickLog = () => store.get('qdays', {});
  function dailyLog(today, points) {
    const log = points == null ? {} : { [today]: { n: 1, sum: points } };   // today's score is kept in memory in case storage is blocked
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = /^tc:daily:(\d{4}-\d{2}-\d{2})$/.exec(localStorage.key(i));
        const rec = m && store.get('daily:' + m[1]);
        if (rec && Number.isFinite(rec.points)) log[m[1]] = { n: 1, sum: rec.points };
      }
    } catch (e) { /* storage unavailable */ }
    return log;
  }

  // Home screen: a pill on each mode card, e.g. "3-day streak · play today to keep it".
  function refreshStreaks() {
    const today = utcDateKey();
    streakPill($('daily-streak'), S.compute(dailyLog(today), today), 'play today to keep it', 'Play today to start a streak');
    streakPill($('quick-streak'), S.compute(quickLog(), today), 'finish a game today to keep it', 'Finish a game to start a streak');
  }
  function streakPill(el, s, keep, start) {
    el.className = 'streak-pill' + (s.current ? ' on' : '') + (s.atRisk ? ' risk' : '');
    el.innerHTML = FLAME + (s.current ? `${s.current}-day streak · ${s.atRisk ? keep : 'done today'}` : start);
    el.hidden = false;
  }

  // Results: "Played 5 days in a row · averaging 874/1000". `fresh` means it was just earned, so the number counts up from the old one.
  function streakCard(el, kind, s, fresh) {
    const rolls = fresh && s.current > 1;   // a brand-new streak has no earlier number to roll up from; the flame just lights
    const num = `<span class="sc-num"><span class="sc-roll${rolls ? ' rolls' : ''}">${rolls ? `<i aria-hidden="true">${s.current - 1}</i>` : ''}<i>${s.current}</i></span></span>`;
    const best = s.best > s.current ? ` · Best ${s.best}` : '';
    const sub = s.current > 1 ? `Averaging <b>${s.avg}</b>/1000${kind === 'quick' ? ' per flag' : ''}${best}` : `Come back tomorrow to make it 2${best}`;
    el.className = `streak-card ${kind}${fresh ? ' fresh' : ''}`;
    el.innerHTML = `
      <div class="sc-flame">${FLAME}</div>
      <div>
        <div class="sc-kicker">${kind === 'daily' ? 'Daily' : 'Quick Play'} streak${MILESTONES[s.current] ? `<span class="sc-badge">${MILESTONES[s.current]}</span>` : ''}</div>
        <div class="sc-head">${s.current > 1 ? `Played ${num} days in a row` : `Streak started: day ${num}`}</div>
        <div class="sc-sub">${sub}</div>
      </div>
      <div class="sc-week" aria-hidden="true">${s.week.map((d, i) => `<i class="${d.played ? 'on' : ''}${i === 6 ? ' today' : ''}">${d.initial}</i>`).join('')}</div>`;
    el.hidden = false;
  }

  // A finished Quick Play game counts for the day. Credited as soon as the fifth flag is submitted, not when the final screen opens.
  function finishQuick() {
    const today = utcDateKey(), before = quickLog() || {}, log = S.record(before, today, state.results.length, state.total);
    store.set('qdays', log);
    state.streak = Object.assign(S.compute(log, today), { fresh: !before[today] });   // only a day's first game moves the streak
    if (state.streak.fresh) track('streak', { mode: 'quick', days: state.streak.current });
  }

  // ----------------------------------------------------------------- modes
  function startDaily() {
    const d = todaysDaily(), played = store.get('daily:' + d.key);
    state.mode = 'daily'; state.round = 0; state.flags = [d.meta]; state.results = []; state.total = 0; state.daily = d;
    track('start_daily', { daily_number: d.number, country: d.meta.name });
    if (played) {
      const fills = new Map(played.fills);
      showResult(d.meta, fills, scoreAttempt(d.meta, fills), played.stats || null, true);
      return;
    }
    beginRound();
  }
  function startQuick() {
    const pool = manifest.flags.filter(f => !excluded.has(f.code));
    const picks = [];
    while (picks.length < CONFIG.rounds && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    state.mode = 'quick'; state.round = 0; state.flags = picks; state.results = []; state.total = 0; state.streak = null;
    track('start_quick');
    beginRound();
  }

  async function beginRound() {
    const meta = state.flags[state.round]; state.meta = meta;
    show('screen-play');
    $('country-name').textContent = meta.name.toUpperCase();
    $('round-label').textContent = state.mode === 'daily' ? `Daily #${state.daily.number}` : `Round ${state.round + 1} of ${CONFIG.rounds}`;
    $('score-chip').hidden = state.mode !== 'quick';
    $('score-total').textContent = fmt(state.total);
    $('prefill-note').hidden = !(meta.prefilled > 0);
    $('flag-loading').hidden = false;
    board.interactive = false;
    picker.clearRecent();
    await board.load(meta);
    board.interactive = true;
    $('flag-loading').hidden = true;
    updateProgress();
  }

  function updateProgress() {
    const n = state.meta.regions.length, f = board.filledCount;
    $('progress-text').textContent = f === n ? `All ${n} regions filled — ready to submit` : `${f} of ${n} region${n === 1 ? '' : 's'} filled`;
    $('progress-fill').style.width = (f / n * 100) + '%';
    $('btn-submit').disabled = f < n;
  }

  async function submit() {
    if (board.filledCount < state.meta.regions.length) return;
    const meta = state.meta, fills = new Map(board.fills);
    const result = scoreAttempt(meta, fills);
    state.results.push({ meta, result, fills });
    state.total += result.points;
    track(state.mode === 'daily' ? 'daily_complete' : 'round_complete', { country: meta.name, score: result.points, round: state.round + 1 });

    if (state.mode === 'daily') {
      const saved = { points: result.points, fills: [...fills], stats: null };
      store.set('daily:' + state.daily.key, saved);
      showResult(meta, fills, result, null, true, true);
      submitDailyScore(result.points).then(stats => {
        if (stats) { saved.stats = stats; store.set('daily:' + state.daily.key, saved); renderDailyStats(stats, result.points); }
        else renderDailyStats(null, result.points);
      });
    } else {
      if (state.round + 1 >= CONFIG.rounds) finishQuick();
      showResult(meta, fills, result, null, false);
    }
  }

  // ----------------------------------------------------------------- results
  // `fresh` = this attempt was just submitted (as opposed to reopening today's saved result), which is when the streak animates.
  async function showResult(meta, fills, result, stats, isDaily, fresh) {
    show('screen-result');
    $('result-kicker').textContent = isDaily ? `Daily Challenge #${state.daily.number}` : `Round ${state.round + 1} of ${CONFIG.rounds}`;
    $('result-country').textContent = meta.name.toUpperCase();
    $('result-verdict').textContent = C.verdict(result.points);
    animateNumber($('result-points'), result.points);

    const flag = await Assets.loadFlag(meta.code);
    window.FlagBoard.paintInto($('result-yours'), flag, fills);
    const ac = $('result-actual'); ac.width = flag.w; ac.height = flag.h;
    ac.getContext('2d').drawImage(flag.img, 0, 0, flag.w, flag.h);

    $('breakdown').innerHTML = result.rows.map(g => `
      <div class="bd-row">
        <div class="bd-swatches">
          <span class="sw" style="background:${g.yours}" title="Yours ${g.yours}"></span>
          <span class="sw-arrow">→</span>
          <span class="sw" style="background:${g.hex}" title="Actual ${g.hex}"></span>
        </div>
        <div class="bd-name">${C.describe(g.hex)}${g.count > 1 ? ` <small>(×${g.count} regions)</small>` : ''}<small>${g.yours.toUpperCase()} vs ${g.hex.toUpperCase()}</small></div>
        <div class="bd-verdict v-${g.verdict.replace(/\s/g, '').toLowerCase()}">${g.verdict}</div>
        <div class="bd-points">${g.points}</div>
      </div>`).join('');

    const actions = $('result-actions');
    const ds = $('daily-stats');
    if (isDaily) {
      const streak = S.compute(dailyLog(state.daily.key, result.points), state.daily.key);
      streakCard($('result-streak'), 'daily', streak, fresh);
      if (fresh) track('streak', { mode: 'daily', days: streak.current });
      ds.hidden = false;
      if (stats) renderDailyStats(stats, result.points); else ds.innerHTML = '<div class="ds-loading">Comparing with other players…</div>';
      actions.innerHTML = `<button class="btn primary" id="btn-share">Share result</button><button class="btn ghost" id="btn-res-home">Menu</button>`;
      $('btn-share').addEventListener('click', () => share(meta, result));
      $('btn-res-home').addEventListener('click', goHome);
    } else {
      $('result-streak').hidden = true;
      ds.hidden = true;
      const last = state.round + 1 >= CONFIG.rounds;
      actions.innerHTML = `<button class="btn primary" id="btn-next">${last ? 'See final score' : 'Next flag'}</button>`;
      $('btn-next').addEventListener('click', () => { if (last) showFinal(); else { state.round++; beginRound(); } });
    }
  }

  function renderDailyStats(stats, points) {
    const ds = $('daily-stats');
    if (!stats) { ds.innerHTML = '<div class="ds-loading">Couldn\'t reach the leaderboard right now — your score is saved on this device.</div>'; return; }
    const others = Math.max(0, stats.count - 1);
    const beat = Math.round((stats.beat || 0) * 100);
    ds.innerHTML = `
      <div class="ds-item"><span class="ds-num">${fmt(stats.avg)}</span><span class="ds-label">average score today</span></div>
      <div class="ds-item"><span class="ds-num">${others ? beat + '%' : '—'}</span><span class="ds-label">${others ? 'of players you beat' : 'first to play today!'}</span></div>
      <div class="ds-item"><span class="ds-num">${fmt(stats.count)}</span><span class="ds-label">player${stats.count === 1 ? '' : 's'} so far</span></div>`;
  }

  function showFinal() {
    show('screen-final');
    const max = CONFIG.rounds * 1000;
    animateNumber($('final-points'), state.total);
    $('final-verdict').textContent = `${overallVerdict(state.total, max)} · ${Math.round(state.total / max * 100)}% accuracy`;
    if (state.streak) streakCard($('final-streak'), 'quick', state.streak, state.streak.fresh); else $('final-streak').hidden = true;
    $('rounds-list').innerHTML = state.results.map((r, i) => `
      <div class="rl-row"><span class="rl-n">${i + 1}</span><span class="rl-name">${r.meta.name}</span><span class="rl-bar"><i style="width:${r.result.points / 10}%"></i></span><span class="rl-pts">${r.result.points}</span></div>`).join('');
    track('quick_complete', { score: state.total });
  }

  function animateNumber(el, target) {
    const start = performance.now(), dur = 900;
    const step = now => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ----------------------------------------------------------------- daily API
  async function submitDailyScore(points) {
    try {
      const res = await fetch(CONFIG.api + '/api/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: state.daily.key, score: points, cid: clientId() }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // ----------------------------------------------------------------- share
  async function share(meta, result) {
    const url = location.origin + location.pathname + '?daily';
    const s = S.compute(dailyLog(state.daily.key, result.points), state.daily.key);
    const streak = s.current > 1 ? `🔥 Streak: ${s.current} days in a row · avg ${s.avg}/1000` : '🔥 Streak: day 1';
    const text = `${CONFIG.siteName} · Daily #${state.daily.number} · ${meta.name}\nMy accuracy: ${result.points}/1000 ${emojiBar(result.groups)}\n${streak}\nThink you can do better? ${url}`;
    track('share', { daily_number: state.daily.number });
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard — paste it anywhere'); }
    catch (e) { prompt('Copy your result:', text); }
  }

  // dev hook: TC.play(['pw','np']) starts a quick game with chosen flags
  window.TC = { play(codes) { state.mode = 'quick'; state.round = 0; state.results = []; state.total = 0;
    state.flags = codes.map(c => manifest.flags.find(f => f.code === c)); beginRound(); }, state, scoreAttempt,
    get board() { return board; }, get manifest() { return manifest; } };

  init().catch(err => { console.error(err); alert('Sorry, the game failed to load: ' + err.message); });
})();
