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
Every fix falls into exactly one of two tiers. Decide the tier from the
**files the fix touches**, not from how big or scary it feels.

- **Protected paths - always require Marcus's explicit approval before
  pushing, no exceptions:**
  - `flags/` (region maps, SVGs, manifest) and `tools/build_flags.py` /
    `tools/countries.py` - any flag region/colour/grouping change.
  - `js/color.js` scoring constants (the CIEDE2000 curve / points formula).
  - `js/game.js` `CONFIG.dailyEpoch`, `CONFIG.dailySeed`, or anything that
    changes which flag is today's (or any day's) Daily Challenge.
  - The Google Analytics ID in `index.html`.
  - `api/daily.js` and anything touching the Redis schema/keys.
  - Anything the fix's own diff is large, unusual, or you're not fully
    confident about - when in doubt, treat it as protected.
  - For these: diagnose, write the fix, commit it to a branch (do **not**
    push to `main`), and email/flag it to Marcus with a clear diff/link
    and an explicit note if it touches the *live* daily flag (changing a
    flag's regions mid-day makes that day's scores inconsistent for
    players who filled it before vs. after). Wait for his explicit
    approval before merging/pushing - a push notification and tap, not a
    rubber stamp assumed in advance.
- **Everything else (safe) - push to `main` automatically once verified:**
  plain JS/CSS/HTML bugs, layout issues, copy fixes, non-scoring logic,
  test/tooling fixes, anything outside the protected paths above. Push
  automatically once `npm run playtest:live` (see below) passes clean
  against the fix. No approval needed for these - that's the whole point
  of this tier.
  - **Before your first `git push` in a session**, call the `add_repo`
    tool (`mcp__claude-code-remote__add_repo`, owner `mbchilds`, repo
    `truecolours`, `access: "push"`). Cloning/reading works without this
    (the git proxy serves anonymous reads), but pushing needs the repo
    explicitly attached with push credentials for *this specific
    session* - a fresh scheduled session doesn't inherit that from any
    earlier session, and a plain `git push` will 403 with "not in this
    session's authorized repository set" if you skip this step. This
    bit a real run on 25 Sep 2026 (a harmless `package-lock.json` commit
    got stuck unpushed) - don't repeat it.
- **Always tell Marcus what happened, every run**, even "all good, nothing
  to fix" - never a silent run. If a Gmail connector is available, email
  a short summary to childsmarcus2@gmail.com. Say which tier applied,
  which daily flag was checked, what (if anything) was found/fixed, and
  whether it's already pushed live or pending approval (with a link/diff).
- Never touch the Google Analytics ID, scoring constants, or
  `tools/countries.py`'s country list unless that's the specific fix
  being made (and remember: those are protected-path changes either way).

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
  should never ship - that's a real bug worth fixing and pushing.

## Where to look
- `README.md` - full project docs: architecture, scoring formula, the
  region/pre-fill pipeline, deploy steps.
- `tools/build_flags.py` / `tools/countries.py` - regenerate or retune a
  flag's region map; per-country overrides live here.
- `tools/playtest_live.mjs` - the daily routine's live playtest (see
  above). `tools/shot.mjs` - local-only screenshot harness for dev use.

phone-approval workflow configured and tiered (safe auto-push / protected
approval-gated) - 25 Sep 2026. Note: this scheduled task still needs
"Automatically approve" turned on in its own settings for the safe-tier
auto-push to actually go through unattended - without that, the platform's
permission gate will stop and wait even for safe-path pushes. The tiering
above is what keeps that safe, since protected-path changes are never
pushed by this routine regardless of that setting.
