// 保存・読込の検査:
//  (A) ファイル操作機能がないブラウザ(ダウンロードで保存): 別名で保存・上書き保存・Ctrl+S・書き出し(JSON/SVG/PNG)と、JSON/SVG/.py からの再読込
//  (B) ファイル操作機能があるブラウザ(Chrome・Edge を模した偽の保存先): 別名で保存した先に上書き保存・Ctrl+S、開いたファイルへの上書き、未保存の印
const { chromium } = await import(process.env.PW || 'playwright');
import path from 'node:path';
import fs from 'node:fs';
const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.resolve(here, '..', 'index.html');
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
let fail = 0; const expect = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const src = fs.readFileSync(path.join(here, 'samples', '05_func.py'), 'utf8');
const nameText = async (page) => (await page.textContent('#fileName')).trim();

/* ---------- (A) ダウンロードで保存 ---------- */
{
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  let promptAnswer = 'myflow';
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept());
  await page.goto('file://' + html);
  await page.fill('#src', src); await page.waitForTimeout(300);
  expect((await nameText(page)) === '(名前なし) *', '未保存の印: ' + await nameText(page));
  // 別名で保存(ファイル名を尋ねて .py を付ける)
  let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#btnSaveAs')]);
  expect(dl.suggestedFilename() === 'myflow.py', '別名で保存のファイル名: ' + dl.suggestedFilename());
  await dl.saveAs(path.join(outDir, 'dl_myflow.py'));
  expect(fs.readFileSync(path.join(outDir, 'dl_myflow.py'), 'utf8') === src, '別名で保存の中身が左のテキスト');
  expect((await nameText(page)) === 'myflow.py', '保存後は印が消える: ' + await nameText(page));
  // 編集 → Ctrl+S で同じ名前でダウンロード
  await page.fill('#src', src + 'print(1)\n'); await page.waitForTimeout(300);
  expect((await nameText(page)) === 'myflow.py *', '編集で印が付く');
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.keyboard.press('Control+s')]);
  expect(dl.suggestedFilename() === 'myflow.py', 'Ctrl+S で同じ名前に保存: ' + dl.suggestedFilename());
  expect((await nameText(page)) === 'myflow.py', 'Ctrl+S 後は印が消える');
  // 上書き保存ボタン
  await page.fill('#src', src); await page.waitForTimeout(300);
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#btnSave')]);
  expect(dl.suggestedFilename() === 'myflow.py', '上書き保存ボタン: ' + dl.suggestedFilename());
  // 書き出し(名前は保存したファイル名から)
  for (const kind of ['json', 'svg', 'png']) {
    const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.selectOption('#exportAs', kind)]);
    const p = path.join(outDir, 'dl_' + d2.suggestedFilename());
    await d2.saveAs(p);
    expect(d2.suggestedFilename() === 'myflow.' + kind && fs.statSync(p).size > 100, `書き出し ${kind}: ${d2.suggestedFilename()} ${fs.statSync(p).size} bytes`);
  }
  // 書き出し → PDF(図の大きさ): 紙の大きさが図と同じ・余白 0 で、図 1 枚だけを印刷する(印刷の瞬間の状態を記録する)
  await page.evaluate(() => { window.__prints = []; window.print = () => { const s = document.querySelector('#printArea svg'); window.__prints.push({ one: document.body.classList.contains('printOne'), w: s && s.getAttribute('width'), h: s && s.getAttribute('height'), css: (document.querySelector('#pageOne') || {}).textContent || '', paper: (document.querySelector('#pagePaper') || {}).textContent || '', title: document.title }); }; });
  await page.selectOption('#optPage', 'A4P'); await page.waitForTimeout(200);
  await page.selectOption('#exportAs', 'pdf'); await page.waitForTimeout(200);
  let pr = await page.evaluate(() => window.__prints[0]);
  expect(pr && pr.one && pr.css.includes(`size:${pr.w}px ${pr.h}px`) && pr.css.includes('margin:0'), 'PDF(図の大きさ): 紙 ' + (pr && pr.w) + 'x' + (pr && pr.h) + ' 余白 0');
  const after = await page.evaluate(() => ({ one: document.body.classList.contains('printOne'), area: document.querySelector('#printArea').childElementCount, css: document.querySelector('#pageOne').textContent }));
  expect(!after.one && after.area === 0 && after.css === '', '印刷から戻ったら(afterprint が来なくても)紙の指定と印刷用の図を消す');
  // 続けて「印刷 / PDF(用紙)」: 図の大きさの状態を持ち越さず、A4 縦・横の紙を指定する
  await page.selectOption('#optPage', 'A4L'); await page.waitForTimeout(200);
  await page.selectOption('#exportAs', 'print'); await page.waitForTimeout(200);
  pr = await page.evaluate(() => window.__prints[1]);
  expect(pr && !pr.one && pr.css === '' && pr.paper.includes('A4 landscape'), '用紙の印刷は A4 横の紙で、図の大きさの状態を持ち越さない: ' + JSON.stringify(pr && pr.paper));
  await page.selectOption('#optPage', 'A4P'); await page.waitForTimeout(200);
  expect((await page.evaluate(() => document.querySelector('#pagePaper').textContent)).includes('A4 portrait'), 'A4 縦の紙の指定');
  await page.selectOption('#optPage', ''); await page.waitForTimeout(200);
  expect((await page.evaluate(() => document.querySelector('#pagePaper').textContent)) === '', '分割なしなら紙を指定しない');
  // 構文エラー中は書き出さない(古い図と Python が食い違うのを防ぐ)
  const good = await page.inputValue('#src');
  await page.fill('#src', good + 'class X:\n'); await page.waitForTimeout(300);
  let alerted = '';
  page.removeAllListeners('dialog'); page.on('dialog', d => { alerted = d.message(); d.accept(); });
  const nPrint = await page.evaluate(() => window.__prints.length);
  await page.selectOption('#exportAs', 'pdf'); await page.waitForTimeout(200);
  expect(alerted.includes('図がありません') && (await page.evaluate(() => window.__prints.length)) === nPrint, 'エラー中の PDF は止める');
  alerted = ''; let dlHappened = false; page.once('download', () => { dlHappened = true; });
  await page.selectOption('#exportAs', 'svg'); await page.waitForTimeout(400);
  expect(alerted.includes('図がありません') && !dlHappened, 'エラー中の SVG は止める');
  await page.fill('#src', good); await page.waitForTimeout(300);
  page.removeAllListeners('dialog'); page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept());
  expect(fs.readFileSync(path.join(outDir, 'dl_myflow.svg'), 'utf8').includes('@page{size:'), '書き出した SVG に紙の大きさの指定が入る');
  // 再読込(新規で空にしてから)
  await page.click('#btnNew'); await page.waitForTimeout(200);
  await page.setInputFiles('#fileOpen', path.join(outDir, 'dl_myflow.svg')); await page.waitForTimeout(300);
  expect((await page.inputValue('#src')) === src, 'SVG からの再読込で元のテキストが復元される');
  expect((await nameText(page)) === '(名前なし)', 'SVG を開いたときは上書きの先にしない: ' + await nameText(page));
  await page.setInputFiles('#fileOpen', path.join(outDir, 'dl_myflow.json')); await page.waitForTimeout(300);
  expect((await page.inputValue('#src')) === src, 'JSON からの再読込');
  await page.setInputFiles('#fileOpen', path.join(outDir, 'dl_myflow.py')); await page.waitForTimeout(300);
  expect((await page.inputValue('#src')) === src && (await nameText(page)) === 'dl_myflow.py', '.py からの再読込とファイル名');
  const png = fs.readFileSync(path.join(outDir, 'dl_myflow.png'));
  expect(png.slice(1, 4).toString() === 'PNG', 'PNG の署名');
  // 未保存の内容があるとき「新規」で確認が出る(拒否すると残る)
  await page.fill('#src', 'x = 1\n'); await page.waitForTimeout(200);
  page.removeAllListeners('dialog'); let asked = false;
  page.on('dialog', d => { asked = true; d.dismiss(); });
  await page.click('#btnNew'); await page.waitForTimeout(200);
  expect(asked && (await page.inputValue('#src')) === 'x = 1\n', '未保存のとき新規で確認が出て、拒否すると内容が残る');
  await ctx.close();
}

