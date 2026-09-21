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

## Autonomous operation policy (agreed with Marcus, 21 Sep 2026)
- **Diagnose and prepare fixes autonomously, but push to `main` only with
  Marcus's approval.** If you find a bug (visual, scoring, daily-API,
  flag region/colour data, anything) investigate it, write the fix, and
  have it ready to go - but the push itself is a permission-gated action,
  not something to run unattended. Marcus gets a push notification on his
  phone and taps approve/deny from wherever he is; that tap is the final
  call, not a rubber stamp assumed in advance.
  - This applies with extra weight to flag region/colour data changes on
    a day that flag is the live daily - changing a flag's regions mid-day
    makes that day's scores inconsistent for players who filled it before
    vs. after the change, so make sure the approval request says clearly
    when a fix touches the live daily flag.
- **Always tell Marcus what happened, every run**, even "all good, nothing
  to fix" - never a silent run. If a Gmail connector is available, email
  a short summary to childsmarcus2@gmail.com. Keep it to a few lines:
  which daily flag was checked, what (if anything) was found, what the
  proposed fix is (with a link/diff to review), and whether it's
  pending his approval, already approved and pushed, or not applicable.
- Never touch the Google Analytics ID, scoring constants, or
  `tools/countries.py`'s country list unless that's the specific fix
  being made.

## Playtesting a daily flag
- Use Playwright (`tools/shot.mjs` in this repo is an existing screenshot
  harness - extend it rather than starting from scratch).
- Load the live site, confirm today's Daily Challenge flag and country
  name match what the seeded-shuffle logic in `js/game.js`
  (`CONFIG.dailyEpoch`) predicts for today's date.
- Check the page loads without console errors, the colour picker works,
  regions are clickable and fillable, submitting produces a sane score,
  and `/api/daily?date=<today>` returns 200 with sane stats.
- A region with "no clickable pixels" (see README's flag-build section)
  should never ship - that's a real bug worth fixing and pushing.

## Where to look
- `README.md` - full project docs: architecture, scoring formula, the
  region/pre-fill pipeline, deploy steps.
- `tools/build_flags.py` / `tools/countries.py` - regenerate or retune a
  flag's region map; per-country overrides live here.
- `tools/shot.mjs` - Playwright screenshot harness for a real-rendering
  check.

phone-approval workflow configured, not yet tested - 21 Sep 2026
