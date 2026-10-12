# FlagFill

A web game about how well you *really* know the world's flags. You get a flag as a
colouring-book outline plus the country name, a full colour picker and a fill tool.
Colour it in from memory, submit, and score up to 1,000 points per flag depending on
how close each of your colours is to the real thing.

* **Daily Challenge** - one flag per day (resets at midnight UTC), the same for every
  player. One attempt. Shows your score, the average, how many players you beat, and a
  share button.
* **Quick Play** - five random flags, no repeats, up to 5,000 points.
* **Streaks** - play the Daily Challenge (or finish a Quick Play game) on consecutive days to
  build a streak. See "Streaks" below.

Everything is plain HTML/CSS/JS - no build step, no framework. It runs on Vercel with
one serverless function for the daily-challenge stats.

## Project layout

```
index.html          the whole UI (all screens are sections toggled by game.js)
style.css           theme + layout
js/color.js         colour maths: HSV/RGB/Lab conversions, CIEDE2000, points curve
js/streak.js        consecutive-day streak maths (pure functions, no DOM or storage)
js/picker.js        the colour picker component
js/flagboard.js     loads a flag's region map and draws / fills the canvas
js/game.js          screens, modes, scoring, daily challenge, share, analytics events
flagcheck.html      dev tool: play every flag in the catalogue one after another
js/flagcheck.js     logic for flagcheck.html (see "Checking every flag" below)
flags/              one .svg + one .bin (region map) per country, plus manifest.json
api/daily.js        Vercel serverless function (daily scores, Upstash Redis)
tools/build_flags.py   regenerates flags/ from the flag-icons SVG set
tools/build_preview.js bundles everything into one preview.html (no server needed)
tools/countries.py     which countries are included + display-name overrides
tools/test_streak.mjs  unit tests for js/streak.js (npm run test:streak)
```

## Running it locally

Any static server works for the game itself:

```
npx serve .          # then open http://localhost:3000
```

To also run the `/api/daily` function locally, use the Vercel CLI (`npm i -g vercel`,
then `vercel dev`) with the Redis environment variables set (see below). Without the
API the game still works - the daily result just says the leaderboard couldn't be
reached.

## Deploying to Vercel

1. Push this folder to a GitHub repo and import it in Vercel exactly as you did for
   your previous game. No framework preset, no build command - it's a static site with
   an `api/` folder, which Vercel picks up automatically.
