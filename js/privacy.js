/* privacy.js - the visitor's analytics choice, and "delete my data". Included on every page.
   Google Analytics is the only third-party script on the site and it is not requested at all unless the visitor
   says yes. The choice is kept in this browser's localStorage (tc:consent). The measurement ID comes from
   <meta name="ga-measurement-id"> in index.html; a page (or build) without it has no analytics and no banner. */
(function () {
  const GA_ID = (document.querySelector('meta[name="ga-measurement-id"]') || {}).content || '';
  const KEY = 'tc:consent', VERSION = 1;        // bump VERSION to ask everyone again, e.g. if analytics ever changes
  const banner = document.getElementById('consent');
  let memory = null;                            // the choice for this page if storage is blocked
  let loaded = false, forced = false, opener = null;

  // true = accepted, false = rejected, null = not chosen yet (which counts as no)
  function choice() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY));
      if (c && c.v === VERSION && typeof c.a === 'boolean') return c.a;
    } catch (e) { /* storage unavailable or not JSON */ }
    return memory;
  }
  function remember(accept) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, a: accept, t: new Date().toISOString() })); memory = null; }
    catch (e) { memory = accept; }                // storage blocked (private mode): the choice lasts for this page only
  }

  // ---- Google Analytics: only ever started after "accept"
  function startAnalytics() {
    if (!GA_ID) return;
    window['ga-disable-' + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };   // gtag wants the arguments object itself
    if (loaded) return;
    loaded = true;
    // analytics storage only: no ad storage, no ad personalisation, no Google signals
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('js', new Date());
    gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 31536000, cookie_flags: 'SameSite=Lax;Secure' });
    const s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }
  function stopAnalytics() {
    if (GA_ID) window['ga-disable-' + GA_ID] = true;
    delete window.gtag;                         // game.js only sends events while window.gtag exists
    clearGaCookies();
  }
  // Google's cookies are _ga, _ga_<container> (and the old _gid / _gat): expire them on every domain they could sit on
  function clearGaCookies() {
    const names = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^(_ga|_gid|_gat)(_|$)/.test(n));
    if (!names.length) return;
    const host = location.hostname, parts = host.split('.'), domains = ['', host, '.' + host];
    for (let i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
    for (const n of names) for (const d of domains) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? '; domain=' + d : ''}`;
  }

  // ---- what the page shows
  function sync() {
    const c = choice();
    if (banner) banner.hidden = !(GA_ID && (c === null || forced));
    document.querySelectorAll('[data-consent="open"]').forEach(b => { b.hidden = !GA_ID; });
    document.querySelectorAll('[data-consent="accept"]').forEach(b => b.setAttribute('aria-pressed', String(c === true)));
    document.querySelectorAll('[data-consent="reject"]').forEach(b => b.setAttribute('aria-pressed', String(c === false)));
    const text = c === true ? 'Analytics: on' : c === false ? 'Analytics: off' : "Analytics: off (you haven't chosen yet)";
    document.querySelectorAll('[data-consent-status]').forEach(el => { el.textContent = text; });
  }
  // The banner is fixed to the bottom of the home screen; leave room under the content so it never hides the links.
  function reserveSpace() {
    document.documentElement.style.setProperty('--consent-h', banner && !banner.hidden ? banner.offsetHeight + 'px' : '0px');
  }
  function choose(accept) {
    const hadFocus = !!banner && banner.contains(document.activeElement);
    remember(accept);
    accept ? startAnalytics() : stopAnalytics();
    forced = false;
    sync(); reserveSpace();
    if (hadFocus) {                              // the button that had focus has just gone: put focus somewhere sensible
      const back = opener && document.contains(opener) && !opener.hidden ? opener : document.querySelector('h1');
      if (back) { if (!back.matches('a,button,input')) back.setAttribute('tabindex', '-1'); back.focus({ preventScroll: true }); }
    }
  }
  // "Cookie settings": show the banner again (home screen), or go to the page that has the same controls
  function reopen(from) {
    if (!banner || !GA_ID) { location.href = 'privacy.html#your-choices'; return; }
    opener = from || document.activeElement; forced = true;
    sync(); reserveSpace();
    const first = banner.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }

  // ---- delete my data: everything the game keeps in this browser. tc:flagcheck is the dev tool's own notes, not player data.
  function deleteData() {
    if (!window.confirm("Delete your FlagFill game data on this device?\n\nThat includes your streaks, scores and past dailies. This can't be undone.")) return false;
    for (const area of ['localStorage', 'sessionStorage']) {
      try {
        const store = window[area], doomed = [];
        for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith('tc:') && k !== 'tc:flagcheck') doomed.push(k); }
        doomed.forEach(k => store.removeItem(k));
      } catch (e) { /* this storage is unavailable: nothing was saved in it */ }
    }
    memory = null;
    stopAnalytics();
    location.assign('./');                       // start clean: the banner asks again, and the game reloads with no history
    return true;
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-consent],[data-privacy]');
    if (!el) return;
    const a = el.dataset.consent, p = el.dataset.privacy;
    if (a === 'accept') choose(true);
    else if (a === 'reject') choose(false);
    else if (a === 'open') reopen(el);
    else if (p === 'delete') deleteData();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !forced || !banner || banner.hidden || document.querySelector('.modal:not([hidden])')) return;   // reopened from "Cookie settings": close it, choice unchanged (an open dialog gets the key first)
    forced = false; sync(); reserveSpace();
    if (opener && document.contains(opener) && !opener.hidden) opener.focus({ preventScroll: true });
  });
  // another tab changed the choice: follow it
  window.addEventListener('storage', e => {
    if (e.key !== KEY && e.key !== null) return;  // null = storage was cleared
    choice() === true ? startAnalytics() : stopAnalytics();
    sync(); reserveSpace();
  });

  window.Privacy = { choice, reopen, deleteData };
  if (choice() === true) startAnalytics(); else clearGaCookies();
  sync();
  if (banner && 'ResizeObserver' in window) new ResizeObserver(reserveSpace).observe(banner);
  reserveSpace();
})();
