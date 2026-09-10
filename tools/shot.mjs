// Screenshot harness: node tools/shot.mjs <outdir> <code>[:fillN] ... [--mobile]
// Renders the play screen for each flag; ":fillN" fills the first N regions with their real colour.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const [outdir, ...codes] = args.filter(a => !a.startsWith('--'));
fs.mkdirSync(outdir, { recursive: true });

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  let p = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
}).listen(0);
const port = srv.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1100, height: 900 }, deviceScaleFactor: mobile ? 3 : 1 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.TC);
for (const spec of codes) {
  const [code, fillN] = spec.split(':');
  await page.evaluate(c => TC.play([c]), code);
  await page.waitForFunction(() => document.getElementById('flag-loading').hidden);
  if (fillN) {
    await page.evaluate(n => {
      const meta = TC.state.meta, c = document.getElementById('flag-canvas'), r = c.getBoundingClientRect();
      const m = TC.manifest;
      meta.regions.slice(0, +n).forEach(reg => {
        TC.board.currentColour = reg.hex;
        TC.board.fill(reg.id, reg.hex);
      });
    }, fillN);
  }
  await page.locator('#flag-canvas').screenshot({ path: path.join(outdir, `${code}${fillN ? '-f' + fillN : ''}${mobile ? '-m' : ''}.png`) });
  console.log('shot', spec);
}
await browser.close(); srv.close();