/* ---------- (B) ファイル操作機能(偽の保存先) ---------- */
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    window.__writes = [];
    const mk = (name, content) => ({
      kind: 'file', name,
      getFile: async () => new File([content || ''], name),
      createWritable: async () => { let buf = ''; return { write: async t => { buf += t; }, close: async () => { window.__writes.push({ name, text: buf }); } }; },
    });
    window.showSaveFilePicker = async (o) => mk(o.suggestedName.replace(/\.py$/, '') + '_saved.py');
    window.showOpenFilePicker = async () => [mk('opened.py', 'a = 1\n')];
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + html);
  await page.fill('#src', src); await page.waitForTimeout(300);
  // Ctrl+S(まだ保存先がない)→ 保存先を尋ねて保存
  await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
  let w = await page.evaluate(() => window.__writes);
  expect(w.length === 1 && w[0].name === 'flowchart_saved.py' && w[0].text === src, '保存先がないときの Ctrl+S は保存先を尋ねて保存');
  expect((await nameText(page)) === 'flowchart_saved.py', 'ファイル名の表示: ' + await nameText(page));
  // 編集 → 上書き保存ボタンは同じ保存先に書く(尋ねない)
  await page.fill('#src', src + 'print(2)\n'); await page.waitForTimeout(300);
  await page.click('#btnSave'); await page.waitForTimeout(300);
  w = await page.evaluate(() => window.__writes);
  expect(w.length === 2 && w[1].name === 'flowchart_saved.py' && w[1].text.endsWith('print(2)\n'), '上書き保存は同じ保存先に書く');
  expect((await page.textContent('#stat')).includes('上書き保存しました'), '保存の知らせ: ' + (await page.textContent('#stat')));
  // GUI 編集もテキストに反映され、未保存の印が付く
  await page.evaluate(() => { const g = document.querySelector('#view svg .sym[data-id="start_main"]'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.selectOption('#edit select', 'output'); await page.waitForTimeout(300);
  expect((await nameText(page)).endsWith(' *'), 'GUI 編集で未保存の印が付く');
  // 開くボタン(ファイル操作機能)→ そのファイルが上書きの先になる
  await page.click('#btnOpen'); await page.waitForTimeout(400);
  expect((await page.inputValue('#src')) === 'a = 1\n' && (await nameText(page)) === 'opened.py', '開いたファイル名の表示');
  await page.fill('#src', 'a = 2\n'); await page.waitForTimeout(300);
  await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
  w = await page.evaluate(() => window.__writes);
  expect(w[w.length - 1].name === 'opened.py' && w[w.length - 1].text === 'a = 2\n', '開いたファイルに Ctrl+S で上書き');
  // 別名で保存は毎回保存先を尋ねる
  await page.click('#btnSaveAs'); await page.waitForTimeout(300);
  w = await page.evaluate(() => window.__writes);
  expect(w[w.length - 1].name === 'opened_saved.py' && (await nameText(page)) === 'opened_saved.py', '別名で保存で保存先が変わる');
  // 別名で保存の選択が失敗してダウンロードになったら、前の保存先には上書きしない
  await page.evaluate(() => { window.__origSave = window.showSaveFilePicker; window.showSaveFilePicker = async () => { throw new Error('denied'); }; });
  page.removeAllListeners('dialog'); page.on('dialog', d => d.type() === 'prompt' ? d.accept('b.py') : d.accept());
  await page.fill('#src', 'b = 1\n'); await page.waitForTimeout(300);
  await page.click('#btnSaveAs'); await page.waitForTimeout(300);
  expect((await nameText(page)) === 'b.py', 'ダウンロードに切り替わった名前の表示');
  await page.evaluate(() => { window.showSaveFilePicker = window.__origSave; });
  const nW = (await page.evaluate(() => window.__writes)).length;
  await page.fill('#src', 'b = 2\n'); await page.waitForTimeout(300);
  await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
  w = await page.evaluate(() => window.__writes);
  expect(w.length === nW + 1 && w[w.length - 1].name === 'b_saved.py', 'その後の Ctrl+S は前のファイルに書かず、保存先を尋ねる: ' + w[w.length - 1].name);
  // 記号の編集欄で書き換えて確定せずに Ctrl+S → 書き換えも保存される
  await page.fill('#src', 'c = 1\n'); await page.waitForTimeout(300);
  await page.evaluate(() => { const g = [...document.querySelectorAll('#view svg .sym')].find(g => g.querySelector('text')?.textContent === 'c = 1'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.fill('#edit input[data-k="text"]', 'c = 99');
  await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
  w = await page.evaluate(() => window.__writes);
  expect(w[w.length - 1].text === 'c = 99\n', '編集欄の書き換えも保存に入る: ' + JSON.stringify(w[w.length - 1].text));
  await ctx.close();
}
/* ---------- (C) ブラウザへの自動保存 ---------- */
{
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('auto') : d.accept());
  await page.goto('file://' + html);
  await page.fill('#src', src); await page.waitForTimeout(300);
  await page.selectOption('#optPage', 'A4P'); await page.selectOption('#optRef', 'page'); await page.check('#optLineNo'); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(400);
  expect((await page.inputValue('#src')) === src, '再読み込みで内容が戻る');
  expect((await page.inputValue('#optPage')) === 'A4P' && (await page.inputValue('#optRef')) === 'page' && await page.isChecked('#optLineNo') && await page.isVisible('#lblRef'), '設定(ページ分割・注釈・行番号)も戻る');
  expect((await nameText(page)) === '(名前なし) *', '保存していない状態も戻る: ' + await nameText(page));
  await Promise.all([page.waitForEvent('download'), page.click('#btnSaveAs')]); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(400);
  expect((await nameText(page)) === 'auto.py', '保存済みならファイル名だけが戻り印は付かない: ' + await nameText(page));
  // 別のタブで編集されたら警告
  const page2 = await ctx.newPage(); await page2.goto('file://' + html); await page2.waitForTimeout(300);
  await page2.fill('#src', 'x = 1\n'); await page2.waitForTimeout(400);
  expect((await page.textContent('#msg')).includes('別のタブ'), '別のタブでの編集を知らせる');
  // 別のタブで保存しただけ(内容は同じ)なら警告しない
  await page.fill('#src', 'z = 1\n'); await page.waitForTimeout(400);
  await page.evaluate(() => { const w = document.querySelector('[data-tabwarn]'); if (w) w.remove(); });
  // (2 つのタブの内容をそろえてから、このタブを開き直して警告を消す)
  await page2.fill('#src', 'z = 1\n'); await page2.waitForTimeout(400);
  await page.reload(); await page.waitForTimeout(400);
  await page2.selectOption('#optPage', 'A4P'); await page2.waitForTimeout(400);
  expect(!(await page.textContent('#msg')).includes('別のタブ'), '別のタブで設定を替えただけなら警告しない');
  await page2.fill('#src', 'z = 2\n'); await page2.waitForTimeout(400);
  expect((await page.textContent('#msg')).includes('別のタブ'), '内容が変わったら警告する');
  await Promise.all([page.waitForEvent('download'), page.click('#btnSaveAs')]); await page.waitForTimeout(200);
  expect(!(await page.textContent('#msg')).includes('別のタブ'), 'このタブで保存したら警告を消す');
  // 描き直しの前(150ms 以内)に閉じても、最後の入力が残る
  await page.fill('#src', 'quick = 1\n'); await page.reload(); await page.waitForTimeout(400);
  expect((await page.inputValue('#src')) === 'quick = 1\n', '入力直後に再読み込みしても最後の入力が残る');
  // 未保存の状態で PNG を開こうとしても、破棄の確認は出さずに「開けません」だけ出す
  page.removeAllListeners('dialog'); const msgs = [];
  page.on('dialog', d => { msgs.push(d.type()); d.accept(); });
  await page.fill('#src', 'unsaved = 1\n'); await page.waitForTimeout(300);
  await page.setInputFiles('#fileOpen', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') }); await page.waitForTimeout(200);
  expect(msgs.length === 1 && msgs[0] === 'alert' && (await page.inputValue('#src')) === 'unsaved = 1\n', 'PNG は破棄の確認なしに断る: ' + msgs.join(','));
  page.removeAllListeners('dialog'); page.on('dialog', d => d.type() === 'prompt' ? d.accept('auto') : d.accept());
  // 保存できないとき(localStorage が使えない)の警告
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.fill('#src', 'y = 2\n'); await page.waitForTimeout(400);
  expect((await page.textContent('#msg')).includes('自動保存に失敗'), '自動保存に失敗したら知らせる');
  await ctx.close();
}
await browser.close();
console.log(fail ? `\n${fail} 件 FAIL` : '\nすべて PASS');
process.exit(fail ? 1 : 0);
