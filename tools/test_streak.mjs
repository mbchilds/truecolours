// Unit tests for js/streak.js, the pure streak logic. No browser or server needed:
//   node tools/test_streak.mjs        (or: npm run test:streak)
// Exit code 0 = all passed, 1 = at least one failed.
import assert from 'node:assert/strict';
import fs from 'node:fs';

// streak.js is a plain browser script that sets window.Streak; run it here with a stand-in window.
const win = {};
new Function('window', fs.readFileSync(new URL('../js/streak.js', import.meta.url), 'utf8'))(win);
const { compute, record, calendar } = win.Streak;

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
  'late (catch-up) days never extend, repair or join a streak'() {
    // streak of 3 (10th-12th) with the 9th missed; catching the 9th up late must NOT make it 4
    const log = { ...days(TODAY, [800, 800, 800]), [key(TODAY, 3)]: { n: 1, sum: 500, late: true } };
    const s = compute(log, TODAY);
    assert.deepEqual([s.current, s.best, s.avg], [3, 3, 800]);
  },
  'late days can not rescue a streak that is at risk or broken either'() {
    const atRisk = compute({ ...days(key(TODAY, 1), [800, 800]), [TODAY]: { n: 1, sum: 900, late: true } }, TODAY);
    assert.deepEqual([atRisk.current, atRisk.playedToday, atRisk.atRisk], [2, false, true]);
    const broken = compute({ ...days(key(TODAY, 3), [800, 800]), [key(TODAY, 2)]: { n: 1, sum: 900, late: true }, [key(TODAY, 1)]: { n: 1, sum: 900, late: true } }, TODAY);
    assert.deepEqual([broken.current, broken.best], [0, 2]);
  },
  'late days count towards the all-time total and average, but not the streak average'() {
    const log = { ...days(TODAY, [900, 1000]), [key(TODAY, 5)]: { n: 1, sum: 400, late: true }, [key(TODAY, 6)]: { n: 1, sum: 500, late: true } };
    const s = compute(log, TODAY);
    assert.deepEqual([s.current, s.avg], [2, 950]);                  // streak: 900 and 1000 only
    assert.deepEqual([s.total, s.avgAll], [4, 700]);                 // everything: (900+1000+400+500)/4
  },
  'the week strip tells on-time, late and unplayed days apart, and carries each day\'s date'() {
    const log = { [TODAY]: { n: 1, sum: 800 }, [key(TODAY, 2)]: { n: 1, sum: 700, late: true } };
    const s = compute(log, TODAY);
    assert.deepEqual(s.week.map(d => d.key), Array.from({ length: 7 }, (_, i) => key(TODAY, 6 - i)));
    assert.deepEqual(s.week.map(d => d.played), [false, false, false, false, false, false, true]);
    assert.deepEqual(s.week.map(d => d.late), [false, false, false, false, true, false, false]);
  },
  'all-time totals ignore junk and future days, like the streak does'() {
    const s = compute({ ...days(TODAY, [800]), '2030-01-01': { n: 1, sum: 1000, late: true }, 'nope': { n: 1, sum: 1, late: true }, [key(TODAY, 1)]: { n: 0, sum: 9, late: true } }, TODAY);
    assert.deepEqual([s.total, s.avgAll], [1, 800]);
  },
  'calendar lays out months newest first, Monday-first, with the right states'() {
    // first daily 2026-09-01 (a Tuesday); today 2026-10-12 (a Monday)
    const log = { '2026-09-01': { n: 1, sum: 700 }, '2026-09-02': { n: 1, sum: 600, late: true }, '2026-10-12': { n: 1, sum: 900 } };
    const months = calendar(log, TODAY, '2026-09-01');
    assert.deepEqual(months.map(m => m.label), ['October 2026', 'September 2026']);
    assert.deepEqual(months.map(m => m.days.length), [31, 30]);
    assert.deepEqual(months.map(m => m.lead), [3, 1]);               // 1 Oct is a Thursday, 1 Sep a Tuesday
    const sep = months[1].days, oct = months[0].days;
    assert.deepEqual([sep[0].state, sep[0].sum, sep[1].state, sep[1].sum, sep[2].state, sep[2].sum], ['on', 700, 'late', 600, 'none', null]);
    assert.deepEqual([oct[11].state, oct[11].sum, oct[10].state, oct[12].state], ['on', 900, 'none', 'off']);   // 12th played, 11th missed, 13th is the future
  },
  'calendar greys out days before the first daily and handles a year change and a leap year'() {
    const early = calendar({}, '2026-09-03', '2026-09-01');
    assert.equal(early.length, 1);
    assert.deepEqual(early[0].days.slice(0, 4).map(d => d.state), ['none', 'none', 'none', 'off']);
    const span = calendar({}, '2028-03-02', '2027-12-30');
    assert.deepEqual(span.map(m => m.label), ['March 2028', 'February 2028', 'January 2028', 'December 2027']);
    assert.equal(span[1].days.length, 29);                           // 2028 is a leap year
    assert.deepEqual(span[3].days.slice(28).map(d => d.state), ['off', 'none', 'none']);   // the first daily is the 30th, so the 29th isn't part of the archive
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
