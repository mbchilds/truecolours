// Renders og.png (the 1200x630 link-preview image) from the real flag SVGs
// and the site's own fonts. Run: node tools/build_og.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS = ['fr','it','de','nl','ie','be','at','hu','ro','ng','jp','ch','se','lu','bg','ci'];
// Tiles left in colour (tile index -> flag), kept toward the edges so the wordmark sits on grey.
const COLOURED = new Map([[1,'fr'],[5,'jp'],[8,'it'],[15,'de'],[24,'se'],[31,'ng'],[38,'ch']]);
const COLS = 8, TILES = 40;

const symbols = FLAGS.map(f => {
  const s = readFileSync(join(root, 'flags', f + '.svg'), 'utf8').trim()
    .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<symbol id="f-${f}" viewBox="0 0 640 480">${s}</symbol>`;
}).join('');
const tiles = Array.from({ length: TILES }, (_, i) => {
  const f = COLOURED.get(i) ?? FLAGS[(i * 7) % FLAGS.length];
  return `<svg viewBox="0 0 640 480" class="${COLOURED.has(i) ? 'on' : ''}"><use href="#f-${f}"/></svg>`;
}).join('');

const fonts = join(root, 'fonts');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"Bricolage Grotesque";src:url("file://${fonts}/bricolage-grotesque-latin-opsz.woff2");font-weight:200 800}
@font-face{font-family:"Inter";src:url("file://${fonts}/inter-latin-wght.woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#0b1526;position:relative;color:#eef2f8}
.wall{position:absolute;inset:-12px;display:grid;grid-template-columns:repeat(${COLS},1fr);gap:14px;transform:rotate(-4deg) scale(1.1)}
.wall svg{width:100%;height:auto;display:block;border-radius:7px;filter:grayscale(1) brightness(.62) contrast(.9)}
.wall svg.on{filter:none;box-shadow:0 0 0 3px rgba(255,255,255,.25)}
.veil{position:absolute;inset:0;background:radial-gradient(560px 300px at 50% 50%,rgba(11,21,38,.94) 0,rgba(11,21,38,.8) 55%,rgba(11,21,38,0) 100%)}
.mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:19px}
h1{font:800 132px/.95 "Bricolage Grotesque",sans-serif;letter-spacing:-.03em}
h1 i{font-style:normal;color:#ff6b57}
.sub{font:500 36px/1.2 "Inter",sans-serif}
.sub2{font:400 26px/1 "Inter",sans-serif;color:#8fa0bd}
</style>
<svg width="0" height="0" style="position:absolute"><defs>${symbols}</defs></svg>
<div class="wall">${tiles}</div><div class="veil"></div>
<div class="mid"><h1>Flag<i>Fill</i></h1><p class="sub">Colour the world's flags from memory</p><p class="sub2">flagfillgame.vercel.app</p></div>`;

const tmp = join(mkdtempSync(join(tmpdir(), 'og-')), 'og.html');
writeFileSync(tmp, html);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + tmp);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'og.png') });
await browser.close();
console.log('wrote og.png');
