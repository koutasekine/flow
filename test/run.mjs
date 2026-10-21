// フローチャートの自動検査: 例題を読み込み、パース・配置・自己検査・往復変換(テキスト→AST→テキスト)を確かめ、PNG を出力する
const { chromium } = await import(process.env.PW || 'playwright');
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.resolve(here, '..', 'index.html');
const outDir = path.resolve(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const samples = {};
for (const f of fs.readdirSync(path.join(here, 'samples'))) {
  if (f.endsWith('.py')) samples[f.replace(/\.py$/, '')] = fs.readFileSync(path.join(here, 'samples', f), 'utf8');
}
const errSamples = {};
for (const f of fs.readdirSync(path.join(here, 'errors'))) {
  if (f.endsWith('.py')) errSamples[f.replace(/\.py$/, '')] = fs.readFileSync(path.join(here, 'errors', f), 'utf8');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto('file://' + html);

let fail = 0;
for (const [name, src] of Object.entries(samples)) {
  const r = await page.evaluate((src) => {
    const prog = FLOW.parse(src);
    const charts = FLOW.layoutProgram(prog, {});
    const issues = FLOW.check(charts);
    const printed = FLOW.print(prog);
    const prog2 = FLOW.parse(printed);
    const printed2 = FLOW.print(prog2);
    const nodes = charts.reduce((a, c) => a + c.nodes.length, 0);
    return { issues, roundtrip: printed === printed2, printed, nodes, charts: charts.length };
  }, src);
  // ページ分割(A4 縦)でも各ページが規格の検査を通り、結合子が対になっていること
  const pg = await page.evaluate((src) => {
    const prog = FLOW.parse(src);
    const charts = FLOW.layoutProgram(prog, {});
    const svgs = FLOW.renderPaged(charts, {}, FLOW.PAGE.A4P);
    const issues = [];
    for (const c of charts) {
      // renderPaged は charts を変更済み(ページ分割後)。ページごとに検査
      const names = {};
      for (const nd of c.nodes) if (nd.kind === 'connector' && /^\d+$/.test(nd.text)) { names[nd.text] = (names[nd.text] || 0) + 1; }
      for (const k in names) if (names[k] !== 2) issues.push(`ページ結合子 ${k} が対になっていない`);
      issues.push(...FLOW.check([c]).filter(i => !i.includes('寸法')));
    }
    // 分割後の短冊に、すべての線と記号がちょうど 1 回ずつ入っていること(線の取りこぼし検査)
    const charts2 = FLOW.layoutProgram(FLOW.parse(src), {});
    for (const c of charts2) {
      const strips = FLOW.paginate(c, 900);
      const nE = strips.reduce((a, s) => a + s.edges.length, 0), nN = strips.reduce((a, s) => a + s.nodes.length, 0);
      if (nE !== c.edges.length) issues.push(`分割で線が ${c.edges.length - nE} 本落ちた(短冊 ${strips.length})`);
      if (nN !== c.nodes.length) issues.push(`分割で記号が ${c.nodes.length - nN} 個落ちた`);
      for (const s of strips) for (const e of s.edges) for (const p of e.pts) if (p[1] < s.y0 - 0.5 || p[1] > s.y1 + 0.5) { issues.push(`分割後の線が短冊の外に出ている y=${p[1]} [${s.y0},${s.y1}]`); break; }
    }
    return { pages: svgs.length, issues, overflow: charts.some(c => c.overflow) };
  }, src);
  r.issues.push(...pg.issues.map(i => '[分割] ' + i));
  const ok = r.issues.length === 0 && r.roundtrip;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: nodes=${r.nodes} charts=${r.charts} pages(A4)=${pg.pages}${pg.overflow ? ' (overflow)' : ''} issues=${r.issues.length} roundtrip=${r.roundtrip}`);
  for (const i of r.issues) console.log('   -', i);
  if (!r.roundtrip) { console.log('--- printed ---\n' + r.printed); }
  // 描画して PNG に
  await page.evaluate((src) => { document.querySelector('#src').value = src; render(); }, src);
  const svgText = await page.evaluate(() => svgText());
  fs.writeFileSync(path.join(outDir, name + '.svg'), svgText);
  const p2 = await browser.newPage();
  await p2.setContent('<!doctype html><body style="margin:0">' + svgText.replace(/^[\s\S]*?<svg/, '<svg') + '</body>');
  await p2.screenshot({ path: path.join(outDir, name + '.png'), fullPage: true });
  await p2.close();
}
for (const [name, src] of Object.entries(errSamples)) {
  const r = await page.evaluate((src) => { try { FLOW.parse(src); return null; } catch (e) { return { line: e.line, msg: e.message }; } }, src);
  const expect = /#\s*expect:\s*(\d+)/.exec(src);
  const ok = r && (!expect || r.line === parseInt(expect[1], 10));
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} error/${name}: ${r ? r.line + ' 行目: ' + r.msg : 'エラーにならなかった'}`);
}
await browser.close();
console.log(fail ? `\n${fail} 件 FAIL` : '\nすべて PASS');
process.exit(fail ? 1 : 0);
