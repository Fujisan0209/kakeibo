/* 動作確認スクリプト（Playwright）
 * 使い方：リポジトリ直下で `python3 -m http.server 8765` を起動してから
 *   node tests/e2e.js [スクリーンショットの保存先]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/index.html';
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✔ ' + name);
  else { failed++; console.log('  ✘ ' + name + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}

async function newPage(b, opts) {
  const ctx = await b.newContext(Object.assign({ locale: 'ja-JP', acceptDownloads: true }, opts));
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  return p;
}

(async () => {
  const b = await chromium.launch();

  // ---------- 1. 計算の単体確認（日付を固定）----------
  console.log('計算');
  {
    const p = await newPage(b);
    await p.clock.setFixedTime(new Date('2024-02-20T10:00:00'));
    await p.goto(BASE);
    await p.click('text=空の状態で始める');
    const r = await p.evaluate(() => {
      const U = KB.util, C = KB.calc, S = KB.store;
      const out = {};
      out.split = C.splitAmounts(10000, 3);
      out.splitSum = C.splitAmounts(158000, 12).reduce((a, b) => a + b, 0);
      out.leap = [U.dayInMonth('2024-02', 31), U.dayInMonth('2023-02', 31), U.dayInMonth('2024-04', 31)];
      out.addMonths = [U.addMonths('2024-01', 1), U.addMonths('2024-12', 1), U.addMonths('2024-01', -1), U.addMonths('2024-03', -14)];
      out.parse = [U.parseYen('１，２３４円'), U.parseYen('¥-500'), U.parseYen('12.6'), U.parseYen('abc'), U.parseYen('')];
      out.esc = U.h('<img src=x onerror=alert(1)>"\'');
      // 定期：毎月31日（月末）を 2023-11 から → 11/30, 12/31, 1/31（2/29 はまだ先）
      S.mutate('t', (s) => {
        s.recurring.push({ id: 'r1', name: '家賃', type: 'expense', amount: 50000, day: 31, categoryId: 'c_ex3', accountId: 'a_bank', toAccountId: null, method: '', memo: '家賃', tags: [], startMonth: '2023-11', endMonth: null, lastDate: null, active: true });
        out.gen1 = C.generateRecurring(s);
        out.gen2 = C.generateRecurring(s); // 二重登録しない
      });
      out.genDates = S.state.transactions.filter((t) => t.recurringId === 'r1').map((t) => t.date);
      out.upcoming = C.upcomingRecurring('2024-02-21', '2024-03-31').map((t) => t.date);
      // 振替は収支に含めない・残高は動く
      S.mutate('t', (s) => {
        s.transactions.push({ id: 'x1', type: 'transfer', date: '2024-02-10', amount: 30000, categoryId: null, accountId: 'a_bank', toAccountId: 'a_cash', method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.transactions.push({ id: 'x2', type: 'income', date: '2024-02-05', amount: 200000, categoryId: 'c_in0', accountId: 'a_bank', toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
      });
      const ms = C.monthSummary('2024-02');
      out.feb = { income: ms.income, expense: ms.expense };
      const bal = C.balances();
      out.bal = { bank: bal.a_bank, cash: bal.a_cash };
      out.total = C.totalAssets();
      // 予算と繰り越し：食費 30,000。1月 20,000 使用、2月 ON → 1月分は繰り越さない（ON にした月から）
      S.mutate('t', (s) => {
        C.setBudget(s, 'c_ex0', '2024-01', 30000);
        s.transactions.push({ id: 'f1', type: 'expense', date: '2024-01-15', amount: 20000, categoryId: 'c_ex0', accountId: 'a_cash', toAccountId: null, method: '', payee: 'スーパー', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.transactions.push({ id: 'f2', type: 'expense', date: '2024-02-15', amount: 25000, categoryId: 'c_ex0', accountId: 'a_cash', toAccountId: null, method: '', payee: 'スーパー', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.settings.carryover = true; s.settings.carryoverSince = '2024-01';
      });
      const bs = C.budgetStatus('2024-02')[0];
      out.carry = { carry: bs.carry, available: bs.available, spent: bs.spent, level: bs.level };
      out.carryMar = C.carryIn('c_ex0', '2024-03'); // 2月：30000+10000-25000 = 15000
      out.levels = [C.level(79, 100), C.level(80, 100), C.level(99, 100), C.level(100, 100), C.level(1, 0)];
      out.daily = C.dailyAllowance(); // 2/20〜2/29 の10日
      // クレカ：締め15日・翌月10日払い
      S.mutate('t', (s) => {
        s.transactions.push({ id: 'k1', type: 'expense', date: '2024-01-16', amount: 1000, categoryId: 'c_ex0', accountId: 'a_card', toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.transactions.push({ id: 'k2', type: 'expense', date: '2024-02-15', amount: 2000, categoryId: 'c_ex0', accountId: 'a_card', toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.transactions.push({ id: 'k3', type: 'expense', date: '2024-02-16', amount: 4000, categoryId: 'c_ex0', accountId: 'a_card', toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
      });
      out.card = C.cardForecast(S.acc('a_card')).map((f) => ({ start: f.start, end: f.end, pay: f.payDate, amount: f.amount }));
      out.nbd = [C.nextBusinessDay('2024-03-09'), C.nextBusinessDay('2024-03-10'), C.nextBusinessDay('2024-03-11')];
      // 分割
      const plan = { id: 'p1', name: 'PC', total: 100000, count: 3, startMonth: '2024-01', day: 31, categoryId: 'c_ex7', accountId: 'a_card', memo: 'PC', tags: [] };
      out.inst = C.installmentTxs(plan).map((t) => [t.date, t.amount]);
      return out;
    });
    check('分割の端数は1回目に', JSON.stringify(r.split) === '[3334,3333,3333]', r.split);
    check('分割の合計が総額と一致', r.splitSum === 158000, r.splitSum);
    check('月末丸め（うるう年）', JSON.stringify(r.leap) === '["2024-02-29","2023-02-28","2024-04-30"]', r.leap);
    check('月の加減算', JSON.stringify(r.addMonths) === '["2024-02","2025-01","2023-12","2023-01"]', r.addMonths);
    check('金額の解釈（全角・カンマ・不正値）', r.parse[0] === 1234 && r.parse[1] === -500 && r.parse[2] === 13 && Number.isNaN(r.parse[3]) && Number.isNaN(r.parse[4]), r.parse);
    check('HTMLエスケープ', r.esc === '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;', r.esc);
    check('定期の月末登録と二重登録防止', r.gen1 === 3 && r.gen2 === 0 && JSON.stringify(r.genDates) === '["2023-11-30","2023-12-31","2024-01-31"]', [r.gen1, r.gen2, r.genDates]);
    check('未登録の定期（うるう日）', JSON.stringify(r.upcoming) === '["2024-02-29","2024-03-31"]', r.upcoming);
    check('振替は収支に含めない', r.feb.income === 200000 && r.feb.expense === 0, r.feb);
    check('振替で口座残高が動く', r.bal.bank === 200000 - 150000 - 30000 && r.bal.cash === 30000, r.bal);
    check('繰り越し（ON にした月から・余りのみ）', r.carry.carry === 10000 && r.carry.available === 40000 && r.carry.spent === 25000 && r.carryMar === 15000, [r.carry, r.carryMar]);
    check('警告レベル 80%/100%', JSON.stringify(r.levels) === '["ok","warn","warn","over","over"]', r.levels);
    check('1日あたり（残り10日・未登録の定期は予算外）', r.daily && r.daily.daysLeft === 10 && r.daily.perDay === 1500, r.daily);
    check('クレカの請求期間と金額', r.card.length >= 1 && r.card[0].start === '2024-01-16' && r.card[0].end === '2024-02-15' && r.card[0].amount === 3000 && r.card[0].pay === '2024-03-11', r.card);
    check('支払日の土日ずらし', JSON.stringify(r.nbd) === '["2024-03-11","2024-03-11","2024-03-11"]', r.nbd);
    check('分割の日付（月末丸め）', JSON.stringify(r.inst) === '[["2024-01-31",33334],["2024-02-29",33333],["2024-03-31",33333]]', r.inst);
    check('エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  // ---------- 1b. レビューで見つかった不具合の回帰確認 ----------
  console.log('回帰確認');
  {
    const p = await newPage(b);
    await p.clock.setFixedTime(new Date('2024-06-20T10:00:00'));
    await p.goto(BASE);
    await p.click('text=空の状態で始める');
    const r = await p.evaluate(() => {
      const U = KB.util, C = KB.calc, S = KB.store;
      const tx = (o) => Object.assign({ id: U.uid('t_'), categoryId: null, toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' }, o);
      const out = {};
      // 定期の日付を5日→25日に変えても、同じ月に2回登録しない
      S.mutate('t', (s) => {
        s.recurring.push({ id: 'r2', name: 'サブスク', type: 'expense', amount: 1000, day: 25, categoryId: 'c_ex7', accountId: 'a_card', toAccountId: null, method: '', memo: '', tags: [], startMonth: '2024-06', endMonth: null, lastDate: '2024-06-05', active: true });
        out.dayShift = C.generateRecurring(s);
      });
      out.dayShiftUpcoming = C.upcomingRecurring('2024-06-21', '2024-07-31').filter((t) => t.recurringId === 'r2').map((t) => t.date);
      // カードの引き落としを記録したら、その請求は残り0・残高不足なし
      S.mutate('t', (s) => {
        s.accounts.find((a) => a.id === 'a_bank').initialBalance = 100000;
        s.transactions.push(tx({ type: 'expense', date: '2024-06-10', amount: 80000, categoryId: 'c_ex0', accountId: 'a_card' })); // 5/16〜6/15 → 7/10払い
      });
      const before = C.cardForecast(S.acc('a_card')).find((f) => f.end === '2024-06-15');
      S.mutate('t', (s) => { s.transactions.push(tx({ type: 'transfer', date: '2024-07-10', amount: 80000, accountId: 'a_bank', toAccountId: 'a_card' })); });
      const after = C.cardForecast(S.acc('a_card')).find((f) => f.end === '2024-06-15');
      out.card = { beforeRemaining: before.remaining, beforeShort: before.shortage, afterRemaining: after.remaining, afterShort: after.shortage };
      // 1日あたり：住居の超過で食費の残りが消えない
      S.mutate('t', (s) => {
        C.setBudget(s, 'c_ex0', '2024-06', 100000);
        C.setBudget(s, 'c_ex3', '2024-06', 10000);
        s.transactions.push(tx({ type: 'expense', date: '2024-06-01', amount: 40000, categoryId: 'c_ex3', accountId: 'a_bank' }));
      });
      out.daily = C.dailyAllowance(); // 食費 100000-80000=20000 / 11日
      // ふだんの支出の平均：昔からの定期があっても、手入力の最初の日から割る
      S.mutate('t', (s) => {
        s.transactions = s.transactions.filter((t) => t.type !== 'expense');
        s.transactions.push(tx({ type: 'expense', date: '2023-01-05', amount: 5000, categoryId: 'c_ex3', accountId: 'a_bank', recurringId: 'rx' }));
        for (let d = 11; d <= 20; d++) s.transactions.push(tx({ type: 'expense', date: '2024-06-' + d, amount: 3000, categoryId: 'c_ex0', accountId: 'a_cash' }));
      });
      out.varDaily = C.variableDaily();
      // 非表示カテゴリの予算は対象外
      S.mutate('t', (s) => { s.categories.find((c) => c.id === 'c_ex3').archived = true; });
      out.budgetCats = C.budgetStatus('2024-06').map((r) => r.cat.id);
      // CSV：「収入,その他」は支出の「その他」に入らない
      const plan = KB.io.planCSV('日付,種類,金額,カテゴリ\n2024-06-01,収入,50000,その他\n');
      out.csvCat = { newCats: plan.newCats.map((c) => c.type + ':' + c.name), itemCat: plan.items[0].categoryId !== 'c_ex13' };
      return out;
    });
    check('定期の日付変更で同じ月に二重登録しない', r.dayShift === 0 && JSON.stringify(r.dayShiftUpcoming) === '["2024-07-25"]', [r.dayShift, r.dayShiftUpcoming]);
    check('カードの引き落とし記録後は残り0・残高不足なし', r.card.beforeRemaining === 80000 && r.card.afterRemaining === 0 && !r.card.afterShort, r.card);
    check('1日あたりはカテゴリ間で相殺しない', r.daily.perDay === Math.floor(20000 / 11) && r.daily.over === 30000, r.daily);
    check('ふだんの支出は手入力の最初の日から平均', r.varDaily === 3000, r.varDaily);
    check('非表示カテゴリの予算は対象外', !r.budgetCats.includes('c_ex3'), r.budgetCats);
    check('CSV の収入行は支出カテゴリに入らない', r.csvCat.newCats.join() === 'income:その他' && r.csvCat.itemCat, r.csvCat);
    // 非表示口座の明細を編集しても口座が変わらない
    const acc = await p.evaluate(() => {
      KB.store.mutate('t', (s) => {
        s.transactions.push({ id: 'h1', type: 'expense', date: '2024-06-19', amount: 500, categoryId: 'c_ex0', accountId: 'a_emoney', toAccountId: null, method: '', payee: '', memo: '', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: '', updatedAt: '' });
        s.accounts.find((a) => a.id === 'a_emoney').archived = true;
      });
      KB.views.input.open({ id: 'h1' });
    });
    await p.click('#txform button[type=submit]');
    await p.waitForTimeout(200);
    check('非表示口座の明細を編集しても口座が変わらない', (await p.evaluate(() => KB.store.state.transactions.find((t) => t.id === 'h1').accountId)) === 'a_emoney');
    await p.goto(BASE + '#/accounts');
    await p.waitForTimeout(200);
    check('非表示の口座を一覧から再表示できる', (await p.locator('.hidden-accs [data-edit-acc="a_emoney"]').count()) === 1);
    // 定期を止めて再開しても、止めていた月の分を登録しない
    const resumed = await p.evaluate(() => {
      KB.store.mutate('t', (s) => { s.recurring.push({ id: 'r3', name: '家賃', type: 'expense', amount: 70000, day: 5, categoryId: 'c_ex0', accountId: 'a_bank', toAccountId: null, method: '', memo: '', tags: [], startMonth: '2024-01', endMonth: null, lastDate: '2024-03-05', active: false }); });
      return true;
    });
    await p.goto(BASE + '#/plans');
    await p.waitForTimeout(200);
    await p.click('[data-edit="r3"]');
    await p.check('#r-active');
    await p.click('#rf button.btn-primary');
    await p.waitForTimeout(200);
    const dates = await p.evaluate(() => KB.store.state.transactions.filter((t) => t.recurringId === 'r3').map((t) => t.date));
    check('定期を再開しても止めていた月の分を登録しない', resumed && JSON.stringify(dates) === '["2024-06-05"]', dates);
    check('エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  // ---------- 2. 主要な流れ（画面操作）----------
  console.log('主要な流れ');
  {
    const p = await newPage(b, { viewport: { width: 1280, height: 900 } });
    await p.goto(BASE);
    await p.click('text=空の状態で始める');
    // 予算：食費 10,000
    await p.goto(BASE + '#/budget');
    await p.fill('#b-c_ex0', '10000');
    await p.press('#b-c_ex0', 'Enter');
    await p.waitForTimeout(200);
    // 支出を登録（入力シート）
    await p.click('.sidebar [data-act="add"]');
    await p.fill('#f-amount', '8500');
    await p.fill('#f-payee', '<b>スーパー</b>');
    await p.fill('#f-tags', '#旅行 #テスト');
    await p.click('#txform button[type=submit]');
    await p.waitForTimeout(200);
    let s = await p.evaluate(() => ({ n: KB.store.state.transactions.length, t: KB.store.state.transactions[0] }));
    check('支出を登録できる', s.n === 1 && s.t.amount === 8500 && s.t.categoryId === 'c_ex0' && s.t.tags.join() === '旅行,テスト', s);
    // XSS：お店の名前がタグとして解釈されない
    await p.goto(BASE + '#/list');
    await p.waitForTimeout(200);
    check('入力値はエスケープして表示', (await p.locator('.tx-sub b').count()) === 0 && (await p.locator('.tx-sub', { hasText: '<b>スーパー</b>' }).count()) === 1);
    // 予算警告（85% → 黄）
    await p.goto(BASE + '#/budget');
    await p.waitForTimeout(200);
    check('80%以上で注意表示', (await p.locator('.budget-row .level-warn').count()) === 1);
    // 収入と振替
    await p.evaluate(() => KB.views.input.open({ type: 'income' }));
    await p.fill('#f-amount', '300,000');
    await p.click('#txform button[type=submit]');
    await p.evaluate(() => KB.views.input.open({ type: 'transfer' }));
    await p.fill('#f-amount', '20000');
    await p.selectOption('#f-to', 'a_emoney');
    await p.click('#txform button[type=submit]');
    await p.waitForTimeout(200);
    // もう1件の支出で 100% 超え
    await p.evaluate(() => KB.views.input.open({ type: 'expense' }));
    await p.fill('#f-amount', '2000');
    await p.click('#txform button[type=submit]');
    await p.waitForTimeout(200);
    await p.goto(BASE + '#/budget');
    await p.waitForTimeout(200);
    check('100%以上で超過表示', (await p.locator('.budget-row .level-over').count()) === 1);
    // 集計
    const sum = await p.evaluate(() => KB.calc.monthSummary(KB.util.thisMonth()));
    check('集計（振替を除く）', sum.income === 300000 && sum.expense === 10500, sum);
    // グラフ
    await p.goto(BASE + '#/analysis');
    await p.waitForTimeout(200);
    check('グラフを描画', (await p.locator('svg.chart').count()) >= 2 && (await p.locator('.bar-expense').count()) === 12);
    await p.screenshot({ path: path.join(OUT, 'flow-analysis.png'), fullPage: true });
    // Undo：削除して戻す
    await p.goto(BASE + '#/list');
    await p.waitForTimeout(200);
    const before = await p.evaluate(() => KB.store.state.transactions.length);
    await p.locator('.tx-main').first().click();
    await p.click('#txform [data-delete]');
    await p.waitForTimeout(200);
    const afterDel = await p.evaluate(() => KB.store.state.transactions.length);
    await p.locator('.toast-btn', { hasText: '元に戻す' }).last().click();
    await p.waitForTimeout(200);
    const afterUndo = await p.evaluate(() => KB.store.state.transactions.length);
    check('削除を元に戻せる', afterDel === before - 1 && afterUndo === before, [before, afterDel, afterUndo]);
    // Undo：編集して戻す（Ctrl+Z）
    const tid = await p.evaluate(() => KB.store.state.transactions.find((t) => t.type === 'expense').id);
    await p.evaluate((id) => KB.views.input.open({ id }), tid);
    await p.fill('#f-amount', '1');
    await p.click('#txform button[type=submit]');
    await p.waitForTimeout(200);
    const edited = await p.evaluate((id) => KB.store.state.transactions.find((t) => t.id === id).amount, tid);
    await p.locator('main').click({ position: { x: 5, y: 5 } });
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
    const restored = await p.evaluate((id) => KB.store.state.transactions.find((t) => t.id === id).amount, tid);
    check('編集を元に戻せる（Ctrl+Z）', edited === 1 && restored !== 1, [edited, restored]);
    // CSV 往復
    await p.goto(BASE + '#/settings?tab=data');
    await p.waitForTimeout(200);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-x="csv-out"]')]);
    const csvPath = path.join(OUT, 'export.csv');
    await dl.saveAs(csvPath);
    const buf = fs.readFileSync(csvPath);
    check('CSV は BOM 付き UTF-8', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
    const snapshot = await p.evaluate(() => JSON.stringify(KB.store.state.transactions.map((t) => [t.date, t.type, t.amount, t.categoryId, t.accountId, t.toAccountId, t.payee, t.tags]).sort()));
    // 全削除して CSV から読み込む
    await p.evaluate(() => KB.store.mutate('clear', (s) => { s.transactions = []; }));
    await p.setInputFiles('#csv-file', csvPath);
    await p.click('.modal [data-ok]');
    await p.waitForTimeout(300);
    const reimported = await p.evaluate(() => JSON.stringify(KB.store.state.transactions.map((t) => [t.date, t.type, t.amount, t.categoryId, t.accountId, t.toAccountId, t.payee, t.tags]).sort()));
    check('CSV の書き出し→読み込みで一致', snapshot === reimported, [snapshot, reimported]);
    // 同じ CSV をもう一度読んでも重複しない（ID で上書き）
    await p.setInputFiles('#csv-file', csvPath);
    await p.click('.modal [data-ok]');
    await p.waitForTimeout(300);
    const n2 = await p.evaluate(() => KB.store.state.transactions.length);
    check('同じ CSV の再読み込みで重複しない', n2 === JSON.parse(snapshot).length, n2);
    // JSON 往復
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('[data-x="backup"]')]);
    const jsonPath = path.join(OUT, 'backup.json');
    await dl2.saveAs(jsonPath);
    const full = await p.evaluate(() => KB.store.serialize());
    await p.evaluate(() => KB.store.mutate('clear', (s) => { s.transactions = []; s.budgets = {}; }));
    await p.setInputFiles('#restore-file', jsonPath);
    await p.click('#confirm button[value=ok]');
    await p.waitForTimeout(400);
    const restoredFull = await p.evaluate(() => KB.store.serialize());
    // キーの順番の違いは無視して比べる
    const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v;
    const strip = (x) => { const o = JSON.parse(x); delete o.settings.lastBackupAt; return JSON.stringify(canon(o)); };
    const A = strip(full), B = strip(restoredFull);
    let at = 0; while (at < A.length && A[at] === B[at]) at++;
    check('JSON のバックアップ→復元で一致', A === B, A === B ? undefined : [A.slice(at - 80, at + 80), B.slice(at - 80, at + 80)]);
    // 再読み込みしても残る
    await p.reload();
    await p.waitForTimeout(300);
    check('再読み込み後もデータが残る', (await p.evaluate(() => KB.store.state.transactions.length)) === JSON.parse(snapshot).length);
    check('エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  // ---------- 2b. セキュリティと操作性 ----------
  console.log('セキュリティと操作性');
  {
    const p = await newPage(b, { viewport: { width: 1280, height: 860 } });
    const fired = [];
    p.on('dialog', (d) => { fired.push(d.message()); d.dismiss(); });
    await p.goto(BASE);
    await p.click('text=空の状態で始める');
    // 悪意のある値を入れたバックアップを復元しても、スクリプトが動かない
    await p.evaluate(async () => {
      const d = JSON.parse(KB.store.serialize());
      const x = '<img src=x onerror=alert(1)>';
      d.transactions.push({ id: 'z' + x, type: 'expense', date: KB.util.today(), amount: 1, categoryId: 'c_ex0', accountId: 'a_card', tags: [x], memo: x, payee: x, method: x, installment: { planId: 'p', no: x, count: x } });
      d.accounts[2].card.closingDay = x; d.accounts[2].card.payDay = x; d.accounts[2].name = x;
      d.recurring.push({ id: 'r', name: x, type: 'expense', amount: x, day: x, startMonth: x, categoryId: 'c_ex0', accountId: 'a_cash', active: true, memo: x });
      d.installments.push({ id: 'p', name: x, total: 100, count: x, startMonth: '2024-01', day: x, categoryId: x });
      d.templates.push({ id: 't', name: x, type: 'expense', amount: x, categoryId: 'c_ex0', accountId: 'a_cash', memo: x });
      d.goals.push({ id: 'g', name: x, target: x, accountIds: ['a_bank'] });
      d.categories[0].color = 'red;background:url(x)'; d.categories[0].icon = x; d.categories[1].name = x;
      await KB.io.restore({ data: d });
    });
    for (const r of ['home', 'list', 'accounts', 'plans', 'analysis', 'budget', 'settings', 'badges']) {
      await p.goto(BASE + '#/' + r);
      await p.waitForTimeout(120);
    }
    await p.evaluate(() => KB.views.input.open({ id: KB.store.state.transactions[0].id }));
    await p.waitForTimeout(150);
    check('悪意のある値でもスクリプトが動かない', fired.length === 0 && (await p.locator('img[src="x"]').count()) === 0, fired);
    await p.evaluate(() => KB.ui.closeModal());
    // 入力シートを開くと金額欄にフォーカス
    await p.goto(BASE + '#/home');
    await p.click('.sidebar [data-act="add"]');
    await p.waitForTimeout(100);
    check('入力シートで金額欄にフォーカス', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'f-amount');
    // 「保存して続ける」のトーストがモーダルの前に見える
    await p.fill('#f-amount', '100');
    await p.click('[data-again]');
    await p.waitForTimeout(150);
    check('モーダル表示中もトーストが見える', await p.evaluate(() => { const t = document.querySelector('.toast'); return !!t && !!t.closest('dialog[open]'); }));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    check('モーダルを閉じたらトーストは body に戻る', await p.evaluate(() => document.getElementById('toasts').parentNode === document.body));
    check('エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }
  // file:// で開いても動く（CSP があっても）
  {
    const p = await newPage(b, { viewport: { width: 1280, height: 860 } });
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await p.click('text=サンプルデータを入れて試す');
    await p.waitForTimeout(300);
    check('file:// で開いて動く', (await p.evaluate(() => KB.store.state.transactions.length)) > 50 && (await p.locator('.stat').count()) >= 3);
    check('file:// でエラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  // ---------- 3. スクリーンショット（PC・スマホ、ライト・ダーク）----------
  console.log('スクリーンショット');
  for (const [name, opts] of [
    ['pc', { viewport: { width: 1280, height: 860 } }],
    ['sp', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['sp-dark', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' }],
  ]) {
    const p = await newPage(b, opts);
    await p.goto(BASE);
    await p.click('text=サンプルデータを入れて試す');
    await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    for (const r of ['home', 'list', 'budget', 'accounts', 'analysis']) {
      await p.goto(BASE + '#/' + r);
      await p.waitForTimeout(250);
      await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
      await p.screenshot({ path: path.join(OUT, name + '-' + r + '.png'), fullPage: name === 'pc' });
    }
    await p.goto(BASE + '#/home');
    await p.click(name === 'pc' ? '.sidebar [data-act="add"]' : '.tab-add');
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, name + '-input.png') });
    // 横スクロールが出ていないか
    if (name !== 'pc') {
      for (const r of ['home', 'list', 'budget', 'accounts', 'analysis', 'plans', 'settings']) {
        await p.goto(BASE + '#/' + r);
        await p.waitForTimeout(150);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(name + ' ' + r + ' で横スクロールなし', over <= 0, over);
      }
    }
    check(name + ' エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  // ---------- 4. 大量データ ----------
  console.log('大量データ');
  {
    const p = await newPage(b, { viewport: { width: 1280, height: 860 } });
    await p.goto(BASE);
    await p.click('text=空の状態で始める');
    const t = await p.evaluate(() => {
      const U = KB.util;
      const t0 = performance.now();
      KB.store.mutate('bulk', (s) => {
        for (let i = 0; i < 30000; i++) {
          const d = U.addDays(U.today(), -Math.floor(i / 10));
          s.transactions.push({ id: 'b' + i, type: i % 25 === 0 ? 'income' : 'expense', date: d, amount: 100 + (i % 3000), categoryId: i % 25 === 0 ? 'c_in0' : 'c_ex' + (i % 14), accountId: 'a_cash', toAccountId: null, method: '現金', payee: '店' + (i % 300), memo: 'メモ' + i, tags: i % 50 ? [] : ['旅行'], receiptId: null, recurringId: null, installment: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' });
        }
      });
      const t1 = performance.now();
      return { insert: Math.round(t1 - t0), backend: KB.store.backend, size: KB.store.serialize().length };
    });
    const timings = {};
    for (const r of ['home', 'list', 'analysis', 'budget', 'accounts']) {
      const t0 = Date.now();
      await p.goto(BASE + '#/' + r);
      await p.waitForSelector('.view-' + r);
      timings[r] = Date.now() - t0;
    }
    const search = await p.evaluate(() => { const t0 = performance.now(); const n = KB.calc.filter({ keyword: '店12', sort: 'amount-desc' }).length; return { ms: Math.round(performance.now() - t0), n }; });
    console.log('    3万件：保存', t.insert, 'ms／保存先', t.backend, '／サイズ', Math.round(t.size / 1024), 'KB／画面', JSON.stringify(timings), '／検索', JSON.stringify(search));
    check('3万件でも各画面が2秒以内', Object.values(timings).every((x) => x < 2000), timings);
    await p.reload();
    await p.waitForTimeout(500);
    check('3万件を再読み込みできる', (await p.evaluate(() => KB.store.state.transactions.length)) === 30000);
    check('エラーなし', !p.errors.length, p.errors);
    await p.context().close();
  }

  await b.close();
  console.log(failed ? '\n失敗 ' + failed + ' 件' : '\nすべて成功');
  process.exit(failed ? 1 : 0);
})();
