// GUI の構造化編集の検査: 記号を選んで文字を変える / 挿入 / 削除 → テキストに反映されるか
const { chromium } = await import(process.env.PW || 'playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.resolve(here, '..', 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
page.on('dialog', d => d.accept());
await page.goto('file://' + html);
let fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

await page.click('#btnSample');
await page.waitForTimeout(200);
expect((await page.inputValue('#src')).includes('while i <= n:'), '例の読み込み');

// 処理 "s = 0" を選んで文字を変える
const sel = async (text) => {
  const ids = await page.$$eval('#view svg .sym', gs => gs.map(g => [g.getAttribute('data-id'), g.querySelector('text')?.textContent]));
  const id = ids.find(([, t]) => t === text)?.[0];
  if (!id) throw new Error('記号が見つからない: ' + text);
  await page.click(`#view svg .sym[data-id="${id}"]`, { force: true });
  await page.waitForTimeout(100);
};
await sel('s = 0');
expect(await page.isVisible('#edit'), '選択で編集パネルが出る');
await page.fill('#edit input[data-k="text"]', 's = 100');
await page.press('#edit input[data-k="text"]', 'Enter');
await page.waitForTimeout(250);
expect((await page.inputValue('#src')).includes('s = 100'), '文字の変更がテキストに反映');

// 条件を変える
await sel('i <= n');
await page.fill('#edit input[data-k="cond"]', 'i < n');
await page.press('#edit input[data-k="cond"]', 'Enter');
await page.waitForTimeout(250);
expect((await page.inputValue('#src')).includes('while i < n:'), '条件の変更がテキストに反映');

// 挿入: "i = 1" の後に出力
await sel('i = 1');
await page.selectOption('#edit select:not([data-k])', 'after');
await page.selectOption('#edit select:last-of-type', 'output');
await page.waitForTimeout(250);
let src = await page.inputValue('#src');
expect(/i = 1\nprint\(x\)/.test(src), '記号の挿入がテキストに反映');

// 挿入: while 本体の先頭に if/else
await sel('i < n');
await page.selectOption('#edit select:not([data-k])', 'body');
await page.selectOption('#edit select:last-of-type', 'ifelse');
await page.waitForTimeout(250);
src = await page.inputValue('#src');
expect(/while i < n:\n    if x > 0:\n        x = 0\n    else:\n        x = 0\n/.test(src), 'ループ本体への if/else の挿入');

// 削除
await sel('print(x)' ) .catch(()=>{});
await sel('x を出力');
await page.click('#edit button:has-text("この記号を削除")');
await page.waitForTimeout(250);
src = await page.inputValue('#src');
expect(!src.includes('print(x)'), '記号の削除がテキストに反映');

// else を削除
await sel('x > 0');
await page.click('#edit button:has-text("else を削除")');
await page.waitForTimeout(250);
src = await page.inputValue('#src');
expect(!/else:/.test(src.split('if x > 0')[1].split('if s')[0]), 'else の削除');

// 注釈の編集
await sel('s = 100');
await page.fill('#edit input[data-k="comment"]', '初期化');
await page.press('#edit input[data-k="comment"]', 'Enter');
await page.waitForTimeout(250);
src = await page.inputValue('#src');
expect(src.includes('s = 100  # 初期化'), '注釈の編集');

// 自己検査に問題がないこと
const msg = await page.textContent('#msg');
expect(!msg.includes('問題'), '編集後の内部検査: ' + msg.trim());

// 新規から GUI だけで作る
await page.click('#btnNew'); await page.waitForTimeout(300);
expect((await page.$$('#view svg .sym')).length === 2, '新規で「開始」「終了」が出る');
await page.click('#view svg .sym[data-id="start_main"]', { force: true }); await page.waitForTimeout(100);
await page.selectOption('#edit select', 'while'); await page.waitForTimeout(300);
await page.click('#view svg .sym[data-id="start_main"]', { force: true }); await page.waitForTimeout(100);
await page.selectOption('#edit select', 'input'); await page.waitForTimeout(300);
src = await page.inputValue('#src');
expect(/^x = int\(input\(\)\)\nwhile x < 10:\n    x = 0\n$/.test(src), 'GUI だけで作ったテキスト: ' + JSON.stringify(src));
await page.click('#view svg .sym[data-id="start_main"]', { force: true }); await page.waitForTimeout(100);
await page.click('#edit button:has-text("関数を追加")'); await page.waitForTimeout(300);
src = await page.inputValue('#src');
expect(src.startsWith('def f1(x):\n    return x\n'), '関数の追加: ' + JSON.stringify(src.slice(0,40)));
// 構文エラー中は古い図を編集できない(テキストが上書きされない)
await page.fill('#src', 'a = 1\nb = 2\n'); await page.waitForTimeout(300);
await page.fill('#src', 'a = 1\nb = 2\nc = 3\nclass X:\n'); await page.waitForTimeout(300);
await page.click('#view svg .sym', { force: true }); await page.waitForTimeout(100);
expect(!(await page.isVisible('#edit')) && (await page.inputValue('#src')).includes('class X'), 'エラー中は編集パネルが出ず、テキストが保たれる');
// elif の削除で後ろの elif/else が残る
await page.fill('#src', 'x = 1\nif x == 1:\n    a = 1\nelif x == 2:\n    a = 2\nelif x == 3:\n    a = 3\nelse:\n    a = 4\n'); await page.waitForTimeout(300);
await sel('x == 2'); await page.click('#edit button:has-text("この記号を削除")'); await page.waitForTimeout(300);
expect((await page.inputValue('#src')) === 'x = 1\nif x == 1:\n    a = 1\nelif x == 3:\n    a = 3\nelse:\n    a = 4\n', 'elif の削除で後ろがつながる');
// 編集後も同じ記号が選択されている
await page.fill('#src', 'a = 1\nb = 2\nc = 3\n'); await page.waitForTimeout(300);
await sel('b = 2'); await page.fill('#edit input[data-k="text"]', 'b = 22'); await page.press('#edit input[data-k="text"]', 'Enter'); await page.waitForTimeout(300);
expect((await page.$eval('#view svg .sym.selected text', t => t.textContent)) === 'b = 22', '編集後の選択が同じ記号に残る');
// 最上位ループの本体先頭に break を入れられる
await page.fill('#src', 'x = 0\nwhile x < 3:\n    x = x + 1\n'); await page.waitForTimeout(300);
await sel('x < 3');
expect((await page.$$eval('#edit select:last-of-type option', os => os.map(o => o.value))).includes('break'), 'ループ記号の挿入候補に break がある');
await page.screenshot({ path: path.join(here, 'out', 'gui.png') });
// エラー表示
await page.fill('#src', 'class A:\n    pass\n');
await page.waitForTimeout(300);
expect((await page.textContent('#msg')).includes('1 行目'), 'エラー表示: ' + (await page.textContent('#msg')).trim());
await browser.close();
console.log(fail ? `\n${fail} 件 FAIL` : '\nすべて PASS');
process.exit(fail ? 1 : 0);
