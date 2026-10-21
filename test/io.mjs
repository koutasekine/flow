// 保存・読込の検査: SVG に埋め込んだ JSON から元のテキストが復元できるか、PNG が生成されるか
const { chromium } = await import(process.env.PW || 'playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.resolve(here, '..', 'index.html');
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto('file://' + html);
let fail = 0; const expect = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const src = fs.readFileSync(path.join(here, 'samples', '05_func.py'), 'utf8');
await page.fill('#src', src); await page.waitForTimeout(300);
for (const kind of ['json', 'svg', 'py', 'png']) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.selectOption('#saveAs', kind)]);
  const p = path.join(here, 'out', 'dl_' + dl.suggestedFilename());
  await dl.saveAs(p);
  const size = fs.statSync(p).size;
  expect(size > 100, `保存 ${kind}: ${dl.suggestedFilename()} ${size} bytes`);
}
// SVG → 読込
const svgT = fs.readFileSync(path.join(here, 'out', 'dl_flowchart.svg'), 'utf8');
await page.fill('#src', '');
await page.setInputFiles('#fileOpen', path.join(here, 'out', 'dl_flowchart.svg'));
await page.waitForTimeout(300);
expect((await page.inputValue('#src')) === src, 'SVG からの再読込で元のテキストが復元される');
await page.fill('#src', '');
await page.setInputFiles('#fileOpen', path.join(here, 'out', 'dl_flowchart.json'));
await page.waitForTimeout(300);
expect((await page.inputValue('#src')) === src, 'JSON からの再読込');
await page.fill('#src', '');
await page.setInputFiles('#fileOpen', path.join(here, 'out', 'dl_flowchart.py'));
await page.waitForTimeout(300);
expect((await page.inputValue('#src')) === src, '.py からの再読込');
// PNG の寸法
const png = fs.readFileSync(path.join(here, 'out', 'dl_flowchart.png'));
expect(png.slice(1, 4).toString() === 'PNG', 'PNG の署名');
await browser.close();
console.log(fail ? `\n${fail} 件 FAIL` : '\nすべて PASS');
process.exit(fail ? 1 : 0);
