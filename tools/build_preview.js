// Bundles the whole game into ONE self-contained HTML file (flags embedded).
// Handy for sharing a preview without hosting. Usage: node tools/build_preview.js [--artifact]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = process.argv.includes('--artifact');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const manifest = JSON.parse(read('flags/manifest.json'));
const embedded = { manifest, svg: {}, bin: {} };
for (const f of manifest.flags) {
  embedded.svg[f.code] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'flags', f.code + '.svg')).toString('base64');
  embedded.bin[f.code] = fs.readFileSync(path.join(root, 'flags', f.code + '.bin')).toString('base64');
}
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + read('style.css') + '\n</style>');
html = html.replace(/<!-- Google Analytics[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/, '<!-- analytics disabled in preview build -->');
const scripts = ['js/color.js', 'js/picker.js', 'js/flagboard.js', 'js/game.js'].map(f => `<script>\n${read(f)}\n</script>`).join('\n');
html = html.replace(/<script src="js\/color.js"><\/script>[\s\S]*?<script src="js\/game.js"><\/script>/,
  `<script>window.EMBEDDED_FLAGS=${JSON.stringify(embedded)};</script>\n` + scripts);
if (artifact) {
  // Artifact hosting wraps the page itself: strip the document shell.
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head + body;
}
fs.writeFileSync(path.join(root, 'preview.html'), html);
console.log('wrote preview.html', (html.length / 1024 / 1024).toFixed(1), 'MB');
