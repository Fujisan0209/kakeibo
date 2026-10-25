/* データ層：状態の保持・保存・マイグレーション・Undo・初期データ */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util;

  const KEY = 'kakeibo.data';
  const SCHEMA_VERSION = 1;
  const UNDO_MAX = 20;
  const UNDO_MAX_CHARS = 40 * 1024 * 1024; // スナップショットの合計サイズ上限（目安）

  const METHODS = ['現金', 'クレジットカード', 'デビットカード', '電子マネー', 'QRコード決済', '口座振替', '銀行振込', 'その他'];
  const ACCOUNT_KINDS = { cash: '財布・現金', bank: '銀行口座', card: 'クレジットカード', emoney: '電子マネー' };
  const KIND_METHOD = { cash: '現金', bank: '口座振替', card: 'クレジットカード', emoney: '電子マネー' };

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: {
        theme: 'auto',
        carryover: false,
        passcode: null,
        reminder: { enabled: false, time: '21:00', lastNotified: null },
        carryoverSince: null, // 繰り越しを ON にした月（それより前にはさかのぼらない）
        createdAt: new Date().toISOString(),
        lastBackupAt: null,
        setupDone: false,
      },
      categories: [],
      accounts: [],
      transactions: [],
      templates: [],
      recurring: [],
      installments: [],
      budgets: {},
      goals: [],
      activity: { entryDays: [] },
      badges: {},
    };
  }

  function defaultCategories() {
    const ex = [
      ['食費', '🍙', '#e07a5f'], ['日用品', '🧴', '#81b29a'], ['交通', '🚃', '#3d85c6'], ['住居', '🏠', '#8d6e63'],
      ['水道・光熱', '💡', '#f2a541'], ['通信', '📱', '#5c6bc0'], ['医療', '💊', '#26a69a'], ['趣味・娯楽', '🎮', '#ab47bc'],
      ['交際費', '🍻', '#ef6c8f'], ['衣服・美容', '👕', '#ec407a'], ['教育', '📚', '#7e57c2'], ['保険', '🛡️', '#607d8b'],
      ['税金', '🏛️', '#78909c'], ['その他', '📦', '#9e9e9e'],
    ];
    const inc = [
      ['給与', '💴', '#2e7d32'], ['賞与', '🎁', '#43a047'], ['副業', '💼', '#00897b'], ['臨時収入', '✨', '#7cb342'], ['その他収入', '🪙', '#8bc34a'],
    ];
    const out = [];
    ex.forEach((c, i) => out.push({ id: 'c_ex' + i, type: 'expense', name: c[0], icon: c[1], color: c[2], order: i, archived: false }));
    inc.forEach((c, i) => out.push({ id: 'c_in' + i, type: 'income', name: c[0], icon: c[1], color: c[2], order: i, archived: false }));
    return out;
  }
  function defaultAccounts() {
    return [
      { id: 'a_cash', name: '財布', kind: 'cash', initialBalance: 0, order: 0, archived: false },
      { id: 'a_bank', name: '銀行口座', kind: 'bank', initialBalance: 0, order: 1, archived: false },
      { id: 'a_card', name: 'クレジットカード', kind: 'card', initialBalance: 0, order: 2, archived: false,
        card: { closingDay: 15, payDay: 10, payMonthOffset: 1, payAccountId: 'a_bank' } },
      { id: 'a_emoney', name: '電子マネー', kind: 'emoney', initialBalance: 0, order: 3, archived: false },
    ];
  }

  // ---- マイグレーション ----
  // 将来 schemaVersion を上げるときは MIGRATIONS[旧バージョン] = (data) => 新形式 を追加する
  const MIGRATIONS = {
    // 0: スキーマ番号のない最初期データ → 1
    0: (d) => { d.schemaVersion = 1; return d; },
  };
  function migrate(d) {
    if (!d || typeof d !== 'object') throw new Error('データ形式が正しくありません');
    let v = Number(d.schemaVersion || 0);
    if (v > SCHEMA_VERSION) throw new Error('このデータは新しいバージョンのアプリで作られています（schemaVersion ' + v + '）');
    while (v < SCHEMA_VERSION) {
      const fn = MIGRATIONS[v];
      if (!fn) throw new Error('schemaVersion ' + v + ' からの移行方法がありません');
      d = fn(d);
      v = d.schemaVersion;
    }
    return normalize(d);
  }

  // 欠けた項目を補い、型をそろえる（バックアップ復元・CSV 読み込み後にも使う）
  function normalize(d) {
    const base = emptyState();
    const out = Object.assign(base, d);
    out.settings = Object.assign(emptyState().settings, d.settings || {});
    out.settings.reminder = Object.assign(emptyState().settings.reminder, (d.settings && d.settings.reminder) || {});
    ['categories', 'accounts', 'transactions', 'templates', 'recurring', 'installments', 'goals'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    if (!out.budgets || typeof out.budgets !== 'object') out.budgets = {};
    if (!out.activity || !Array.isArray(out.activity.entryDays)) out.activity = { entryDays: [] };
    if (!out.badges || typeof out.badges !== 'object') out.badges = {};
    const int = (x) => (Number.isFinite(+x) ? Math.round(+x) : 0);
    out.transactions = out.transactions
      .filter((t) => t && U.isValidDate(t.date) && ['expense', 'income', 'transfer'].includes(t.type))
      .map((t) => ({
        id: String(t.id || U.uid('t_')),
        type: t.type,
        date: t.date,
        amount: Math.abs(int(t.amount)),
        categoryId: t.type === 'transfer' ? null : t.categoryId || null,
        accountId: t.accountId || null,
        toAccountId: t.type === 'transfer' ? t.toAccountId || null : null,
        method: t.method || '',
        payee: String(t.payee || '').slice(0, 60),
        memo: String(t.memo || '').slice(0, 200),
        tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 20) : [],
        receiptId: t.receiptId || null,
        recurringId: t.recurringId || null,
        installment: t.installment || null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
      }));
    out.accounts.forEach((a) => {
      a.initialBalance = int(a.initialBalance);
      if (a.kind === 'card') a.card = Object.assign({ closingDay: 31, payDay: 27, payMonthOffset: 1, payAccountId: null }, a.card || {});
    });
    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  // ---- 状態 ----
  let state = null;
  let version = 0; // 変更のたびに増える（計算キャッシュの無効化用）
  const undoStack = [];
  const listeners = [];
  let lastSaveError = null;

  // 保存先：通常は localStorage。容量不足になったら IndexedDB に切り替える
  const BACKEND_KEY = 'kakeibo.backend';
  let backend = 'local';
  let readOnly = false; // 読み込みに失敗したときは上書きしないように保存を止める

  function parseAndMigrate(raw) {
    const d = JSON.parse(raw);
    const v = Number(d && d.schemaVersion || 0);
    if (v < SCHEMA_VERSION) {
      // マイグレーション前に元データを退避
      try { localStorage.setItem(KEY + '.pre-v' + v, raw); } catch (_) { /* 容量不足なら諦める */ }
    }
    return migrate(d);
  }

  async function load() {
    let raw = null;
    try {
      backend = localStorage.getItem(BACKEND_KEY) === 'idb' ? 'idb' : 'local';
      raw = backend === 'idb' ? await KB.idb.get('kv', KEY) : localStorage.getItem(KEY);
    } catch (e) {
      lastSaveError = e;
    }
    readOnly = false;
    if (raw) {
      try {
        state = parseAndMigrate(raw);
      } catch (e) {
        console.error(e);
        state = emptyState();
        state._loadError = String(e.message || e);
        state._raw = raw;
        readOnly = true;
      }
    } else {
      state = emptyState();
    }
    version++;
    return state;
  }

  function serialize() {
    const s = Object.assign({}, state);
    delete s._loadError;
    delete s._raw;
    return JSON.stringify(s);
  }

  let idbWrite = Promise.resolve();
  function save() {
    if (readOnly) return false;
    const json = serialize();
    if (backend === 'local') {
      try {
        localStorage.setItem(KEY, json);
        lastSaveError = null;
        return true;
      } catch (e) {
        // 容量不足 → IndexedDB へ切り替え
        console.warn('localStorage が満杯のため IndexedDB に切り替えます', e);
        backend = 'idb';
        try { localStorage.setItem(BACKEND_KEY, 'idb'); } catch (_) { /* ignore */ }
        emit('backend', 'idb');
      }
    }
    idbWrite = idbWrite.then(() => KB.idb.put('kv', KEY, json)).then(() => {
      lastSaveError = null;
      try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
    }, (e) => {
      lastSaveError = e;
      emit('saveerror', e);
    });
    return true;
  }

  // 読み込みに失敗したデータを捨てて新しく始める（退避してから）
  function discardBroken() {
    if (state && state._raw) {
      try { localStorage.setItem(KEY + '.broken.' + Date.now(), state._raw); } catch (_) { /* ignore */ }
    }
    readOnly = false;
    state = emptyState();
    version++;
    save();
  }

  function on(fn) { listeners.push(fn); }
  function emit(type, detail) { listeners.forEach((fn) => { try { fn(type, detail); } catch (e) { console.error(e); } }); }

  function undoChars() { return undoStack.reduce((n, u) => n + u.snap.length, 0); }

  /**
   * 状態を変更する。直前の状態を Undo 用に保存してから fn(state) を実行し、保存する。
   * fn が false を返したら変更なしとみなす。
   */
  function mutate(label, fn, opts) {
    const snap = JSON.stringify(state);
    let result;
    try {
      result = fn(state);
    } catch (e) {
      state = JSON.parse(snap); // 途中で失敗したら元に戻す
      throw e;
    }
    if (result === false) return result;
    if (!(opts && opts.noUndo)) {
      undoStack.push({ label, snap });
      while (undoStack.length > UNDO_MAX || (undoStack.length > 1 && undoChars() > UNDO_MAX_CHARS)) undoStack.shift();
    }
    version++;
    const ok = save();
    if (!ok) {
      // 保存できない変更は取り消す（画面と保存内容の食い違いを防ぐ）
      state = JSON.parse(snap);
      if (!(opts && opts.noUndo)) undoStack.pop();
      version++;
      emit('change', { label: label, failed: true });
      throw new Error('保存できませんでした。ブラウザの保存容量が不足している可能性があります。レシート画像を減らすか、バックアップ後に古いデータを整理してください。');
    }
    emit('change', { label });
    return result;
  }

  function undo() {
    const u = undoStack.pop();
    if (!u) return null;
    state = JSON.parse(u.snap);
    version++;
    save();
    emit('change', { label: '元に戻す', undo: true });
    return u.label;
  }
  function canUndo() { return undoStack.length > 0; }
  function undoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : null; }

  function replaceAll(data, label) {
    readOnly = false;
    const next = migrate(JSON.parse(JSON.stringify(data)));
    mutate(label || 'データの復元', (s) => {
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, next);
    });
  }

  // 別タブで変更されたら読み込み直す
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue));
        version++;
        emit('change', { label: '別タブの変更', external: true });
      } catch (err) { console.error(err); }
    }
  });

  // ---- 参照ヘルパー ----
  function cat(id) { return state.categories.find((c) => c.id === id) || null; }
  function acc(id) { return state.accounts.find((a) => a.id === id) || null; }
  function cats(type, includeArchived) {
    return state.categories
      .filter((c) => (!type || c.type === type) && (includeArchived || !c.archived))
      .sort((a, b) => a.order - b.order);
  }
  function accs(includeArchived) {
    return state.accounts.filter((a) => includeArchived || !a.archived).sort((a, b) => a.order - b.order);
  }

  // 入力した日を記録（連続入力日数用）
  function markEntryDay(s, ds) {
    const d = ds || U.today();
    const days = s.activity.entryDays;
    if (!days.includes(d)) {
      days.push(d);
      days.sort();
      if (days.length > 800) days.splice(0, days.length - 800);
    }
  }

  // ---- 初期セットアップ / サンプルデータ ----
  function setup(withSample) {
    mutate('初期設定', (s) => {
      s.categories = defaultCategories();
      s.accounts = defaultAccounts();
      s.templates = [
        { id: U.uid('tp_'), name: 'コンビニ', type: 'expense', amount: 500, categoryId: 'c_ex0', accountId: 'a_emoney', toAccountId: null, method: '電子マネー', memo: 'コンビニ', tags: [] },
        { id: U.uid('tp_'), name: 'ランチ', type: 'expense', amount: 900, categoryId: 'c_ex0', accountId: 'a_cash', toAccountId: null, method: '現金', memo: 'ランチ', tags: [] },
        { id: U.uid('tp_'), name: '電車', type: 'expense', amount: 300, categoryId: 'c_ex2', accountId: 'a_emoney', toAccountId: null, method: '電子マネー', memo: '電車', tags: [] },
      ];
      s.settings.setupDone = true;
      if (withSample) addSample(s);
    }, { noUndo: true });
  }

  function addSample(s) {
    // 再現性のある疑似乱数
    let seed = 20240401;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const now = U.today();
    const cur = U.thisMonth();
    const start = U.addMonths(cur, -5);
    s.accounts.find((a) => a.id === 'a_bank').initialBalance = 420000;
    s.accounts.find((a) => a.id === 'a_cash').initialBalance = 15000;
    s.accounts.find((a) => a.id === 'a_emoney').initialBalance = 3000;
    const tx = (date, type, amount, categoryId, accountId, memo, extra) =>
      s.transactions.push(Object.assign({
        id: U.uid('t_'), type, date, amount, categoryId, accountId, toAccountId: null,
        method: KIND_METHOD[(s.accounts.find((a) => a.id === accountId) || {}).kind] || '',
        payee: type === 'expense' ? memo : '', memo: type === 'expense' ? '' : memo, tags: [], receiptId: null,
        recurringId: null, installment: null, createdAt: date + 'T12:00:00.000Z', updatedAt: date + 'T12:00:00.000Z',
      }, extra || {}));
    const shops = { c_ex0: ['スーパー', 'コンビニ', 'パン屋', 'ランチ', '八百屋'], c_ex1: ['ドラッグストア', '100円ショップ'], c_ex7: ['映画', '本屋', 'ゲーム'], c_ex8: ['飲み会', 'カフェ'] };
    for (let i = 0; i < 6; i++) {
      const ym = U.addMonths(start, i);
      const dim = U.daysInMonth(U.parseYM(ym).y, U.parseYM(ym).m);
      for (let d = 1; d <= dim; d++) {
        const ds = U.dayInMonth(ym, d);
        if (ds > now) break;
        if (rnd() < 0.75) tx(ds, 'expense', Math.round((300 + rnd() * 2500) / 10) * 10, 'c_ex0', pick(['a_cash', 'a_emoney', 'a_card']), pick(shops.c_ex0));
        if (rnd() < 0.15) tx(ds, 'expense', Math.round((200 + rnd() * 1800) / 10) * 10, 'c_ex1', 'a_card', pick(shops.c_ex1));
        if (rnd() < 0.2) tx(ds, 'expense', Math.round((150 + rnd() * 600) / 10) * 10, 'c_ex2', 'a_emoney', '電車');
        if (rnd() < 0.08) tx(ds, 'expense', Math.round((1000 + rnd() * 5000) / 100) * 100, 'c_ex7', 'a_card', pick(shops.c_ex7));
        if (rnd() < 0.06) tx(ds, 'expense', Math.round((2000 + rnd() * 4000) / 100) * 100, 'c_ex8', 'a_cash', pick(shops.c_ex8));
      }
      const d25 = U.dayInMonth(ym, 25);
      if (d25 <= now) tx(d25, 'income', 280000, 'c_in0', 'a_bank', '給与');
      const d1 = U.dayInMonth(ym, 1);
      if (d1 <= now) {
        s.transactions.push({ id: U.uid('t_'), type: 'transfer', date: d1, amount: 30000, categoryId: null, accountId: 'a_bank', toAccountId: 'a_cash', method: '', memo: 'ATM 引き出し', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: d1 + 'T12:00:00.000Z', updatedAt: d1 + 'T12:00:00.000Z' });
        s.transactions.push({ id: U.uid('t_'), type: 'transfer', date: d1, amount: 15000, categoryId: null, accountId: 'a_bank', toAccountId: 'a_emoney', method: '', memo: 'チャージ', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: d1 + 'T12:00:00.000Z', updatedAt: d1 + 'T12:00:00.000Z' });
      }
      if (i === 3) {
        const d = U.dayInMonth(ym, 12);
        if (d <= now) {
          tx(d, 'expense', 24000, 'c_ex7', 'a_card', 'ホテル', { tags: ['旅行'] });
          tx(U.dayInMonth(ym, 13), 'expense', 6800, 'c_ex0', 'a_card', '旅先の食事', { tags: ['旅行'] });
          tx(U.dayInMonth(ym, 13), 'expense', 15600, 'c_ex2', 'a_card', '新幹線', { tags: ['旅行'] });
        }
      }
    }
    // 定期（家賃・通信・給与は過去分をサンプルとして直接入れたので、定期は来月から）
    const rentStart = start;
    s.recurring.push({ id: 'r_rent', name: '家賃', type: 'expense', amount: 72000, day: 27, categoryId: 'c_ex3', accountId: 'a_bank', toAccountId: null, method: '口座振替', memo: '家賃', tags: [], startMonth: rentStart, endMonth: null, lastDate: null, active: true });
    s.recurring.push({ id: 'r_phone', name: 'スマホ代', type: 'expense', amount: 3980, day: 20, categoryId: 'c_ex5', accountId: 'a_card', toAccountId: null, method: 'クレジットカード', memo: 'スマホ代', tags: [], startMonth: rentStart, endMonth: null, lastDate: null, active: true });
    // 給与は過去分が直接入っているので、来月以降を定期にする
    s.recurring.push({ id: 'r_salary', name: '給与', type: 'income', amount: 280000, day: 25, categoryId: 'c_in0', accountId: 'a_bank', toAccountId: null, method: '銀行振込', memo: '給与', tags: [], startMonth: U.dayInMonth(cur, 25) <= now ? U.addMonths(cur, 1) : cur, endMonth: null, lastDate: null, active: true });
    // 予算
    const from = start;
    [['c_ex0', 45000], ['c_ex1', 5000], ['c_ex2', 8000], ['c_ex3', 72000], ['c_ex5', 5000], ['c_ex7', 15000], ['c_ex8', 10000]].forEach(([id, amt]) => {
      s.budgets[id] = [{ from, amount: amt }];
    });
    s.goals.push({ id: U.uid('g_'), name: '旅行資金', target: 1500000, accountIds: ['a_bank'], deadline: U.addMonths(cur, 6) + '-01' });
    const plan = { id: 'i_pc', name: 'ノートPC', total: 158000, count: 12, startMonth: U.addMonths(cur, -2), day: 10, categoryId: 'c_ex7', accountId: 'a_card', method: 'クレジットカード', payee: '家電量販店', memo: 'ノートPC（分割）', tags: ['PC'], createdAt: new Date().toISOString() };
    s.installments.push(plan);
    KB.calc.installmentTxs(plan).forEach((t) => s.transactions.push(t));
    KB.calc.generateRecurring(s); // 定期の過去分も先に作る
    // カードの引き落とし：締め15日・翌月10日払いで、支払日が過ぎた請求を振替として記録
    for (let i = 0; i < 6; i++) {
      const ym = U.addMonths(start, i);
      const from = U.addDays(U.dayInMonth(U.addMonths(ym, -1), 15), 1), to = U.dayInMonth(ym, 15);
      const pay = U.dayInMonth(U.addMonths(ym, 1), 10);
      if (pay > now) continue;
      const amt = s.transactions.filter((t) => t.type === 'expense' && t.accountId === 'a_card' && t.date >= from && t.date <= to).reduce((x, t) => x + t.amount, 0);
      if (amt > 0) s.transactions.push({ id: U.uid('t_'), type: 'transfer', date: pay, amount: amt, categoryId: null, accountId: 'a_bank', toAccountId: 'a_card', method: '', payee: '', memo: 'カード引き落とし', tags: [], receiptId: null, recurringId: null, installment: null, createdAt: pay + 'T12:00:00.000Z', updatedAt: pay + 'T12:00:00.000Z' });
    }
    s.settings.sampleLoaded = true;
    // 連続記録のサンプル（昨日までの5日間）
    for (let i = 5; i >= 1; i--) s.activity.entryDays.push(U.addDays(now, -i));

  }

  KB.store = {
    KEY, SCHEMA_VERSION, METHODS, ACCOUNT_KINDS, KIND_METHOD,
    get state() { return state; },
    get version() { return version; },
    get lastSaveError() { return lastSaveError; },
    get backend() { return backend; },
    get readOnly() { return readOnly; },
    discardBroken, serialize,
    load, save, mutate, undo, canUndo, undoLabel, replaceAll, migrate, normalize, on, emit,
    cat, acc, cats, accs, markEntryDay, setup, emptyState, defaultCategories, defaultAccounts,
  };
})();
