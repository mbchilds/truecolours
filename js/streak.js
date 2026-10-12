/* streak.js - consecutive-day streaks. Pure logic, no DOM and no storage. Exposed on window.Streak.
   A log is { 'YYYY-MM-DD': { n, sum } }: how many flags were scored on that day and their total points.
   Days are UTC dates, the same clock the Daily Challenge resets on. */
(function () {
  const DAY = 86400000, DATE = /^\d{4}-\d{2}-\d{2}$/;
  const dayIndex = key => Math.floor(Date.parse(key + 'T00:00:00Z') / DAY);

  // Streak state as of `today` (a UTC date key). A streak survives until a whole day passes with no play, so
  // playing yesterday but not yet today is still alive - `atRisk` flags that case. `avg` is the mean score per
  // flag across the current streak. `week` is the last seven days, oldest first, for the little dot strip.
  function compute(log, today) {
    const t = dayIndex(today), played = new Map();
    for (const [key, d] of Object.entries(log || {})) {
      const i = DATE.test(key) ? dayIndex(key) : NaN;
      // junk entries and dates after `today` (a wrong device clock, say) are ignored
      if (i <= t && d && Number.isFinite(d.n) && d.n > 0 && Number.isFinite(d.sum)) played.set(i, d);
    }
    const playedToday = played.has(t);
    let current = 0, n = 0, sum = 0;
    for (let i = playedToday ? t : t - 1; played.has(i); i--) { current++; n += played.get(i).n; sum += played.get(i).sum; }
    let best = 0, run = 0, prev;
    for (const i of [...played.keys()].sort((a, b) => a - b)) { run = i === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = i; }
    const week = [];
    for (let i = t - 6; i <= t; i++) week.push({ played: played.has(i), initial: 'SMTWTFS'[new Date(i * DAY).getUTCDay()] });
    return { current, best, playedToday, atRisk: current > 0 && !playedToday, avg: n ? Math.round(sum / n) : 0, week };
  }

  // Returns a copy of the log with a finished game added (several games on one day just accumulate).
  function record(log, key, n, sum) {
    const d = (log && log[key]) || { n: 0, sum: 0 };
    return Object.assign({}, log, { [key]: { n: d.n + n, sum: d.sum + sum } });
  }

  window.Streak = { compute, record };
})();
