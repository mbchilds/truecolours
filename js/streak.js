/* streak.js - consecutive-day streaks and the calendar of played days. Pure logic, no DOM and no storage. Exposed on window.Streak.
   A log is { 'YYYY-MM-DD': { n, sum, late? } }: how many flags were scored on that day and their total points.
   `late` marks a day played after its own date (a catch-up from the Daily archive): it counts towards the totals and
   averages but never towards a streak. Days are UTC dates, the same clock the Daily Challenge resets on. */
(function () {
  const DAY = 86400000, DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayIndex = key => Math.floor(Date.parse(key + 'T00:00:00Z') / DAY);
  const keyOf = idx => new Date(idx * DAY).toISOString().slice(0, 10);
  const valid = d => d && Number.isFinite(d.n) && d.n > 0 && Number.isFinite(d.sum);

  // Streak state as of `today` (a UTC date key). A streak survives until a whole day passes with no play, so
  // playing yesterday but not yet today is still alive - `atRisk` flags that case. `avg` is the mean score per
  // flag across the current streak. `week` is the last seven days, oldest first, for the little dot strip: each
  // day is played on time, played late, or neither. `total` and `avgAll` cover every day ever played, late ones too.
  function compute(log, today) {
    const t = dayIndex(today), played = new Map(), late = new Map();
    let all = 0, allN = 0, allSum = 0;
    for (const [key, d] of Object.entries(log || {})) {
      const i = DATE.test(key) ? dayIndex(key) : NaN;
      // junk entries and dates after `today` (a wrong device clock, say) are ignored
      if (!(i <= t && valid(d))) continue;
      (d.late ? late : played).set(i, d);
      all++; allN += d.n; allSum += d.sum;
    }
    const playedToday = played.has(t);
    let current = 0, n = 0, sum = 0;
    for (let i = playedToday ? t : t - 1; played.has(i); i--) { current++; n += played.get(i).n; sum += played.get(i).sum; }
    let best = 0, run = 0, prev;
    for (const i of [...played.keys()].sort((a, b) => a - b)) { run = i === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = i; }
    const week = [];
    for (let i = t - 6; i <= t; i++) week.push({ key: keyOf(i), played: played.has(i), late: late.has(i), initial: 'SMTWTFS'[new Date(i * DAY).getUTCDay()] });
    return {
      current, best, playedToday, atRisk: current > 0 && !playedToday, avg: n ? Math.round(sum / n) : 0, week,
      total: all, avgAll: allN ? Math.round(allSum / allN) : 0,
    };
  }

  // Returns a copy of the log with a finished game added (several games on one day just accumulate).
  function record(log, key, n, sum) {
    const d = (log && log[key]) || { n: 0, sum: 0 };
    return Object.assign({}, log, { [key]: { n: d.n + n, sum: d.sum + sum } });
  }

  // The days from `epoch` (the first daily) to `today`, month by month, newest month first, for a Monday-first
  // calendar grid. Each month is { label, lead: blank cells before the 1st, days: [{ key, day, state, sum }] } where
  // state is 'on' (played on the day), 'late' (caught up later), 'none' (not played) or 'off' (before the first daily
  // or after today, so not part of the archive).
  function calendar(log, today, epoch) {
    const e = dayIndex(epoch), t = dayIndex(today), end = new Date(today + 'T00:00:00Z'), start = new Date(epoch + 'T00:00:00Z');
    const months = [];
    let y = end.getUTCFullYear(), m = end.getUTCMonth();
    while (y > start.getUTCFullYear() || (y === start.getUTCFullYear() && m >= start.getUTCMonth())) {
      const first = Date.UTC(y, m, 1), count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), days = [];
      for (let d = 1; d <= count; d++) {
        const key = keyOf(first / DAY + d - 1), i = dayIndex(key), rec = (log || {})[key];
        const inRange = i >= e && i <= t, done = inRange && valid(rec);
        days.push({ key, day: d, state: !inRange ? 'off' : !done ? 'none' : rec.late ? 'late' : 'on', sum: done ? rec.sum : null });
      }
      months.push({ label: MONTHS[m] + ' ' + y, lead: (new Date(first).getUTCDay() + 6) % 7, days });
      if (--m < 0) { m = 11; y--; }
    }
    return months;
  }

  window.Streak = { compute, record, calendar };
})();
