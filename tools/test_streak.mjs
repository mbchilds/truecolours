// Unit tests for js/streak.js, the pure streak logic. No browser or server needed:
//   node tools/test_streak.mjs        (or: npm run test:streak)
// Exit code 0 = all passed, 1 = at least one failed.
import assert from 'node:assert/strict';
import fs from 'node:fs';

// streak.js is a plain browser script that sets window.Streak; run it here with a stand-in window.
const win = {};
new Function('window', fs.readFileSync(new URL('../js/streak.js', import.meta.url), 'utf8'))(win);
const { compute, record } = win.Streak;

// log helper: days('2026-10-12', [800, 900]) -> that day and the day before, one flag each
const key = (from, back) => new Date(Date.parse(from + 'T00:00:00Z') - back * 86400000).toISOString().slice(0, 10);
const days = (end, scores) => Object.fromEntries(scores.map((s, i) => [key(end, scores.length - 1 - i), { n: 1, sum: s }]));
const TODAY = '2026-10-12'; // a Monday

const tests = {
  'empty or missing log has no streak'() {
    for (const log of [{}, null, undefined]) {
      const s = compute(log, TODAY);
      assert.deepEqual([s.current, s.best, s.avg, s.playedToday, s.atRisk], [0, 0, 0, false, false]);
    }
  },
  'playing today starts a streak of one'() {
    const s = compute(days(TODAY, [840]), TODAY);
    assert.deepEqual([s.current, s.best, s.avg, s.playedToday, s.atRisk], [1, 1, 840, true, false]);
  },
  'consecutive days count, and the average is across them'() {
    const s = compute(days(TODAY, [700, 800, 900, 1000]), TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [4, 4, 850]);
  },
  'played yesterday but not yet today: still alive, but at risk'() {
    const s = compute(days(key(TODAY, 1), [700, 800, 900]), TODAY);
    assert.deepEqual([s.current, s.playedToday, s.atRisk, s.avg], [3, false, true, 800]);
  },
  'a missed day breaks it'() {
    const s = compute(days(key(TODAY, 2), [700, 800, 900]), TODAY);
    assert.deepEqual([s.current, s.best, s.atRisk], [0, 3, false]);
  },
  'a gap restarts the streak but best remembers the longer run'() {
    const log = { ...days(key(TODAY, 3), [500, 500, 500]), ...days(TODAY, [900, 900]) };
    const s = compute(log, TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [2, 3, 900]);
  },
  'dates after today are ignored'() {
    const s = compute({ ...days(TODAY, [800]), '2026-10-13': { n: 1, sum: 1000 }, '2030-01-01': { n: 1, sum: 1000 } }, TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [1, 1, 800]);
  },
  'junk entries are ignored rather than thrown on'() {
    const log = { ...days(TODAY, [800]), 'not-a-date': { n: 1, sum: 5 }, '2026-10-11': { n: 0, sum: 5 }, '2026-10-10': { n: 1, sum: NaN },
      '2026-10-09': null, '2026-10-08': { n: '5', sum: 100 }, '2026-10-07': 'x' };
    const s = compute(log, TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [1, 1, 800]);
  },
  'quick play averages per flag, not per game, and handles several games a day'() {
    // yesterday: 5 flags / 4000 pts. today: two games, 10 flags / 6000 pts.  (4000 + 6000) / 15 = 667
    const log = { [key(TODAY, 1)]: { n: 5, sum: 4000 }, [TODAY]: { n: 10, sum: 6000 } };
    const s = compute(log, TODAY);
    assert.deepEqual([s.current, s.avg], [2, 667]);
  },
  'year, month and leap-day boundaries are consecutive'() {
    assert.equal(compute({ '2026-12-31': { n: 1, sum: 1 }, '2027-01-01': { n: 1, sum: 1 } }, '2027-01-01').current, 2);
    assert.equal(compute({ '2026-02-28': { n: 1, sum: 1 }, '2026-03-01': { n: 1, sum: 1 } }, '2026-03-01').current, 2);
    assert.equal(compute({ '2028-02-28': { n: 1, sum: 1 }, '2028-02-29': { n: 1, sum: 1 }, '2028-03-01': { n: 1, sum: 1 } }, '2028-03-01').current, 3);
    assert.equal(compute({ '2026-10-24': { n: 1, sum: 1 }, '2026-10-26': { n: 1, sum: 1 } }, '2026-10-26').current, 1); // across the UK clock change, still a gap
  },
  'a long streak from the first Daily is counted in full'() {
    const s = compute(days(TODAY, Array(42).fill(800)), TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [42, 42, 800]);
  },
  'week strip is the last seven days, oldest first, ending on today'() {
    const s = compute(days(TODAY, [800, 800, 800]), TODAY); // Sat, Sun, Mon played
    assert.equal(s.week.length, 7);
    assert.equal(s.week.map(d => d.initial).join(''), 'TWTFSSM'); // Tue..Mon
    assert.deepEqual(s.week.map(d => d.played), [false, false, false, false, true, true, true]);
  },
  'record accumulates games on the same day without mutating the log'() {
    const a = {}, b = record(a, TODAY, 5, 4000), c = record(b, TODAY, 5, 3000);
    assert.deepEqual(a, {});
    assert.deepEqual(b[TODAY], { n: 5, sum: 4000 });
    assert.deepEqual(c[TODAY], { n: 10, sum: 7000 });
    assert.deepEqual(record(null, TODAY, 5, 1)[TODAY], { n: 5, sum: 1 });
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n').join('\n       ')); }
}
console.log(failed ? `\n${failed} of ${Object.keys(tests).length} failed` : `\nall ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
