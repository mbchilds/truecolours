/* spot.js - the "spot the real flag" mode (working title: True Colours): screens, rounds, feedback, saved result, share.
   Five flags a day, the same five for everyone (see spotgen.js). Each round shows several versions of one flag; the player
   taps the one they think is real, locks it in, and sees at once whether they were right. Score is the number right, out of 5.
   Standalone: it only needs FlagAssets (for the flag files) and the page's own screens. No scores are sent anywhere yet;
   the result lives in this browser as tc:spot:<date> = { r: [{ p: pickedIndex, c: correct }, ...] }. */
(function () {
  const G = window.SpotGen, Assets = window.FlagAssets;
  const SITE_NAME = 'FlagFill';                 // shown in the share text; change with the site name
  const LETTERS = 'ABCDEFGH';
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { const v = localStorage.getItem('tc:' + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let st = null, token = 0, toastTimer;

  // ---------------------------------------------------------------- helpers
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
    queueMicrotask(() => {                      // focus the heading so keyboard and screen-reader users know the screen changed
      const h = document.querySelector('#' + id + '.active h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  }
  function toast(msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const svgCache = new Map();
  function svgText(code) {
    if (!svgCache.has(code)) {
      svgCache.set(code, (async () => {
        if (window.EMBEDDED_FLAGS) {            // the single-file preview build keeps every flag as a data URL
          const u = window.EMBEDDED_FLAGS.svg[code], i = u.indexOf(',');
          return /;base64/.test(u.slice(0, i)) ? atob(u.slice(i + 1)) : decodeURIComponent(u.slice(i + 1));
        }
        const res = await fetch(Assets.url(code, 'svg'));
        if (!res.ok) throw new Error('flag ' + code + ' failed to load');
        return res.text();
      })().catch(e => { svgCache.delete(code); throw e; }));
    }
    return svgCache.get(code);
  }
  const dataUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const correctCount = () => st.results.filter(r => r.c).length;
  const verdictFor = n => (n === 5 ? 'Eagle eyes' : n === 4 ? 'Sharp' : n === 3 ? 'Not bad' : n === 2 ? 'Getting there' : 'Back to the atlas');

  // ---------------------------------------------------------------- home card
  function savedFor(key) { const s = store.get('spot:' + key); return s && Array.isArray(s.r) ? s.r : []; }
  function refreshHome() {
    const el = $('spot-desc'); if (!el) return;
    const r = savedFor(G.dayKey(Date.now()));
    el.textContent = r.length >= G.CONFIG.perDay
      ? `Today's flags: ${r.filter(x => x.c).length} of ${G.CONFIG.perDay} right. Tap to see your result.`
      : r.length ? `You're ${r.length} flags in today. Tap to carry on.`
      : 'Six versions of the same flag, one of them genuine. Five flags a day, the same five for everyone.';
  }

  // ---------------------------------------------------------------- playing
  async function start() {
    const manifest = await Assets.manifestLoad();
    const key = G.dayKey(Date.now()), codes = G.dailyCodes(key);
    st = {
      key, number: G.dayNumber(key), codes,
      names: codes.map(c => { const f = manifest.flags.find(x => x.code === c); return f ? f.name : c.toUpperCase(); }),
      results: savedFor(key).slice(0, codes.length), puzzle: null, selected: null, locked: false,
    };
    history.replaceState(null, '', location.pathname + '?spot');
    if (st.results.length >= codes.length) return showFinal();
    await beginRound();
  }

  async function beginRound() {
    const my = ++token, i = st.results.length, code = st.codes[i];
    st.puzzle = null; st.selected = null; st.locked = false;
    $('spot-round-label').textContent = `Round ${i + 1} of ${st.codes.length}`;
    $('spot-score').textContent = correctCount();
    $('spot-kicker').textContent = `True Colours · Daily #${st.number}`;
    $('spot-country').textContent = st.names[i].toUpperCase();
    $('spot-prompt').textContent = `One of these is the real flag of ${st.names[i]}. Which one?`;
    $('spot-grid').innerHTML = '<div class="spot-loading"><div class="spinner"></div></div>';
    $('spot-feedback').hidden = true; $('spot-feedback').className = 'spot-feedback';
    setLock('Choose a flag', false); $('btn-spot-lock').hidden = false; $('btn-spot-next').hidden = true;
    showScreen('screen-spot');
    let svg;
    try { svg = await svgText(code); } catch (e) { if (my === token) { toast('Could not load that flag. Check your connection.'); goHome(); } return; }
    if (my !== token) return;                   // the player left, or moved on, while the flag was loading
    st.puzzle = G.puzzleFor(st.key, code, svg);
    renderGrid();
    if (i + 1 < st.codes.length) svgText(st.codes[i + 1]).catch(() => {});   // fetch the next flag while this one is played
  }

  function renderGrid() {
    const grid = $('spot-grid');
    grid.dataset.count = st.puzzle.options.length;
    grid.innerHTML = '';
    st.puzzle.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'spot-opt'; b.dataset.i = i;
      b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `Option ${LETTERS[i]}`);
      const img = document.createElement('img');
      img.src = dataUrl(o.svg); img.alt = ''; img.draggable = false;
      const tag = document.createElement('span');
      tag.className = 'spot-tag'; tag.setAttribute('aria-hidden', 'true'); tag.textContent = LETTERS[i];
      b.append(img, tag);
      b.addEventListener('click', () => choose(i));
      grid.appendChild(b);
    });
  }

  function setLock(text, enabled) { const b = $('btn-spot-lock'); b.textContent = text; b.disabled = !enabled; }

  function choose(i) {
    if (st.locked || !st.puzzle) return;
    st.selected = i;
    document.querySelectorAll('.spot-opt').forEach(b => {
      const on = Number(b.dataset.i) === i;
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('picked', on);
      b.querySelector('.spot-tag').textContent = on ? '✓ ' + LETTERS[i] : LETTERS[Number(b.dataset.i)];
    });
    setLock(`Lock in option ${LETTERS[i]}`, true);
  }

  function lockIn() {
    if (st.locked || st.selected == null || !st.puzzle) return;
    st.locked = true;
    const real = st.puzzle.realIndex, ok = st.selected === real, i = st.results.length;
    st.results.push({ p: st.selected, c: ok });
    store.set('spot:' + st.key, { r: st.results });
    document.querySelectorAll('.spot-opt').forEach(b => {
      const n = Number(b.dataset.i), tag = b.querySelector('.spot-tag');
      b.disabled = true; b.classList.remove('picked');
      if (n === real) { b.classList.add('correct'); tag.textContent = '✓ Real flag'; }
      else if (n === st.selected) { b.classList.add('wrong'); tag.textContent = '✗ Your pick'; }
      else { b.classList.add('dim'); tag.textContent = LETTERS[n]; }
    });
    const fb = $('spot-feedback');
    fb.className = 'spot-feedback ' + (ok ? 'ok' : 'bad'); fb.hidden = false;
    fb.textContent = ok ? `✓ Correct. That is the real ${st.names[i]}.` : `✗ Not quite. The real flag is option ${LETTERS[real]}, and you picked ${LETTERS[st.selected]}.`;
    $('spot-score').textContent = correctCount();
    $('btn-spot-lock').hidden = true;
    const next = $('btn-spot-next'); next.hidden = false;
    next.textContent = st.results.length >= st.codes.length ? 'See my score' : 'Next flag';
    next.focus({ preventScroll: false });
  }

  function next() {
    if (st.results.length >= st.codes.length) return showFinal();
    beginRound();
  }

  // ---------------------------------------------------------------- result
  function showFinal() {
    ++token;
    const n = correctCount(), total = st.codes.length;
    $('spot-final-kicker').textContent = `True Colours · Daily #${st.number}`;
    $('spot-final-points').textContent = n;
    $('spot-final-verdict').textContent = verdictFor(n);
    $('spot-final-summary').textContent = `You got ${n} of ${total} right. ${verdictFor(n)}.`;
    $('spot-rounds').innerHTML = '';
    st.results.forEach((r, i) => {
      const li = document.createElement('li'); li.className = r.c ? 'ok' : 'bad';
      const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = r.c ? '✓' : '✗';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = st.names[i];
      const how = document.createElement('span'); how.className = 'how'; how.textContent = r.c ? 'Spotted it' : 'Missed';
      li.append(mark, name, how); $('spot-rounds').appendChild(li);
    });
    showScreen('screen-spot-final');
  }

  async function share() {
    const n = correctCount(), bar = st.results.map(r => (r.c ? '🟩' : '🟥')).join('');
    const url = location.origin + location.pathname + '?spot';
    const text = `${SITE_NAME} · True Colours #${st.number}\n${bar} ${n}/${st.codes.length}\nCan you spot the real flags? ${url}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard. Paste it anywhere.'); }
    catch (e) { prompt('Copy your result:', text); }
  }

  function goHome() {
    ++token; st && (st.locked = false);
    history.replaceState(null, '', location.pathname);
    refreshHome(); showScreen('screen-home');
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    if (!$('btn-spot')) return;
    $('btn-spot').addEventListener('click', () => start().catch(e => { console.error(e); toast('Sorry, that did not load.'); }));
    $('btn-spot-home').addEventListener('click', goHome);
    $('btn-spot-final-home').addEventListener('click', goHome);
    $('btn-spot-lock').addEventListener('click', lockIn);
    $('btn-spot-next').addEventListener('click', next);
    $('btn-spot-share').addEventListener('click', share);
    refreshHome();
    if (new URLSearchParams(location.search).has('spot')) start().catch(e => { console.error(e); toast('Sorry, that did not load.'); });
  }
  init();
  window.Spot = { start, get state() { return st; } };      // dev hook
})();
