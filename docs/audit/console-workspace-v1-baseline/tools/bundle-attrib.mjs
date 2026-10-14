// Attribute minified JS bytes to source groups by decoding the sourcemap.
import fs from 'node:fs';
const [, , jsPath] = process.argv;
const code = fs.readFileSync(jsPath, 'utf8');
const map = JSON.parse(fs.readFileSync(jsPath + '.map', 'utf8'));
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lines = code.split('\n');
const bytes = new Map();
let src = 0;
map.mappings.split(';').forEach((seg, li) => {
  const line = lines[li] ?? '';
  let col = 0; const marks = [];
  for (const s of seg.split(',')) {
    if (!s) continue;
    const vals = []; let v = 0, shift = 0;
    for (const ch of s) { let d = B64.indexOf(ch); const cont = d & 32; d &= 31; v += d << shift;
      if (cont) shift += 5; else { vals.push(v & 1 ? -(v >> 1) : v >> 1); v = 0; shift = 0; } }
    col += vals[0]; if (vals.length > 1) src += vals[1];
    marks.push([col, vals.length > 1 ? src : -1]);
  }
  marks.forEach(([c, s], i) => { const end = i + 1 < marks.length ? marks[i + 1][0] : line.length;
    const k = s < 0 ? '(unmapped)' : map.sources[s]; bytes.set(k, (bytes.get(k) ?? 0) + (end - c)); });
});
const group = (p) => { p = p.split(String.fromCharCode(92)).join('/');
  if (p.includes('node_modules')) { const m = p.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/); return 'npm:' + (m ? m[1] : '?'); }
  if (p.includes('packages/contracts')) return 'contracts';
  const m = p.match(/src\/([^/]+)/); return m ? 'web:' + m[1].replace(/\.tsx?$/, '') : p; };
const g = new Map(); for (const [k, b] of bytes) g.set(group(k), (g.get(group(k)) ?? 0) + b);
const total = code.length; const rows = [...g].sort((a, b) => b[1] - a[1]);
console.log('total minified bytes', total);
for (const [k, b] of rows) if (b > 4000) console.log(String((b / 1024).toFixed(1)).padStart(7), 'KB', (100 * b / total).toFixed(1).padStart(5) + '%', k);
