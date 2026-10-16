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
* **Past dailies** - once today's daily is done, play or look back at any earlier day. See
  "Past dailies" below.

Everything is plain HTML/CSS/JS - no build step, no framework. It runs on Vercel with
one serverless function for the daily-challenge stats.

## Project layout

```
index.html          the whole UI (all screens are sections toggled by game.js)
style.css           theme + layout
js/color.js         colour maths: HSV/RGB/Lab conversions, CIEDE2000, points curve
js/streak.js        consecutive-day streak maths and the past-days calendar (pure functions, no DOM or storage)
js/picker.js        the colour picker component
js/privacy.js       the analytics choice (Google Analytics only loads after "accept"), cookie cleanup, "delete my data"
js/flagboard.js     loads a flag's region map and draws / fills the canvas
js/game.js          screens, modes, scoring, daily challenge, share, analytics events
flagcheck.html      dev tool: play every flag in the catalogue one after another
js/flagcheck.js     logic for flagcheck.html (see "Checking every flag" below)
flags/              one .svg + one .bin (region map) per country, plus manifest.json
fonts/              the two self-hosted fonts (variable woff2) and their licence texts
privacy.html        privacy policy, incl. the cookie list (#cookies) and the player's controls (#your-choices)
terms.html          terms of use, incl. credits and licences (#credits)
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
(for the "you beat X%" figure) and a set of random client ids so a player is only counted
once. No names, emails or other details are stored. The browser does not send its stored id:
it sends a one-way hash of that id and the date (`dayCode()` in `js/game.js`), so the set holds
a different code for the same player each day and nothing on the server can follow a player
from one day to the next. The set expires 3 days after the last new player is added (and
codes are only accepted for today and yesterday), so a code is gone within 5 days; the three
totals contain no codes and are kept. The score itself is
calculated in the browser, so a determined person could fake a score - fine for a friendly
daily, but don't run a prize competition on it.

## Google Analytics

Analytics is **opt-in**. Nothing is requested from Google until the visitor presses "Accept
analytics" in the banner on the home screen (or on the privacy page); "Reject analytics" and not
choosing both mean no analytics. `js/privacy.js` then loads the GA4 tag with Measurement ID
`G-SR1N5CH6R0`, which lives in `<meta name="ga-measurement-id">` in the `<head>` of `index.html`
(swap it there if you create a new data stream; take the tag out and there is no analytics and no
banner, which is how `tools/build_preview.js` builds the single-file preview). It is configured
with analytics storage only: no ad storage, Google signals or ad personalisation, and a 1-year
cookie.

In the GA admin (these can't be set from the code, and the policy relies on them): set event data
retention to 2 months (the policy promises no more than 14, Google's maximum), keep Google signals
off, don't link the property to Google Ads, turn off the data-sharing settings you don't need, and
consider switching off the Enhanced measurement options you don't use.

Custom events sent (only when accepted): `start_daily`, `start_quick`, `round_complete`,
`daily_complete`, `quick_complete`, `share`, `streak` (`mode` = `daily` or `quick`, `days` = the
streak length just reached; sent once when a day is first counted, not when a saved result is
reopened), and `start_archive` / `archive_complete` for catch-up plays of past days (those never
send `daily_complete` or `streak`).

### Previews and the live leaderboard

Preview deployments (any branch other than `main`) use the same Upstash database as production
(the `KV_` variables are set for Production, Preview and Development), so a score submitted on a
preview lands in the real leaderboard. To try a preview without that, open it with `?nopost` (or
`#nopost`) on the end of the URL: that tab then never submits scores, says so on the home screen,
and stays that way until the tab is closed.

## Privacy, cookies and the legal pages

* **What is stored where.** The game saves your streaks, daily results and a random id in the
  browser's localStorage (`tc:` keys). The only things that leave the device are the daily score,
  date and random id (to the leaderboard, on the day itself) and, if accepted, Google Analytics.
  The game sets no cookies of its own; the only cookies are Google's `_ga` and `_ga_<id>`.
