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
  // A random id for this browser, made the first time it is needed. 96 random bits, nothing else in it. (Ids made by older
  // versions were Math.random() plus the time; they keep working, and are never sent as they are either.)
  function clientId() {
    let id = store.get('cid');
    if (!id) {
      try { id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join(''); }
      catch (e) { id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
      store.set('cid', id);
    }
    return id;
  }
  // What the leaderboard gets in place of the id: a one-way hash of the id and the day. That is enough to tell two players on
  // the same day apart (all it needs), but it is different every day and can't be turned back into the id, so nothing on the
  // server can follow a player from one day to the next. Without WebCrypto (an insecure page) nothing is sent at all.
  async function dayCode(key) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientId() + ':' + key));
    return [...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function show(screenId) {
    const target = $(screenId), changed = !target.classList.contains('active');
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s === target));
    window.scrollTo(0, 0);
    if (changed) queueMicrotask(() => focusHeading(target));         // after the caller has filled the screen in
  }
  // A new screen: put focus on its heading so keyboard and screen-reader users know where they are. tabindex -1 lets
  // it take focus without joining the tab order.
  function focusHeading(screen) {
    const h = screen.classList.contains('active') && screen.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');     // a live region: it stays in the page so changes get announced
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { if (!t.classList.contains('show')) t.textContent = ''; }, 300); }, 2200);
  }
  const fmt = n => Math.round(n).toLocaleString('en-GB');
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(key) { const d = new Date(key + 'T00:00:00Z'); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }
  const dayIdx = key => dayNumber(new Date(key + 'T00:00:00Z'));                          // 0 = Daily #1
  const keyAt = i => utcDateKey(new Date(CONFIG.dailyEpoch + i * 86400000));
  const EPOCH_KEY = utcDateKey(new Date(CONFIG.dailyEpoch));
  // ?nopost (or #nopost) stops this tab sending scores to the leaderboard. For trying out a preview deployment, which
  // shares the live database. It sticks for the tab, so it survives moving around the game.
  const NO_POST = (() => {
    const asked = /[?&]nopost\b|#nopost\b/.test(location.search + location.hash);
    try { if (asked) sessionStorage.setItem('tc:nopost', '1'); return asked || sessionStorage.getItem('tc:nopost') === '1'; } catch (e) { return asked; }
  })();

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
  let renderId = 0;   // bumped on every navigation, so a render that was waiting on a download can tell the player has moved on

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
    board.onAnnounce = text => { $('board-status').textContent = text; };
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
    $('btn-how').addEventListener('click', openHow);
    $('btn-how-close').addEventListener('click', closeHow);
    $('modal-how').addEventListener('click', e => { if (e.target.id === 'modal-how') closeHow(); });
    document.addEventListener('keydown', e => {
      if ($('modal-how').hidden) return;
      if (e.key === 'Escape') return closeHow();
      if (e.key !== 'Tab') return;                                  // keep Tab going round inside the dialog
      const f = [...$('modal-how').querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent);
      if (!f.length) return;
      const end = e.shiftKey ? f[0] : f[f.length - 1];
      if (document.activeElement === end) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
    });
    document.addEventListener('click', onNavClick);
    $('btn-result-back').addEventListener('click', goHome);
    $('btn-archive-back').addEventListener('click', () => (state.calFromHome ? goHome() : openDay(state.daily.key)));

    refreshDailyCard(); refreshStreaks();
    if (new URLSearchParams(location.search).has('daily')) startDaily();
  }

  // While the dialog is open the rest of the page is inert, so Tab can't wander behind it.
  let howOpener = null;
  function openHow() {
    howOpener = document.activeElement;
    $('main').inert = true; $('modal-how').hidden = false;
    $('btn-how-close').focus();
  }
  function closeHow() {
    $('modal-how').hidden = true; $('main').inert = false;
    if (howOpener && document.contains(howOpener)) howOpener.focus({ preventScroll: true });
  }

  function goHome() {
    renderId++;
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
  // The daily for any date. `meta` is the flag served today (a substitute if the original has since been taken out of
  // play); `raw` is what the full-catalogue shuffle gives, i.e. what was served before flags could be excluded.
  function dailyFor(key) {
    const n = dayIdx(key), pick = (list, i) => list[((i % list.length) + list.length) % list.length];
    const raw = pick(dailyOrder, n);
    return { number: n + 1, meta: excluded.has(raw.code) ? pick(dailySubstitutes, n) : raw, raw, key };
  }
  const todaysDaily = () => dailyFor(utcDateKey());
  function refreshDailyCard() {
    const d = todaysDaily(), played = recordOf(d.key);
    $('daily-kicker').textContent = `Daily Challenge · #${d.number}`;
    if (played) {
      $('daily-title').textContent = `${d.meta.name}: ${played.points}/1000`;
      $('daily-desc').textContent = 'You\'ve done today\'s flag. See your result, share it, or catch up on past days.';
    } else {
      $('daily-title').textContent = "Today's flag";
      $('daily-desc').textContent = 'One flag, one attempt, the same for everyone. See how you rank and share your score.';
    }
    $('btn-archive').hidden = !played;     // past days unlock once today's daily is done
    $('nopost-note').hidden = !NO_POST;
  }

  // ----------------------------------------------------------------- streaks
  // A day counts once you've played it: the Daily Challenge, or a finished Quick Play game. Days are UTC, like the
  // daily reset. Daily streaks are read straight from the saved daily results, so players who were already playing
  // keep theirs; Quick Play keeps a small per-day log of its own. Both live in this browser only.
  const MILESTONES = { 3: 'Hat-trick', 7: 'One week', 14: 'Two weeks', 30: 'One month', 50: '50 days', 100: 'Century', 365: 'One year' };
  const FLAME = '<svg class="flame" aria-hidden="true"><use href="#i-flame"/></svg>';
  const quickLog = () => store.get('qdays', {});
  // One saved result per day, tc:daily:<date> = { points, fills, code, v, late?, stats }. `late` marks a catch-up: a day
  // played after its own date, which counts towards the all-time numbers but never towards a streak. Results saved before
  // `code`/`v` existed are still read (see resolvePlayed). `mem` holds this session's results in case storage is blocked.
  const mem = {};
  const recordOf = key => { const rec = mem[key] || store.get('daily:' + key); return rec && Number.isFinite(rec.points) ? rec : null; };
  const archiveOpen = () => !!recordOf(utcDateKey());     // past days unlock once today's daily is done
  function dailyLog() {
    const log = {}, add = (key, rec) => { if (rec && Number.isFinite(rec.points)) log[key] = rec.late ? { n: 1, sum: rec.points, late: true } : { n: 1, sum: rec.points }; };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = /^tc:daily:(\d{4}-\d{2}-\d{2})$/.exec(localStorage.key(i));
        if (m) add(m[1], store.get('daily:' + m[1]));
      }
    } catch (e) { /* storage unavailable */ }
    for (const key in mem) add(key, mem[key]);
    return log;
  }

  // Home screen: a pill on each mode card, e.g. "3-day streak · play today to keep it".
  function refreshStreaks() {
    const today = utcDateKey();
    streakPill($('daily-streak'), S.compute(dailyLog(), today), 'play today to keep it', 'Play today to start a streak');
    streakPill($('quick-streak'), S.compute(quickLog(), today), 'finish a game today to keep it', 'Finish a game to start a streak');
  }
  function streakPill(el, s, keep, start) {
    el.className = 'streak-pill' + (s.current ? ' on' : '') + (s.atRisk ? ' risk' : '');
    el.innerHTML = FLAME + (s.current ? `${s.current}-day streak · ${s.atRisk ? keep : 'done today'}` : start);
    el.hidden = false;
  }

  // A number that counts up from the one before it (old above new, clipped to one line; the CSS slides the new one in).
  const rolled = (value, rolls) => `<span class="sc-num"><span class="sc-roll${rolls ? ' rolls' : ''}">${rolls ? `<i aria-hidden="true">${value - 1}</i>` : ''}<i>${value}</i></span></span>`;
  // The last seven days as dots. On the daily cards each day is a button into the archive (played on time, caught up
  // late, or not played); `log` being absent means Quick Play, where the strip is only a picture.
  function weekStrip(s, log, view) {
    return s.week.map((d, i) => {
      const cls = 'sc-day' + (d.played ? ' on' : d.late ? ' late' : '') + (i === 6 ? ' today' : '') + (d.key === view ? ' view' : '');
      if (!log) return `<i class="${cls}">${d.initial}</i>`;
      if (d.key < EPOCH_KEY) return `<i class="${cls} off">${d.initial}</i>`;           // before the first daily
      const what = d.played ? `played, ${log[d.key].sum}` : d.late ? `caught up late, ${log[d.key].sum}` : 'not played yet';
      return `<button class="${cls}" data-day="${d.key}" aria-label="Daily #${dayIdx(d.key) + 1}, ${fmtDay(d.key)}: ${what}"${d.key === view ? ' aria-current="date"' : ''}>${d.initial}</button>`;
    }).join('');
  }

  // Results: "Played 5 days in a row · averaging 874/1000". `fresh` means it was just earned, so the number counts up from the old one.
  // Passing the daily `log` makes the week strip tappable and adds the "All days" footer.
  function streakCard(el, kind, s, fresh, log) {
    const rolls = fresh && s.current > 1;   // a brand-new streak has no earlier number to roll up from; the flame just lights
    const num = rolled(s.current, rolls);
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
      <div class="sc-week"${log ? ' role="group" aria-label="The last seven days"' : ' aria-hidden="true"'}>${weekStrip(s, log, null)}</div>
      ${log ? '<div class="sc-foot"><span>Tap a day to catch up or look back</span><button class="sc-link" data-nav="calendar">All days ›</button></div>' : ''}`;
    el.hidden = false;
  }

  // Results for a past day: where it sits in the all-time record. A catch-up can't touch the streak, so what it moves
  // is the played count and the all-time average (which includes late days, unlike the streak's own average).
  function archiveCard(el, d, log, fresh) {
    const today = utcDateKey(), s = S.compute(log, today), late = !!(log[d.key] && log[d.key].late), earned = fresh && late;
    const rest = Object.assign({}, log); delete rest[d.key];
    const delta = earned ? s.avgAll - S.compute(rest, today).avgAll : 0;
    el.className = 'streak-card daily archive' + (earned ? ' fresh' : '');
    el.innerHTML = `
      <div class="sc-flame"><svg class="cal-ico" aria-hidden="true"><use href="#i-calendar"/></svg></div>
      <div>
        <div class="sc-kicker">Past daily<span class="sc-badge">${late ? 'Played late' : 'On the day'}</span></div>
        <div class="sc-head">Played ${rolled(s.total, earned && s.total > 1)} of ${dayIdx(today) + 1} dailies</div>
        <div class="sc-sub">All-time average <b>${s.avgAll}</b>/1000${delta ? ` <span class="sc-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>` : ''}</div>
      </div>
      <div class="sc-week">${weekStrip(s, log, d.key)}</div>
      <div class="sc-foot"><span>${late ? 'Counts towards your averages, not your streak or the leaderboard.' : 'Tap a day to catch up or look back'}</span><button class="sc-link" data-nav="calendar">All days ›</button></div>`;
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
  // Opens any day's daily: today's or, once today's is done, a past one. A day with a saved result always shows its
  // result, so there is never a second attempt; a day not yet played starts a play, and on a past day that's a catch-up.
  function openDay(key) {
    const today = utcDateKey(), i = dayIdx(key);
    if (key !== today && !(i >= 0 && i <= dayIdx(today))) return;              // no past days before Daily #1, after today, or that aren't dates
    renderId++;
    if (key !== today && !archiveOpen()) { toast("Play today's daily to unlock past days"); return openDay(today); }
    const d = dailyFor(key), rec = recordOf(key);
    d.late = rec ? !!rec.late : key !== today;
    state.mode = 'daily'; state.round = 0; state.flags = [d.meta]; state.results = []; state.total = 0; state.daily = d;
    if (key === today) track('start_daily', { daily_number: d.number, country: d.meta.name });
    if (rec) return showPlayed(d, rec);
    if (key !== today) track('start_archive', { daily_number: d.number, country: d.meta.name });
    beginRound();
  }
  const startDaily = () => openDay(utcDateKey());
  function startQuick() {
    renderId++;
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
    $('flag-canvas').setAttribute('aria-label', `Flag of ${meta.name} to colour in: ${meta.regions.length} region${meta.regions.length === 1 ? '' : 's'}`);
    $('board-status').textContent = '';
    const daily = state.mode === 'daily', stepper = daily && archiveOpen();    // once past days are unlocked, the day stepper replaces the label
    $('round-label').textContent = daily ? `Daily #${state.daily.number}` : `Round ${state.round + 1} of ${CONFIG.rounds}`;
    $('round-label').hidden = stepper;
    $('play-daynav').hidden = $('btn-play-cal').hidden = !stepper;
    if (stepper) dayNav($('play-daynav'), state.daily.key);
    $('archive-note').hidden = !(daily && state.daily.late);
    $('score-chip').hidden = state.mode !== 'quick';
    $('score-total').textContent = fmt(state.total);
    $('prefill-note').hidden = !(meta.prefilled > 0);
    $('flag-loading').hidden = false;
    board.interactive = false;
    picker.clearRecent();
    if (!(await board.load(meta))) return;                     // the player moved on while this flag was downloading
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
    const late = state.mode === 'daily' && state.daily.late;
    track(state.mode === 'daily' ? (late ? 'archive_complete' : 'daily_complete') : 'round_complete', { country: meta.name, score: result.points, round: state.round + 1 });

    if (state.mode === 'daily') {
      const key = state.daily.key, saved = { points: result.points, fills: [...fills], code: meta.code, v: meta.v, stats: null };
      if (late) saved.late = true;
      mem[key] = saved; store.set('daily:' + key, saved);
      showResult(meta, fills, result, null, true, true);
      if (late || NO_POST) return;                         // catch-ups never go to the leaderboard
      const lb = state.lb = { key, done: false, stats: null };   // the reply can beat the result screen to it (a quick failure), so the screen checks here too
      submitDailyScore(result.points).then(stats => {
        lb.done = true; lb.stats = stats;
        if (stats) { saved.stats = stats; store.set('daily:' + key, saved); }
        // the player may have moved on to another day while this was in flight
        if (state.daily && state.daily.key === key && $('screen-result').classList.contains('active')) renderDailyStats(stats, result.points);
      });
    } else {
      if (state.round + 1 >= CONFIG.rounds) finishQuick();
      showResult(meta, fills, result, null, false);
    }
  }

  // ----------------------------------------------------------------- results
  // `fresh` = this attempt was just submitted (as opposed to reopening today's saved result), which is when the streak animates.
  async function showResult(meta, fills, result, stats, isDaily, fresh) {
    const mine = ++renderId;
    show('screen-result');
    $('screen-result').classList.remove('stale', 'noflag');
    $('result-topbar').hidden = !isDaily;
    $('result-kicker').textContent = isDaily ? `Daily Challenge${state.daily.key === utcDateKey() ? '' : ' · Past day'}` : `Round ${state.round + 1} of ${CONFIG.rounds}`;
    $('result-country').textContent = meta.name.toUpperCase();
    $('result-verdict').textContent = C.verdict(result.points);
    animateNumber($('result-points'), result.points);
    $('result-summary').textContent = `${meta.name}: ${result.points} out of 1000. ${C.verdict(result.points)}.`;
    $('result-yours').setAttribute('aria-label', `Your colouring of the flag of ${meta.name}; the colours you used are listed below`);
    $('result-actual').setAttribute('aria-label', `The real flag of ${meta.name}; its colours are listed below`);

    const flag = await Assets.loadFlag(meta.code);
    if (mine !== renderId) return;                                    // superseded while the flag was downloading
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
      const d = state.daily;
      dayExtras(d, fresh, () => share(meta, result));
      if (d.late) ds.hidden = true;                                  // a catch-up has no leaderboard numbers
      else if (stats) { ds.hidden = false; renderDailyStats(stats, result.points, d.key !== utcDateKey()); }
      else if (fresh) {
        ds.hidden = false;
        if (state.lb && state.lb.key === d.key && state.lb.done) renderDailyStats(state.lb.stats, result.points);     // the reply already arrived
        else ds.innerHTML = `<div class="ds-loading">${NO_POST ? 'Leaderboard is off in this tab (?nopost): your score is saved on this device only.' : 'Comparing with other players…'}</div>`;
      }
      else ds.hidden = true;                                         // reopened with no leaderboard numbers saved
    } else {
      $('result-streak').hidden = true;
      ds.hidden = true;
      const last = state.round + 1 >= CONFIG.rounds;
      actions.innerHTML = `<button class="btn primary" id="btn-next">${last ? 'See final score' : 'Next flag'}</button>`;
      $('btn-next').addEventListener('click', () => { if (last) showFinal(); else { state.round++; beginRound(); } });
    }
  }

  // `past` = these are the numbers saved from when a past day was played, so say "that day" rather than "today".
  function renderDailyStats(stats, points, past) {
    const ds = $('daily-stats');
    if (!stats) { ds.innerHTML = '<div class="ds-loading">Couldn\'t reach the leaderboard right now — your score is saved on this device.</div>'; return; }
    const others = Math.max(0, stats.count - 1);
    const beat = Math.round((stats.beat || 0) * 100);
    ds.innerHTML = `
      <div class="ds-item"><span class="ds-num">${fmt(stats.avg)}</span><span class="ds-label">average score ${past ? 'that day' : 'today'}</span></div>
      <div class="ds-item"><span class="ds-num">${others ? beat + '%' : '—'}</span><span class="ds-label">${others ? 'of players you beat' : past ? 'first to play' : 'first to play today!'}</span></div>
      <div class="ds-item"><span class="ds-num">${fmt(stats.count)}</span><span class="ds-label">player${stats.count === 1 ? '' : 's'} ${past ? 'that day' : 'so far'}</span></div>`;
  }

  // ----------------------------------------------------------------- past days (the archive)
  const CHEV_L = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-chev-l"/></svg>';
  const CHEV_R = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-chev-r"/></svg>';

  // Which flag a saved result is for, and whether the result still fits it. Results saved before the archive existed don't
  // record the flag, and flags have been redrawn since, so try the likely candidates and keep the one that reproduces the
  // saved score. If none does, the colouring can't be shown any more.
  function resolvePlayed(d, rec) {
    const known = rec.code ? manifest.flags.find(f => f.code === rec.code) : d.meta === d.raw ? d.meta : null;   // no saved flag id: still certain if no swap was involved
    let fills; try { fills = new Map(rec.fills); } catch (e) { return { meta: known || null }; }
    for (const meta of known ? [known] : [d.meta, d.raw].filter((m, i, all) => all.indexOf(m) === i)) {
      const result = scoreAttempt(meta, fills);
      if (result.points === rec.points && meta.regions.every(r => fills.has(r.id))) return { meta, fills, result };
    }
    return { meta: known || null };
  }

  function showPlayed(d, rec) {
    const r = resolvePlayed(d, rec);
    if (!r.result) return showStale(d, rec, r.meta);
    d.meta = r.meta; state.flags = [r.meta];
    showResult(r.meta, r.fills, r.result, rec.stats || null, true, false);
  }

  // A played day whose flag has since been redrawn: no flag or breakdown to show, but the score still stands.
  async function showStale(d, rec, meta) {
    const mine = ++renderId;
    show('screen-result');
    $('screen-result').classList.add('stale');
    $('screen-result').classList.toggle('noflag', !meta);
    $('result-kicker').textContent = `Daily Challenge${d.key === utcDateKey() ? '' : ' · Past day'}`;
    $('result-country').textContent = meta ? meta.name.toUpperCase() : `DAILY #${d.number}`;
    $('result-verdict').textContent = C.verdict(rec.points);
    animateNumber($('result-points'), rec.points);
    $('result-summary').textContent = `${meta ? meta.name : 'Daily #' + d.number}: ${rec.points} out of 1000. ${C.verdict(rec.points)}.`;
    if (meta) $('result-actual').setAttribute('aria-label', `The real flag of ${meta.name}`);
    const ds = $('daily-stats'); ds.hidden = false;
    const used = [...new Set((Array.isArray(rec.fills) ? rec.fills : []).map(f => f && f[1]).filter(h => /^#[0-9a-f]{6}$/i.test(h)))].slice(0, 12);
    ds.innerHTML = `<div class="ds-loading">We can't redraw this one: the flag has been updated since you played, so your colouring no longer fits it. Your score still counts.${used.length ? `<span class="stale-sw" title="The colours you used">${used.map(h => `<i style="background:${h}"></i>`).join('')}</span>` : ''}</div>`;
    dayExtras(d, false, null);
    if (!meta) return;
    const flag = await Assets.loadFlag(meta.code);                // the real flag, so there is still something to look at
    if (mine !== renderId) return;
    const ac = $('result-actual'); ac.width = flag.w; ac.height = flag.h;
    ac.getContext('2d').drawImage(flag.img, 0, 0, flag.w, flag.h);
  }

  // The ‹ date › stepper at the top of the daily screens (once past days are unlocked). The arrows go a day at a time;
  // "next" is hidden on today, since there is nothing after it, and "previous" on Daily #1.
  function dayNav(el, key) {
    const today = utcDateKey(), i = dayIdx(key), had = el.contains(document.activeElement) ? document.activeElement.dataset.nav : null;
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Choose a day');
    el.innerHTML = `
      <button class="dn-btn" data-nav="prev" aria-label="Previous day"${i <= 0 ? ' data-off disabled' : ''}>${CHEV_L}</button>
      <span class="dn-label">#${i + 1} · ${key === today ? 'Today' : fmtDay(key)}</span>
      <button class="dn-btn" data-nav="next" aria-label="Next day"${key >= today ? ' data-off disabled' : ''}>${CHEV_R}</button>`;
    const again = had && el.querySelector(`[data-nav="${had}"]:not([disabled])`);     // stepping with the keyboard: stay on the same arrow
    if (again) again.focus({ preventScroll: true });
  }

  // Everything around a daily result that depends on which day it is: the stepper, the streak card (for a day played on
  // time and just earned, or today) or the archive card (any other), and the buttons.
  function dayExtras(d, fresh, onShare) {
    const today = utcDateKey(), log = dailyLog(), streakDay = !d.late && (fresh || d.key === today), canShare = streakDay && onShare;
    $('result-topbar').hidden = false;
    dayNav($('result-daynav'), d.key);
    if (streakDay) {
      const streak = S.compute(log, d.key);                  // as of the day just recorded, even if midnight has passed since
      streakCard($('result-streak'), 'daily', streak, fresh, log);
      if (fresh) track('streak', { mode: 'daily', days: streak.current });
    } else archiveCard($('result-streak'), d, log, fresh);
    $('result-actions').innerHTML = (canShare ? '<button class="btn primary" id="btn-share">Share result</button>' : d.key !== today ? '<button class="btn primary" data-nav="today">Back to today</button>' : '')
      + '<button class="btn ghost" data-nav="calendar">All days</button><button class="btn ghost" id="btn-res-home">Menu</button>';
    if (canShare) $('btn-share').addEventListener('click', onShare);
    $('btn-res-home').addEventListener('click', goHome);
    if (!document.activeElement || document.activeElement === document.body) focusHeading($('screen-result'));   // the button that was pressed has just been replaced
  }

  // The calendar of every daily so far, newest month first: tap a day to play or review it.
  function showArchive() {
    if (!archiveOpen()) return startDaily();
    const today = utcDateKey(), log = dailyLog(), s = S.compute(log, today), fromHome = state.mode !== 'daily', view = fromHome ? null : state.daily.key;
    state.calFromHome = fromHome;
    renderId++;
    show('screen-archive');
    $('archive-summary').innerHTML = `
      <div class="ds-item"><span class="ds-num">${s.total}<small>/${dayIdx(today) + 1}</small></span><span class="ds-label">dailies played</span></div>
      <div class="ds-item"><span class="ds-num">${s.avgAll}</span><span class="ds-label">all-time average</span></div>
      <div class="ds-item"><span class="ds-num">${s.best}</span><span class="ds-label">best streak</span></div>`;
    $('archive-grid').innerHTML = S.calendar(log, today, EPOCH_KEY).map(m => `
      <section class="cal-month">
        <h2>${m.label}</h2>
        <div class="cal-dow" aria-hidden="true">${[...'MTWTFSS'].map(c => `<i>${c}</i>`).join('')}</div>
        <div class="cal-grid">${'<i></i>'.repeat(m.lead)}${m.days.map(d => d.state === 'off' ? '<i></i>'
          : `<button class="cal-day ${d.state}${d.key === today ? ' today' : ''}${d.key === view ? ' view' : ''}" data-day="${d.key}" aria-label="Daily #${dayIdx(d.key) + 1}, ${fmtDay(d.key)}: ${d.state === 'on' ? `played, ${d.sum}` : d.state === 'late' ? `caught up late, ${d.sum}` : 'not played yet'}">${d.day}${d.sum == null ? '' : `<small>${d.sum}</small>`}</button>`).join('')}</div>
      </section>`).join('');
  }

  // One listener for everything that moves between days: the week dots and calendar cells (data-day) and the stepper,
  // "Back to today" and "All days" buttons (data-nav).
  function onNavClick(e) {
    const el = e.target.closest('[data-day],[data-nav]');
    if (!el || el.disabled) return;
    if (el.dataset.day) return openDay(el.dataset.day);
    const cur = state.daily ? state.daily.key : utcDateKey();
    switch (el.dataset.nav) {
      case 'prev': return openDay(keyAt(dayIdx(cur) - 1));
      case 'next': return openDay(keyAt(dayIdx(cur) + 1));
      case 'today': return openDay(utcDateKey());
      case 'calendar': return showArchive();
    }
  }

  function showFinal() {
    show('screen-final');
    const max = CONFIG.rounds * 1000;
    animateNumber($('final-points'), state.total);
    $('final-summary').textContent = `${state.total} out of ${max}. ${overallVerdict(state.total, max)}.`;
    $('final-verdict').textContent = `${overallVerdict(state.total, max)} · ${Math.round(state.total / max * 100)}% accuracy`;
    if (state.streak) streakCard($('final-streak'), 'quick', state.streak, state.streak.fresh); else $('final-streak').hidden = true;
    $('rounds-list').innerHTML = state.results.map((r, i) => `
      <div class="rl-row"><span class="rl-n">${i + 1}</span><span class="rl-name">${r.meta.name}</span><span class="rl-bar"><i style="width:${r.result.points / 10}%"></i></span><span class="rl-pts">${r.result.points}</span></div>`).join('');
    track('quick_complete', { score: state.total });
  }

  const REDUCED_MOTION = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function animateNumber(el, target) {
    if (REDUCED_MOTION.matches) { el.counting = 0; el.textContent = fmt(target); return; }
    const start = performance.now(), dur = 900;
    el.counting = start;                                       // a newer count-up on the same number takes over
    const step = now => {
      if (el.counting !== start) return;
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ----------------------------------------------------------------- daily API
  async function submitDailyScore(points) {
    const date = state.daily.key;                                // the day this score is for, even if the player has moved on by the time it is sent
    try {
      const res = await fetch(CONFIG.api + '/api/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, score: points, cid: await dayCode(date) }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // ----------------------------------------------------------------- share
  async function share(meta, result) {
    const url = location.origin + location.pathname + '?daily';
    const s = S.compute(dailyLog(), state.daily.key);
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
    state.flags = codes.map(c => manifest.flags.find(f => f.code === c)); beginRound(); }, state, scoreAttempt, openDay, dailyFor,
    get board() { return board; }, get manifest() { return manifest; } };

  init().catch(err => { console.error(err); alert('Sorry, the game failed to load: ' + err.message); });
})();
