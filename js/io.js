/* データ入出力：CSV（BOM付き UTF-8）と JSON バックアップ */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util;
  const ST = () => KB.store;

  const TYPE_LABEL = { expense: '支出', income: '収入', transfer: '振替' };
  const LABEL_TYPE = { 支出: 'expense', 収入: 'income', 振替: 'transfer', expense: 'expense', income: 'income', transfer: 'transfer' };
  const HEADER = ['ID', '日付', '種類', '金額', 'カテゴリ', '口座', '振替先口座', '支払い方法', 'お店・相手', 'メモ', 'タグ'];

  function exportCSV(list) {
    const s = ST().state;
    list = list || s.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const rows = [HEADER];
    list.forEach((t) => {
      const c = ST().cat(t.categoryId), a = ST().acc(t.accountId), b = ST().acc(t.toAccountId);
      rows.push([t.id, t.date, TYPE_LABEL[t.type], t.amount, c ? c.name : '', a ? a.name : '', b ? b.name : '', t.method, t.payee, t.memo, t.tags.map((x) => '#' + x).join(' ')]);
    });
    return U.toCSV(rows);
  }

  // 文字コードを判別して読む（UTF-8 で読めなければ Shift_JIS）
  async function readText(file) {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      return new TextDecoder('shift_jis').decode(buf);
    }
  }

  // CSV を解析して取り込み計画を作る（まだ保存しない）
  function planCSV(text) {
    const rows = U.parseCSV(text);
    if (!rows.length) throw new Error('CSV が空です');
    const head = rows[0].map((x) => x.trim());
    const col = (names) => head.findIndex((h) => names.includes(h));
    const ix = {
      id: col(['ID', 'id']), date: col(['日付', 'date']), type: col(['種類', '区分', 'type']), amount: col(['金額', 'amount']),
      cat: col(['カテゴリ', 'カテゴリー', '分類', 'category']), acc: col(['口座', '出金元', 'account']), to: col(['振替先口座', '入金先', 'toAccount']),
      method: col(['支払い方法', '支払方法', 'method']), payee: col(['お店・相手', '店名', 'お店', 'payee']), memo: col(['メモ', '内容', 'memo']), tags: col(['タグ', 'tags']),
    };
    if (ix.date < 0 || ix.amount < 0) throw new Error('「日付」と「金額」の列が必要です（1行目に見出しを入れてください）');
    const s = ST().state;
    const errors = [];
    const items = [];
    const newCats = {}, newAccs = {};
    const findCat = (name, type) => {
      if (!name) return null;
      const c = s.categories.find((x) => x.name === name && x.type === type) || s.categories.find((x) => x.name === name);
      if (c) return c.id;
      const key = type + ':' + name;
      if (!newCats[key]) newCats[key] = { id: U.uid('c_'), type, name: name.slice(0, 20), icon: type === 'income' ? '💴' : '📦', color: '#8a8f98', order: 900, archived: false };
      return newCats[key].id;
    };
    const findAcc = (name) => {
      if (!name) return null;
      const a = s.accounts.find((x) => x.name === name);
      if (a) return a.id;
      if (!newAccs[name]) newAccs[name] = { id: U.uid('a_'), name: name.slice(0, 20), kind: 'cash', initialBalance: 0, order: 900, archived: false };
      return newAccs[name].id;
    };
    const defAcc = (ST().accs()[0] || {}).id || null;
    const get = (r, i) => (i >= 0 && r[i] !== undefined ? String(r[i]).trim() : '');
    for (let n = 1; n < rows.length; n++) {
      const r = rows[n];
      const date = U.normDate(get(r, ix.date));
      let amount = U.parseYen(get(r, ix.amount));
      let type = LABEL_TYPE[get(r, ix.type)];
      if (!date) { errors.push((n + 1) + '行目：日付が読めません'); continue; }
      if (!Number.isFinite(amount) || amount === 0) { errors.push((n + 1) + '行目：金額が読めません'); continue; }
      if (!type) type = amount < 0 ? 'expense' : 'income'; // 種類がなければ符号で判断
      amount = Math.abs(amount);
      const accountId = findAcc(get(r, ix.acc)) || defAcc;
      const toAccountId = type === 'transfer' ? findAcc(get(r, ix.to)) : null;
      if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) { errors.push((n + 1) + '行目：振替先口座がありません'); continue; }
      let memo = get(r, ix.memo);
      if (/^'[=+\-@]/.test(memo)) memo = memo.slice(1); // 書き出し時の数式対策を戻す
      let payee = get(r, ix.payee);
      if (/^'[=+\-@]/.test(payee)) payee = payee.slice(1);
      items.push({
        id: get(r, ix.id) || null, type, date, amount,
        categoryId: type === 'transfer' ? null : findCat(get(r, ix.cat), type),
        accountId, toAccountId, method: get(r, ix.method), payee, memo, tags: U.parseTags(get(r, ix.tags)),
      });
    }
    const existing = new Set(s.transactions.map((t) => t.id));
    const updates = items.filter((t) => t.id && existing.has(t.id)).length;
    return { items, errors, newCats: Object.values(newCats), newAccs: Object.values(newAccs), updates, adds: items.length - updates };
  }

  function applyCSV(plan) {
    ST().mutate('CSV の読み込み', (s) => {
      plan.newCats.forEach((c) => s.categories.push(c));
      plan.newAccs.forEach((a) => s.accounts.push(a));
      const byId = new Map(s.transactions.map((t) => [t.id, t]));
      const now = new Date().toISOString();
      plan.items.forEach((it) => {
        const old = it.id && byId.get(it.id);
        if (old) {
          Object.assign(old, it, { updatedAt: now });
        } else {
          s.transactions.push(Object.assign({ receiptId: null, recurringId: null, installment: null, createdAt: now, updatedAt: now }, it, { id: it.id || U.uid('t_') }));
        }
      });
    });
  }

  async function exportJSON(withReceipts) {
    const data = JSON.parse(ST().serialize());
    const out = { app: 'kakeibo', exportedAt: new Date().toISOString(), schemaVersion: data.schemaVersion, data };
    if (withReceipts) out.receipts = await KB.receipts.exportAll();
    return JSON.stringify(out);
  }

  function parseBackup(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('JSON として読めません'); }
    const data = o && o.app === 'kakeibo' && o.data ? o.data : o;
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.categories)) throw new Error('家計簿のバックアップファイルではありません');
    ST().migrate(JSON.parse(JSON.stringify(data))); // 検証のみ
    return { data, receipts: o.receipts || null, exportedAt: o.exportedAt || null };
  }

  async function restore(b) {
    ST().replaceAll(b.data, 'バックアップから復元');
    if (b.receipts) await KB.receipts.importAll(b.receipts);
  }

  KB.io = { exportCSV, readText, planCSV, applyCSV, exportJSON, parseBackup, restore, TYPE_LABEL };
})();