* **The choice.** Kept in `tc:consent` (`{ v, a, t }`: version, accepted, when). Bump `VERSION` in
  `js/privacy.js` to ask everyone again. "Cookie settings" at the bottom of the home screen reopens
  the banner, withdrawing deletes the Google cookies and stops sending, and the same controls are on
  `privacy.html#your-choices`, together with **Delete my data**, which removes every `tc:` key
  (except the dev tool's `tc:flagcheck`) and the Google cookies from that browser.
* **Keep the policy true.** `privacy.html` lists every storage key, cookie, third party and
  retention period. If you add a storage key, a third-party script, new analytics events or change
  what the API receives or how long it keeps it, change that page (and its "last updated" date) in
  the same commit. The operator and contact details are in `privacy.html` and `terms.html`.
* **No third-party requests on load.** The fonts are self-hosted (`fonts/`, with their SIL Open Font
  Licence texts); the flag artwork, map and everything else are served from the site. Google
  Analytics is the only third-party script and only after consent.
* **Fonts are cached for a year.** `vercel.json` serves `/fonts/*` as immutable, so if you ever
  change a font file, give it a new file name (and update the `@font-face` rule and the preloads).
* **Not everything in the repo is published.** `.vercelignore` keeps `CLAUDE.md`, `README.md` and
  `tools/` out of the deployment; without it Vercel serves the whole repository as static files.
* **Licences.** flag-icons (MIT) and Natural Earth (public domain) are credited on the home screen
  and in `terms.html#credits`, with their licence files shipped alongside the data
  (`flags/LICENSE-flag-icons.txt`, `globe/LICENSE-naturalearth.txt`, `fonts/OFL-*.txt`). The icons
  in `index.html` are drawn for FlagFill.

## Accessibility

* The game can be played with the keyboard alone. Tab to the flag board: the selected region gets a
  dashed outline, the arrow keys (or Home / End) move between regions in reading order, Enter or
  Space fills it with the current colour, and a screen-reader status line says which region it is
  (position, size and what you filled it with, never the real colour). The picker's colour area and
  hue bar are sliders with spoken values, and a hex code can be typed.
* Each screen has one `h1` and focus moves to it when the screen changes. The how-it-works dialog
  is a modal dialog (focus in, page behind it inert, Escape closes, focus returns). The result
  pictures have text alternatives and the animated score is replaced by a plain-text summary for
  screen readers. `prefers-reduced-motion` switches the animations and the score count-up off.
* Text colours meet WCAG AA (4.5:1; 3:1 for large text) against the real backgrounds, including the
  card glows and the globe. Primary buttons use dark text on the coral gradient for that reason; if
  you change `--muted` or the glows, re-check. Quick check: run axe-core on each screen, and
  measure text against the pixels behind it, since axe can't judge gradients.

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
* Days played late as a catch-up (see "Past dailies") never count towards a streak.

## Past dailies

Once today's Daily Challenge is done, every earlier day back to Daily #1 opens up. Tap a day in the
streak card's week strip, step with the ‹ › arrows at the top of any daily screen, or open **All
days** (also linked from the home screen) for a calendar of every day so far. Each day can be
played once: a day you haven't played starts a **catch-up**, and a day you have played always
shows its saved result (coloured flag and breakdown), never a second attempt.

* **Unlock rule**: past days are available once today's daily has a saved result. If the clock
  rolls over to a new day they lock again until that day is played.
* **Catch-ups don't count towards a streak** (they can't extend, repair or join one) and are
  **never sent to the leaderboard**. `api/daily.js` only takes today and yesterday anyway, and is
  unchanged. They do count towards the all-time numbers: dailies played and the all-time average
  (the streak card's own average stays on-time days only). The week strip, calendar and result card
  show them in a deeper shade of gold than a day played on the day.
* Saved results (`tc:daily:<date>`) now also record `code` (the flag) and `v` (its version in the
  manifest), plus `late: true` for a catch-up. Results saved before that carry neither, so the flag
  is found by re-scoring the saved colouring against the likely candidates (the flag for that date
  today, and the one the shuffle originally gave before flags could be taken out of play) and
  keeping the one that reproduces the saved score. If none does (the flag has been redrawn since),
  the day shows its score without the colouring.
* The calendar layout is `calendar()` in `js/streak.js` (covered by `npm run test:streak`); the
  screens are in the "past days" section of `js/game.js`.

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
`flags/LICENSE-flag-icons.txt`). Fonts: Bricolage Grotesque and Inter, self-hosted from `fonts/`
(SIL Open Font Licence 1.1, texts alongside). Map: Natural Earth (public domain).
