/* flagcheck.js - a dev-only tool for playing through every flag in the game,
   one after another, to check regions/pre-fill behave correctly. Not linked
   from the game itself; open flagcheck.html directly. Progress ("fine" marks
   and free-text notes per flag) is kept in this browser's localStorage only -
   "Copy all notes to clipboard" is the way to get them out for review. */
(function () {
  const C = window.Color, Assets = window.FlagAssets;
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'tc:flagcheck';

  // fine/index: the "All flags" pass. verified/indexChanged: the "Changed" view - flags whose
  // regions were reworked and need re-checking (a separate tick, so an old "fine" mark on a
  // since-changed flag doesn't count as checked).
  function blankStatus() { return { fine: {}, notes: {}, index: 0, verified: {}, indexChanged: 0, manualDone: {}, indexManual: 0, mode: null }; }
  function loadStatus() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY));
      return v && v.fine ? Object.assign(blankStatus(), v) : blankStatus();
    } catch (e) { return blankStatus(); }
  }
  function saveStatus() { try { localStorage.setItem(STORE_KEY, JSON.stringify(status)); } catch (e) { /* private mode */ } }

  // Same scoring rule as the real game (js/game.js) - duplicated rather than
  // shared so this tool never depends on game.js's screen-wiring init(). Keep
  // this in sync with game.js's scoreAttempt if that one changes.
  function scoreAttempt(meta, fills) {
    const groups = new Map();
    for (const r of meta.regions) {
      if (!groups.has(r.hex)) groups.set(r.hex, { hex: r.hex, regions: [] });
      groups.get(r.hex).regions.push(r);
    }
    const out = [];
    const rows = [];
    for (const g of groups.values()) {
      let totalArea = 0, weighted = 0;
      const byFill = new Map();
      for (const r of g.regions) {
        const yours = fills.get(r.id) || '#f4f4f1';
        const pts = C.pointsFor(C.hexDistance(yours, g.hex));
        weighted += pts * r.area; totalArea += r.area;
        if (!byFill.has(yours)) byFill.set(yours, { yours, points: pts, area: 0, count: 0 });
        const fillGroup = byFill.get(yours);
        fillGroup.area += r.area; fillGroup.count += 1;
      }
      const points = Math.round(weighted / totalArea);
      out.push({ hex: g.hex, points, area: totalArea });
      // One row per distinct fill used within this colour, so a wrongly-coloured
      // region shows up on its own instead of being averaged into the rest.
      for (const fillGroup of [...byFill.values()].sort((a, b) => b.area - a.area)) {
        rows.push({
          hex: g.hex, yours: fillGroup.yours, points: fillGroup.points,
          verdict: C.verdict(fillGroup.points), count: fillGroup.count, groupArea: totalArea, area: fillGroup.area,
        });
      }
    }
    rows.sort((a, b) => b.groupArea - a.groupArea || b.area - a.area);
    const points = Math.round(out.reduce((s, g) => s + g.points, 0) / out.length);
    return { points, rows };
  }

  let manifest, allOrder, order, status, idx, board, picker, changedSet = new Set(), changedLabel = '';
  // "Manual rework" view: the flags currently removed from the game (manifest.excluded), with a
  // short reason for each from flagcheck-manual.json. Its own "signed off" tick, separate from fine.
  let manualSet = new Set(), manualReasons = {};
  const inChanged = () => status.mode === 'changed';
  const inManual = () => status.mode === 'manual';
  const marks = () => (inChanged() ? status.verified : inManual() ? status.manualDone : status.fine);
  // A flag changed again after you re-checked it (its revision in flagcheck-changed.json went up)
  // needs a fresh re-check, so a re-check tick only counts if it's for the current revision.
  let revs = {};
  const revOf = code => revs[code] || 1;
  function isVerified(code) {
    const v = status.verified[code];
    return !!v && (typeof v === 'string' ? 1 : v.r) >= revOf(code);
  }
  const isMarked = code => (inChanged() ? isVerified(code) : inManual() ? !!status.manualDone[code] : !!status.fine[code]);

  async function init() {
    manifest = await Assets.manifestLoad();
    allOrder = manifest.flags.slice().sort((a, b) => a.name.localeCompare(b.name));
    status = loadStatus();
    try {
      const c = await (await fetch('flagcheck-changed.json?v=' + Date.now())).json();
      changedSet = new Set(c.codes); changedLabel = c.label || ''; revs = c.revisions || {};
    } catch (e) { /* no changed list: the option stays hidden */ }
    manualSet = new Set(manifest.excluded || []);
    try { manualReasons = (await (await fetch('flagcheck-manual.json?v=' + Date.now())).json()).reasons || {}; } catch (e) { /* reasons are optional */ }
    if (changedSet.size) $('fc-mode-changed').hidden = false;
    if (manualSet.size) $('fc-mode-manual').hidden = false;
    if (status.mode === 'changed' && !changedSet.size) status.mode = 'all';
    if (status.mode === 'manual' && !manualSet.size) status.mode = 'all';
    if (!status.mode) status.mode = changedSet.size ? 'changed' : 'all';
    applyMode(false);

    board = new window.FlagBoard($('flag-canvas'));
    picker = new window.Picker($('picker'), { onChange: hex => { board.currentColour = hex; } });
    board.currentColour = picker.hex;
    board.onFill = hex => { picker.remember(hex); updateProgress(); };

    buildSelect();
    $('fc-select').addEventListener('change', e => load(+e.target.value));
    $('fc-mode').addEventListener('change', e => { flushNote(); status.mode = e.target.value; applyMode(true); });
    $('fc-skip').addEventListener('click', () => load((idx + 1) % order.length));
    $('fc-fine').addEventListener('click', markFine);
    $('btn-clear').addEventListener('click', () => { board.clear(); updateProgress(); $('fc-score').hidden = true; });
    $('btn-score').addEventListener('click', showScore);
    $('fc-reset').addEventListener('click', resetProgress);
    $('fc-copy-notes').addEventListener('click', copyAllNotes);
    $('fc-notes-input').addEventListener('input', onNoteInput);
    // belt-and-braces: flush the note if the tab is closed/hidden mid-debounce
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushNote(); });

    await load(idx);
  }

  function fineCount() { return order.filter(f => isMarked(f.code)).length; }

  // Switch between the full catalogue and just the flags changed in the latest pass.
  function applyMode(reload) {
    order = inChanged() ? allOrder.filter(f => changedSet.has(f.code)) : inManual() ? allOrder.filter(f => manualSet.has(f.code)) : allOrder;
    const saved = inChanged() ? status.indexChanged : inManual() ? status.indexManual : status.index;
    idx = Math.min(Math.max(saved || 0, 0), order.length - 1);
    $('fc-mode').value = status.mode;
    $('fc-mode-changed').textContent = `Changed - to re-check (${changedSet.size})`;
    $('fc-mode-manual').textContent = `Manual rework - removed from play (${manualSet.size})`;
    $('fc-chip-label').textContent = inChanged() ? 'Re-checked' : inManual() ? 'Signed off' : 'Marked fine';
    $('fc-reset').textContent = inChanged() ? 'Reset all re-check ticks' : inManual() ? 'Reset all sign-offs' : 'Reset all "fine" marks';
    buildSelect();
    if (reload) load(idx);
  }

  function buildSelect() {
    const sel = $('fc-select');
    sel.innerHTML = order.map((f, i) => {
      const mark = (isMarked(f.code) ? '✓' : '') + (status.notes[f.code] ? '✎' : '');
      return `<option value="${i}">${mark ? mark + ' ' : ''}${f.name}</option>`;
    }).join('');
    sel.value = idx;
    $('fc-fine-count').textContent = fineCount() + (inChanged() || inManual() ? ' / ' + order.length : '');
  }

  async function load(i) {
    flushNote();
    idx = i;
    if (inChanged()) status.indexChanged = i; else if (inManual()) status.indexManual = i; else status.index = i;
    saveStatus();
    const meta = order[idx];
    $('fc-country').textContent = meta.name.toUpperCase();
    $('fc-progress').textContent = `${idx + 1} / ${order.length}`;
    $('fc-select').value = idx;
    $('fc-truth-img').src = Assets.url(meta.code, 'svg');
    $('fc-truth-img').alt = `${meta.name} flag`;
    const done = isMarked(meta.code);
    $('fc-fine').classList.toggle('is-done', done);
    $('fc-fine').textContent = done ? (inChanged() ? '✓ Re-checked (click to undo)' : inManual() ? '✓ Signed off (click to undo)' : '✓ Marked fine (click to undo)')
                                    : (inChanged() ? '✓ Looks good now' : inManual() ? '✓ Manual fix done' : '✓ Flag is fine');
    const badge = $('fc-badge');
    if (manualSet.has(meta.code)) {
      badge.hidden = false;
      badge.textContent = 'Removed from play - needs manual rework' + (manualReasons[meta.code] ? ': ' + manualReasons[meta.code] : '');
    } else if (changedSet.has(meta.code)) {
      badge.hidden = false;
      badge.textContent = `Changed in the latest pass${changedLabel ? ' (' + changedLabel + ')' : ''} - please re-check`;
    } else badge.hidden = true;
    $('fc-notes-input').value = status.notes[meta.code] || '';
    $('fc-notes-status').textContent = '';
    $('prefill-note').hidden = !(meta.prefilled > 0);
    $('fc-score').hidden = true;
    $('flag-loading').hidden = false;
    board.interactive = false;
    picker.clearRecent();
    await board.load(meta);
    board.interactive = true;
    $('flag-loading').hidden = true;
    updateProgress();
  }

  function updateProgress() {
    const n = order[idx].regions.length, f = board.filledCount;
    $('progress-text').textContent = f === n ? `All ${n} regions filled` : `${f} of ${n} region${n === 1 ? '' : 's'} filled`;
    $('progress-fill').style.width = (f / n * 100) + '%';
  }

  function showScore() {
    const meta = order[idx], result = scoreAttempt(meta, board.fills);
    const el = $('fc-score');
    el.hidden = false;
    el.innerHTML = `<div class="fc-score-total">${result.points} <small>/ 1000</small></div>` + result.rows.map(g => `
      <div class="bd-row">
        <div class="bd-swatches">
          <span class="sw" style="background:${g.yours}" title="Yours ${g.yours}"></span>
          <span class="sw-arrow">→</span>
          <span class="sw" style="background:${g.hex}" title="Actual ${g.hex}"></span>
        </div>
        <div class="bd-name">${C.describe(g.hex)}${g.count > 1 ? ` <small>(×${g.count} regions)</small>` : ''}<small>${g.yours.toUpperCase()} vs ${g.hex.toUpperCase()}</small></div>
        <div class="bd-verdict v-${g.verdict.replace(/\s/g, '').toLowerCase()}">${g.verdict}</div>
      </div>`).join('');
  }

  // Clicking an already-marked flag undoes the mark (and stays put); otherwise it marks the
  // flag and moves on. In the Changed view the mark is the separate "re-checked" tick, which
  // also counts as fine in the main list.
  function markFine() {
    const code = order[idx].code;
    if (isMarked(code)) {
      delete marks()[code];
      if (inChanged() || inManual()) delete status.fine[code];
      saveStatus(); buildSelect(); load(idx);
      return;
    }
    const now = new Date().toISOString();
    marks()[code] = inChanged() ? { t: now, r: revOf(code) } : now;
    if (inChanged() || inManual()) status.fine[code] = now;   // (a re-check / sign-off also counts as fine)
    saveStatus();
    buildSelect();
    load((idx + 1) % order.length);
  }

  function resetProgress() {
    if (!confirm(inChanged() ? 'Clear every re-check tick in the Changed view? (Notes and the main "fine" marks are kept.)'
               : inManual() ? 'Clear every sign-off in the Manual rework view? (Notes and the main "fine" marks are kept.)'
                              : 'Clear every "flag is fine" mark on this device and start the review over? (Your notes are kept.)')) return;
    if (inChanged()) { status.verified = {}; status.indexChanged = 0; }
    else if (inManual()) { status.manualDone = {}; status.indexManual = 0; }
    else { status.fine = {}; status.index = 0; }
    saveStatus();
    applyMode(true);
  }

  // ----------------------------------------------------------------- notes
  // Autosaved to localStorage as you type (debounced), so there's no explicit
  // save step - just write and move on. flushNote() forces it through
  // immediately when navigating away or hiding the tab, so nothing typed in
  // the last moment before that is lost.
  let noteTimer = null;
  function onNoteInput(e) {
    status.notes[order[idx].code] = e.target.value;
    $('fc-notes-status').textContent = 'Saving…';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(commitNote, 500);
  }
  function commitNote() {
    noteTimer = null;
    const code = order[idx].code;
    if (!status.notes[code]) delete status.notes[code];
    saveStatus();
    buildSelect();
    $('fc-select').value = idx;
    $('fc-notes-status').textContent = 'Saved';
  }
  function flushNote() { if (noteTimer) { clearTimeout(noteTimer); commitNote(); } }

  async function copyAllNotes() {
    flushNote();
    const lines = [`FlagFill notes - exported ${new Date().toISOString()}`, ''];
    let count = 0;
    for (const f of order) {
      const note = (status.notes[f.code] || '').trim();
      if (!note) continue;
      count++;
      const tags = [status.fine[f.code] && 'marked fine', manualSet.has(f.code) && (status.manualDone[f.code] ? 'manual rework: signed off' : 'removed from play, manual rework pending'), changedSet.has(f.code) && (isVerified(f.code) ? 're-checked after change' : 'changed, not yet re-checked')].filter(Boolean);
      lines.push(`[${f.code}] ${f.name}${tags.length ? ' (' + tags.join('; ') + ')' : ''}`, note, '');
    }
    if (!count) lines.push('(no notes written yet)');
    const text = lines.join('\n');
    const btn = $('fc-copy-notes');
    try { await navigator.clipboard.writeText(text); btn.textContent = count ? `Copied ${count} note${count === 1 ? '' : 's'}!` : 'No notes yet'; }
    catch (e) { prompt('Copy your notes:', text); }
    setTimeout(() => { btn.textContent = 'Copy all notes to clipboard'; }, 2200);
  }

  init().catch(err => { console.error(err); alert('Failed to load: ' + err.message); });
})();