2. Add the database for daily-challenge stats:
   * In the Vercel dashboard open your project → **Storage** → **Create Database** →
     choose **Upstash** → **Redis** (the free plan is plenty).
   * Connect it to the project. Vercel adds the environment variables
     `KV_REST_API_URL` and `KV_REST_API_TOKEN` (older integrations use
     `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; the function accepts either).
   * Redeploy once so the function sees the variables.
3. Open the site, play the daily, and you should see "1 player so far" on the result
   screen. `GET https://your-site/api/daily` returns today's stats as JSON if you want
   to check it directly.

### What the API stores

Per day, in Redis: a player count, a score sum, a histogram of scores in buckets of 50
(for the "you beat X%" figure) and a set of anonymous client ids so a player is only
counted once. Nothing personal is stored. The score itself is calculated in the browser,
so a determined person could fake a score - fine for a friendly daily, but don't run a
prize competition on it.

## Google Analytics

The GA4 snippet is in the `<head>` of `index.html` with Measurement ID `G-SR1N5CH6R0`
(your existing property). If you'd rather keep this site's numbers separate, create a
new data stream or property in GA and swap the ID in the two places it appears.

Custom events sent: `start_daily`, `start_quick`, `round_complete`, `daily_complete`,
`quick_complete`, `share`, and `streak` (`mode` = `daily` or `quick`, `days` = the streak length
just reached; sent once when a day is first counted, not when a saved result is reopened).

## How scoring works

* Every distinct colour in the real flag is worth an equal share of 1,000 points
  (so the USA is red/white/blue, a third each). If one colour covers several regions
  (the 7 red stripes), those regions are weighted by area within that share.
* Your colour is compared to the real one with **CIEDE2000** (ΔE), the industry
  standard for perceived colour difference. ΔE < 1 (invisible to the eye) = 1,000
  points; the curve is `1000 · exp(-(ΔE/25)²)` and hits 0 at ΔE 50 (a completely
  different colour). The three constants live at the bottom of `js/color.js`
  (`SCORE_FALLOFF`, `SCORE_ZERO_AT`, `PERFECT_BELOW`) if you want it harsher or kinder.
* Reference colours come straight from the flag-icons SVGs.

## Streaks

A day counts towards a streak once you've played it: the Daily Challenge, or a finished Quick
Play game (all five flags). Each mode has its own streak. It shows as a pill on the mode's
home-screen card and as a card under the score on the result screen ("Played 5 days in a row,
averaging 874/1000" - the average is the mean score per flag across the streak). The daily share
text carries a streak line too. A streak survives until a whole day passes with no play, so
having played yesterday but not yet today shows "play today to keep it".

* Days are **UTC**, the same clock as the daily reset.
* Everything lives **in the browser**: nothing is sent to the server and `api/daily.js` / Redis
  are untouched. So a streak is per device and browser, and clearing site data resets it.
* The **daily streak is read from the saved daily results** (`tc:daily:<date>`), so players who
  were already playing kept their streak when this shipped. **Quick Play** keeps its own small
  per-day log in `tc:qdays` (`{"2026-10-12": {"n": flags played, "sum": points}}`).
* The maths is in `js/streak.js` and is covered by `npm run test:streak`. The home pills, result
  cards and share line are in the "streaks" section of `js/game.js`; the milestone badges
  (3, 7, 14, 30, 50, 100 and 365 days) are the `MILESTONES` table there.

## The flags and the pre-fill rule

`tools/build_flags.py` rasterises every flag, finds each contiguous block of colour
and decides what the player has to fill:

* regions covering **at least 1%** of the flag are fillable (`PREFILL_THRESHOLD`);
* anything smaller (coats of arms, small stars, lettering) is pre-filled from the
  real flag and the game shows "Some fine details of this flag have been filled in for you";
* hairline rendering artefacts get absorbed into their neighbour (`SLIVER_MAX`);
* colours that are perceptually identical are merged (`NEAR_IDENTICAL`).

Three per-country override tables live in `tools/countries.py`:

* `STRICT` - countries where only the plain 1% rule applies (no small-shape rescue).
* `THRESHOLDS` - a custom minimum region size for one country.
* `GROUPS` - hand-tuned grouping. Each entry picks pixels of one colour (optionally
  limited by boxes, seed points, or "only the small pieces") and either merges them
  into one fillable region (stripes fill together, stars fill together, a linework
  emblem fills as one piece) or absorbs them into an existing region (a sliver that
  would give a background colour away). The comments above `GROUPS` document the
  fields; the existing entries are good examples.

To retune, edit the constants at the top and re-run:

```
pip install numpy scipy pillow resvg-py
npm pack flag-icons && tar xzf flag-icons-*.tgz        # gives ./package/flags/4x3/*.svg
FLAG_SRC=./package python3 tools/build_flags.py
```

It prints a line per country (regions, colours, % pre-filled) and writes review images to
`tools/preview/` so you can eyeball the outlines. `FLAG_ONLY=bn,et python3 tools/build_flags.py`
rebuilds just those countries and splices them into the existing manifest (a full build
takes about four minutes). The build warns `WARNING <code>: region ... has no clickable
pixels` if a region ends up too thin to click - never ship a build with that warning, as the
game would wait for a fill that can't happen.

For a real-rendering check, `npm i playwright && node tools/shot.mjs out/ ir zm:5 --mobile`
screenshots the play screen for those flags (`:N` fills the first N regions with their
true colours). Adding or removing a country is a
one-line change in `tools/countries.py`. **Note:** changing the set of countries
re-shuffles the daily order, so do that between days rather than mid-day.

The daily flag is chosen by a fixed seeded shuffle of the catalogue, indexed by the
number of days since `CONFIG.dailyEpoch` in `js/game.js` (Daily #1 = 1 Sep 2026). It
therefore needs no server and everyone's browser agrees on the flag.

## Checking every flag

`flagcheck.html` is a dev tool for playtesting the whole catalogue by hand - not a
game mode, not linked from `index.html`, just a page you open directly (locally or on
the deployed site) when you want to click through every flag and eyeball its regions.
It plays exactly like a normal round (pick a colour, click a region, "Score it" for a
breakdown) plus:

* a counter and a "Jump to" dropdown of every flag, so you can go through in order or
  drop straight to one;
* **Skip** - move to the next flag without recording anything;
* **Flag is fine** - marks the current flag done and moves to the next. Marked flags
  get a ✓ in the dropdown and count towards "Marked fine" in the header.

The fine-marks are kept in that browser's `localStorage` only (nothing is sent
anywhere) - "Reset all fine marks" at the bottom clears them and starts the pass over.
Since it's a plain page with no auth, don't rely on it being private if the URL leaks;
there's nothing sensitive on it, just play-testing state.

## Outlines

The colouring-book outlines are drawn in `js/flagboard.js`. A *seam* between two fillable
regions is a 1px grey line on each side; once a region is filled its side of the seam becomes
a slightly darkened version of the fill colour. Where a fillable region meets pre-filled
detail (emblem linework, lettering) there is a lighter 1px line on the fillable side only,
which disappears when the region is filled - so fine detail such as Iran's border script
does not turn into a black smear. Pre-filled pixels never get ink. Constants at the top of
the file: `SEAM_INK`, `SEAM_DARKEN`, `DETAIL_INK`.

## Single-file preview

`node tools/build_preview.js` writes `preview.html` with every flag embedded - open it
straight from disk or send it to someone. The API is not available in that build.

## Credits

Flag artwork from [flag-icons](https://github.com/lipis/flag-icons) (MIT, licence in
`flags/LICENSE-flag-icons.txt`). Fonts: Bricolage Grotesque and Inter via Google Fonts.
