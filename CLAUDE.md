# FlagFill — Claude Code instructions

FlagFill is a web flag-colouring game (see README.md for full project detail:
architecture, scoring, region-map build pipeline). This file is what an
autonomous Claude Code session (a Routine, or Marcus prompting from his
phone) needs to know before touching this repo.

## Live setup
- Live site: https://flagfillgame.vercel.app
- Vercel project: mbchilds-projects / flagfill
- GitHub repo: mbchilds/truecolours (this repo), private
- Database: Upstash Redis "upstash-kv-cyan-car" (KV_ env vars), London region
- Deploy flow: push to `main` -> Vercel auto-deploys. There is no PR/review
  step in normal operation - pushing to main is how a fix goes live.
- Daily Challenge: one flag per UTC day, from a fixed seeded shuffle
  (seed 20260901, Daily #1 = 1 Sep 2026). Changing which countries are
  included reshuffles the whole daily order - never add/remove a country
  as a same-day fix.

## Autonomous operation policy (agreed with Marcus, updated 25 Sep 2026)
**This scheduled session cannot push to GitHub, full stop - do not attempt
`git push`, do not try `add_repo` to get push credentials, do not create or
push a branch.** This was tested for real on 25 Sep 2026: reading/cloning
the repo works (the git proxy serves anonymous reads), but push credentials
require an explicit per-session grant that this scheduled task's sessions
are never given, and there is no setting that changes that - it's a
deliberate platform boundary (an unattended task shouldn't be able to grant
itself write access to a private repo with nobody watching), not a config
gap to work around. Two earlier runs wasted time discovering this the hard
way; don't repeat the experiment.

So the routine's job is **diagnose and report, never ship**:
1. Playtest (see below). If it's clean, say so and stop - nothing more to do.
2. If you find a bug, write the actual fix in your local working copy (so
   you can verify it - see below), then capture it with `git diff` (do
   **not** `git commit`, there's no point committing something that can't
   be pushed, and it just adds confusing detail to the email). Re-run
   `npm run playtest:live` against the fixed working copy to confirm it's
   actually clean now.
3. Classify the fix by the tier below - this changes what you say in the
   email, not what you do (you never push either way):
   - **Protected** - `flags/` (region maps, SVGs, manifest),
     `tools/build_flags.py` / `tools/countries.py`, `js/color.js` scoring
     constants, `js/game.js` `CONFIG.dailyEpoch`/`CONFIG.dailySeed` or
     anything touching which flag is any day's Daily Challenge, the
     Google Analytics ID in `index.html`, `api/daily.js` or the Redis
     schema/keys, or anything you're not fully confident about. Say
     clearly in the email that this needs Marcus's own careful review
     before it goes anywhere near `main`, and flag explicitly if it
     touches the *live* daily flag (changing a flag's regions mid-day
     makes that day's scores inconsistent for players who filled it
     before vs. after).
   - **Safe** - everything else (plain JS/CSS/HTML bugs, layout issues,
     copy fixes, non-scoring logic, test/tooling fixes). Say it's
     low-risk and ready to apply as-is - Marcus (or a live Claude Code
     session, which does have real push access, unlike you) can apply
     the diff and push it without much extra scrutiny.
4. **Always tell Marcus what happened, every run**, even "all good,
   nothing to fix" - never a silent run. If a Gmail connector is
   available, email a short summary to childsmarcus2@gmail.com. Include:
   which daily flag was checked, what (if anything) was found, the tier,
   and - if you have a fix - the **full `git diff` output pasted directly
   in the email body** (a fenced code block is fine) so it can be applied
   with `git apply` without anyone needing to reach into a disposable
   session's workspace that won't exist by the time they read the email.
5. Never touch the Google Analytics ID, scoring constants, or
   `tools/countries.py`'s country list unless that's the specific fix
   being made (and remember: those are protected-tier either way).

## Playtesting a daily flag
- Run `npm install && npm run playtest:live` (`tools/playtest_live.mjs`).
  This is the routine's real playtest: it loads the **live** site
  (https://flagfillgame.vercel.app, not a local server), confirms today's
  Daily Challenge flag/country matches what the seeded-shuffle logic in
  `js/game.js` predicts, real-clicks every region at its published
  centroid (catches "no clickable pixels" bugs for real), submits, and
  checks the score is sane. It also does a **read-only** `GET
  /api/daily?date=<today>` against the live endpoint to confirm the API
  is healthy.
  - It does **not** actually POST a score to the live leaderboard (it
    intercepts that one request client-side) - a bot's fake score would
    permanently distort the real "today's average" / player count shown
    to players, and there's no way to undo that afterwards. Don't change
    this without a good reason; if you do POST for real for some reason,
    say so loudly in the run summary so Marcus knows today's live stats
    were touched.
  - Exit code 0 = all clear. Exit code 1 = at least one issue - see the
    JSON summary it prints (also written to `playtest-out/summary.json`)
    for exactly what failed: daily-flag mismatch, unclickable regions,
    console errors, bad score, or a broken `/api/daily`.
- `tools/shot.mjs` is a **separate, local-only** tool (spins up a
  throwaway static file server over the repo's own files) for quick
  visual-regression screenshots during development - it never touches the
  live site or the live API, so it's the wrong tool for the daily
  playtest. Use it for local rendering checks, use `playtest_live.mjs` for
  the actual daily routine.
- A region with "no clickable pixels" (see README's flag-build section)
  should never ship - that's a real bug worth fixing.

## Where to look
- `README.md` - full project docs: architecture, scoring formula, the
  region/pre-fill pipeline, deploy steps.
- `tools/build_flags.py` / `tools/countries.py` - regenerate or retune a
  flag's region map; per-country overrides live here.
- `tools/playtest_live.mjs` - the daily routine's live playtest (see
  above). `tools/shot.mjs` - local-only screenshot harness for dev use.

## Applying a fix from a routine email (for Marcus, or a live Claude session)
The scheduled routine only ever diagnoses and emails a diff - it never
pushes (see "Autonomous operation policy" above for why). To actually ship
a fix it found:
1. Read the diff in the email carefully if it's protected-tier; a
   safe-tier one needs less scrutiny but still worth a glance.
2. In a live session with real push access to this repo (Marcus's own
   `git`/VS Code, or a live Claude Code chat), save the diff to a file and
   run `git apply <file>`, or apply it by hand if it's short.
3. Commit and push to `main` as normal - there's no PR/review step, a push
   to `main` is how it goes live.

History: this used to be designed as an auto-push routine (agreed with
Marcus 21 Sep 2026, tiered safe/protected 25 Sep 2026), but testing on 25
Sep 2026 found the scheduled session can never get push credentials for
itself - see "Autonomous operation policy" above. The diagnose-and-email
design replaced it the same day.
