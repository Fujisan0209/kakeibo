/* 計算：集計・残高・予算・繰り越し・予測・定期/分割の生成・連続日数・バッジ
 * すべて整数（円）で計算する。振替（transfer）は収支の集計に含めない。 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util;
  const S = () => KB.store.state;

  // ---- 変更があるまで使い回すキャッシュ ----
  let cacheVer = -1;
  let cache = {};
  function cached(key, fn) {
    if (cacheVer !== KB.store.version || cache._day !== U.today()) {
      cache = { _day: U.today() };
      cacheVer = KB.store.version;
    }
    if (!(key in cache)) cache[key] = fn();
    return cache[key];
  }

  // 日付順（昇順）に並べた取引
  function sorted() {
    return cached('sorted', () => S().transactions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  }

  // 月ごとの集計 { ym: { income, expense, byCat:{id:amt}, txs:[] } }
  function monthIndex() {
    return cached('monthIndex', () => {
      const idx = {};
      for (const t of S().transactions) {
        const ym = t.date.slice(0, 7);
        const m = idx[ym] || (idx[ym] = { income: 0, expense: 0, byCat: {}, txs: [] });
        m.txs.push(t);
        if (t.type === 'income') m.income += t.amount;
        else if (t.type === 'expense') m.expense += t.amount;
        if (t.type !== 'transfer') {
          const k = t.categoryId || '_none';
          m.byCat[k] = (m.byCat[k] || 0) + t.amount;
        }
      }
      return idx;
    });
  }
  const EMPTY_MONTH = { income: 0, expense: 0, byCat: {}, txs: [] };
  function month(ym) {
    return monthIndex()[ym] || EMPTY_MONTH;
  }
  function monthSummary(ym) {
    const m = month(ym);
    return { income: m.income, expense: m.expense, net: m.income - m.expense, byCat: m.byCat, count: m.txs.length };
  }

  // 取引が口座残高に与える増減
  function delta(t, accId) {
    let d = 0;
    if (t.type === 'income' && t.accountId === accId) d += t.amount;
    if (t.type === 'expense' && t.accountId === accId) d -= t.amount;
    if (t.type === 'transfer') {
      if (t.accountId === accId) d -= t.amount;
      if (t.toAccountId === accId) d += t.amount;
    }
    return d;
  }

  // 指定日（含む）までの口座残高 { accId: 円 }
  function balances(asOf) {
    asOf = asOf || U.today();
    return cached('bal:' + asOf, () => {
      const b = {};
      S().accounts.forEach((a) => { b[a.id] = a.initialBalance || 0; });
      for (const t of S().transactions) {
        if (t.date > asOf) continue;
        if (t.type === 'income' && t.accountId in b) b[t.accountId] += t.amount;
        else if (t.type === 'expense' && t.accountId in b) b[t.accountId] -= t.amount;
        else if (t.type === 'transfer') {
          if (t.accountId in b) b[t.accountId] -= t.amount;
          if (t.toAccountId in b) b[t.toAccountId] += t.amount;
        }
      }
      return b;
    });
  }
  function totalAssets(asOf) {
    const b = balances(asOf);
    return Object.values(b).reduce((x, y) => x + y, 0);
  }

  // 資産推移：直近 n か月の月末（今月は今日時点）の総資産
  function assetTrend(n) {
    return cached('trend:' + n, () => {
      const cur = U.thisMonth();
      const months = [];
      for (let i = n - 1; i >= 0; i--) months.push(U.addMonths(cur, -i));
      const init = S().accounts.reduce((x, a) => x + (a.initialBalance || 0), 0);
      const tx = sorted();
      const today = U.today();
      let total = init, j = 0;
      return months.map((ym) => {
        const { y, m } = U.parseYM(ym);
        let end = ym + '-' + U.pad(U.daysInMonth(y, m));
        if (end > today) end = today;
        while (j < tx.length && tx[j].date <= end) {
          const t = tx[j++];
          if (t.type === 'income') total += t.amount;
          else if (t.type === 'expense') total -= t.amount;
          // 振替は総資産を変えない（ただし削除済み口座への振替は除く）
          else if (t.type === 'transfer') {
            const from = !!KB.store.acc(t.accountId), to = !!KB.store.acc(t.toAccountId);
            if (from && !to) total -= t.amount;
            if (!from && to) total += t.amount;
          }
        }
        return { ym, total };
      });
    });
  }

  // ---- 予算 ----
  function budgetAmount(catId, ym) {
    const hist = S().budgets[catId];
    if (!hist || !hist.length) return null;
    let v = null;
    for (const e of hist) if (e.from <= ym) v = e.amount; // from 昇順で保持
    return v;
  }
  function setBudget(s, catId, ym, amount) {
    const hist = (s.budgets[catId] = (s.budgets[catId] || []).filter((e) => e.from !== ym));
    hist.push({ from: ym, amount: amount });
    hist.sort((a, b) => (a.from < b.from ? -1 : 1));
    // 同じ金額が続く履歴はまとめる
    for (let i = hist.length - 1; i > 0; i--) if (hist[i].amount === hist[i - 1].amount) hist.splice(i, 1);
  }

  // 実績の支出（今日まで）と予定（今日より後）に分ける
  function catSpent(catId, ym) {
    const today = U.today();
    let spent = 0, scheduled = 0;
    for (const t of month(ym).txs) {
      if (t.type !== 'expense' || t.categoryId !== catId) continue;
      if (t.date <= today) spent += t.amount; else scheduled += t.amount;
    }
    return { spent, scheduled };
  }

  // 繰越額（月 ym に入ってくる額）。ON にした月より前にはさかのぼらない。マイナスは繰り越さない。
  function carryIn(catId, ym) {
    const st = S().settings;
    if (!st.carryover || !st.carryoverSince) return 0;
    return cached('carry:' + catId + ':' + ym + ':' + st.carryoverSince, () => {
      let carry = 0;
      const startYM = st.carryoverSince;
      if (ym <= startYM) return 0;
      for (let m = startYM; m < ym; m = U.addMonths(m, 1)) {
        const b = budgetAmount(catId, m);
        if (b === null) { carry = 0; continue; }
        const used = month(m).byCat[catId] || 0;
        carry = Math.max(0, b + carry - used);
      }
      return carry;
    });
  }

  // 使用率から警告レベル：80% 以上で warn、100% 以上で over
  function level(spent, available) {
    if (available <= 0) return spent > 0 ? 'over' : 'ok';
    const r = spent / available;
    return r >= 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok';
  }

  function budgetStatus(ym) {
    ym = ym || U.thisMonth();
    return KB.store.cats('expense')
      .map((c) => {
        const budget = budgetAmount(c.id, ym);
        if (budget === null || c.archived) return null;
        const carry = carryIn(c.id, ym);
        const available = budget + carry;
        const { spent, scheduled } = catSpent(c.id, ym);
        return { cat: c, budget, carry, available, spent, scheduled, rest: available - spent, rate: available > 0 ? spent / available : (spent > 0 ? Infinity : 0), level: level(spent, available) };
      })
      .filter(Boolean);
  }

  // 今月あと1日いくら使えるか（予算を設定したカテゴリが対象）
  function dailyAllowance() {
    const ym = U.thisMonth();
    const rows = budgetStatus(ym);
    if (!rows.length) return null;
    const today = U.today();
    const { y, m } = U.parseYM(ym);
    const lastDay = ym + '-' + U.pad(U.daysInMonth(y, m));
    const daysLeft = U.dayDiff(today, lastDay) + 1; // 今日を含む
    // まだ登録されていない今月の定期支出（予算対象カテゴリ）も差し引く
    const upcoming = {};
    upcomingRecurring(U.addDays(today, 1), lastDay).forEach((t) => {
      if (t.type === 'expense') upcoming[t.categoryId] = (upcoming[t.categoryId] || 0) + t.amount;
    });
    let available = 0, spent = 0, scheduled = 0, rest = 0, over = 0;
    rows.forEach((r) => {
      const sch = r.scheduled + (upcoming[r.cat.id] || 0);
      const left = r.available - r.spent - sch;
      available += r.available; spent += r.spent; scheduled += sch;
      // あるカテゴリの超過で、ほかのカテゴリの残りが消えないようにする
      if (left > 0) rest += left; else over -= left;
    });
    return { available, spent, scheduled, rest, over, daysLeft, perDay: Math.floor(rest / daysLeft) };
  }

  // ---- 定期（固定費・定期収入）----
  // r の発生日を from〜to（含む）で列挙
  function occurrences(r, from, to) {
    const out = [];
    if (!r.active) return out;
    let ym = r.startMonth;
    if (from.slice(0, 7) > ym) ym = from.slice(0, 7);
    const endYM = r.endMonth || '9999-12';
    for (let i = 0; i < 1200 && ym <= endYM && ym <= to.slice(0, 7); i++, ym = U.addMonths(ym, 1)) {
      const d = U.dayInMonth(ym, r.day);
      if (d >= from && d <= to) out.push(d);
    }
    return out;
  }
  function recurringTx(r, date) {
    const now = new Date().toISOString();
    return {
      id: U.uid('t_'), type: r.type, date, amount: r.amount,
      categoryId: r.type === 'transfer' ? null : r.categoryId, accountId: r.accountId,
      toAccountId: r.type === 'transfer' ? r.toAccountId : null, method: r.method || '', payee: r.payee || '',
      memo: r.memo || r.name || '', tags: (r.tags || []).slice(), receiptId: null, recurringId: r.id, installment: null,
      createdAt: now, updatedAt: now,
    };
  }
  // 次に登録する範囲の始まり：最後に登録した月の翌月1日（日付を変えても同じ月に2回登録しない）
  function nextFrom(r) {
    return r.lastDate ? U.addMonths(r.lastDate.slice(0, 7), 1) + '-01' : r.startMonth + '-01';
  }
  // 今日までの未登録分を作る。戻り値は作った件数
  function generateRecurring(s) {
    const today = U.today();
    let n = 0;
    for (const r of s.recurring) {
      if (!r.active) continue;
      const from = nextFrom(r);
      const dates = occurrences(r, from, today);
      for (const d of dates) {
        s.transactions.push(recurringTx(r, d));
        r.lastDate = d;
        n++;
      }
    }
    return n;
  }
  // まだ登録されていない（未来の）定期の発生を仮の取引として返す
  function upcomingRecurring(from, to) {
    const out = [];
    for (const r of S().recurring) {
      if (!r.active) continue;
      const nf = nextFrom(r);
      const start = nf > from ? nf : from;
      occurrences(r, start, to).forEach((d) => out.push(Object.assign(recurringTx(r, d), { virtual: true })));
    }
    return out;
  }

  // ---- 分割払い ----
  // 総額を回数で割り、端数は1回目に上乗せ（合計は必ず総額と一致）
  function splitAmounts(total, count) {
    const base = Math.floor(total / count);
    const rem = total - base * count;
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + rem : base));
  }
  function installmentTxs(p) {
    const amounts = splitAmounts(p.total, p.count);
    const now = new Date().toISOString();
    return amounts.map((amt, i) => ({
      id: U.uid('t_'), type: 'expense', date: U.dayInMonth(U.addMonths(p.startMonth, i), p.day), amount: amt,
      categoryId: p.categoryId, accountId: p.accountId, toAccountId: null, method: p.method || '', payee: p.payee || '',
      memo: (p.memo || p.name) + '（' + (i + 1) + '/' + p.count + '回）', tags: (p.tags || []).slice(), receiptId: null,
      recurringId: null, installment: { planId: p.id, no: i + 1, count: p.count }, createdAt: now, updatedAt: now,
    }));
  }

  // ---- クレジットカード ----
  // 土日なら翌月曜にずらす（祝日は考慮しない）
  function nextBusinessDay(ds) {
    const w = U.weekday(ds);
    return w === 6 ? U.addDays(ds, 2) : w === 0 ? U.addDays(ds, 1) : ds;
  }
  function closingDate(ym, c) { return U.dayInMonth(ym, c.closingDay); }
  // 締め月 ym の請求期間と支払日
  function statement(acc, ym) {
    const c = acc.card;
    const end = closingDate(ym, c);
    const start = U.addDays(closingDate(U.addMonths(ym, -1), c), 1);
    const payDate = nextBusinessDay(U.dayInMonth(U.addMonths(ym, c.payMonthOffset || 1), c.payDay));
    const today = U.today();
    let amount = 0, count = 0;
    const consider = (t) => {
      if (t.date < start || t.date > end) return;
      if (t.type === 'expense' && t.accountId === acc.id) { amount += t.amount; count++; }
      if (t.type === 'income' && t.accountId === acc.id) { amount -= t.amount; count++; } // 返金など
    };
    // 期間にかかる月の取引だけを見る
    for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = U.addMonths(m, 1)) month(m).txs.forEach(consider);
    // 期間内の未登録の定期
    if (end > today) upcomingRecurring(U.addDays(today, 1), end).forEach(consider);
    return { ym, start, end, payDate, amount, count, closed: end < today };
  }
  // 支払いがまだ来ていない請求（締め済み）と、今の請求期間
  function cardForecast(acc) {
    if (!acc.card) return [];
    const today = U.today();
    const out = [];
    const cur = U.thisMonth();
    // カードへの振替（引き落とし）。未登録の定期の振替も含める
    const pays = S().transactions.filter((t) => t.type === 'transfer' && t.toAccountId === acc.id)
      .concat(upcomingRecurring(U.addDays(today, 1), U.addDays(today, 120)).filter((t) => t.type === 'transfer' && t.toAccountId === acc.id));
    for (let i = -3; i <= 1; i++) {
      const ym = U.addMonths(cur, i);
      const st = statement(acc, ym);
      if (!(st.payDate >= today && st.start <= U.addDays(today, 40))) continue;
      // 締め日の翌日〜次の締め日までの振替を、この請求への支払いとみなす
      const nextEnd = closingDate(U.addMonths(ym, 1), acc.card);
      st.paid = pays.filter((t) => t.date > st.end && t.date <= nextEnd).reduce((x, t) => x + t.amount, 0);
      st.remaining = Math.max(0, st.amount - st.paid);
      out.push(st);
    }
    // 引き落とし口座の残高が足りるか（支払日時点の見込み）
    const payAcc = KB.store.acc(acc.card.payAccountId);
    out.forEach((st) => {
      if (!payAcc) return;
      st.payAccount = payAcc;
      st.payAccountBalance = projectedBalance(payAcc.id, st.payDate);
      // 記録済みの引き落としは見込み残高に入っているので、残りの額だけで判定する
      st.shortage = st.remaining > 0 && st.payAccountBalance < st.remaining;
    });
    return out;
  }
  // 口座の指定日の見込み残高（登録済みの予定と、未登録の定期を含む）
  function projectedBalance(accId, date) {
    const today = U.today();
    if (date <= today) return balances(date)[accId] || 0;
    let b = balances(today)[accId] || 0;
    for (const t of S().transactions) if (t.date > today && t.date <= date) b += delta(t, accId);
    upcomingRecurring(U.addDays(today, 1), date).forEach((t) => { b += delta(t, accId); });
    return b;
  }

  // ---- 月末残高の将来予測 ----
  // 変動支出（定期・分割以外）の1日平均：過去90日（データがそれより短ければその期間）
  function variableDaily() {
    return cached('varDaily', () => {
      const today = U.today();
      const tx = sorted();
      const firstTx = tx.find((t) => t.type === 'expense' && !t.recurringId && !t.installment);
      if (!firstTx) return 0;
      const first = firstTx.date;
      let from = U.addDays(today, -89);
      if (first > from) from = first;
      const days = Math.max(1, U.dayDiff(from, today) + 1);
      let sum = 0;
      for (const t of tx) {
        if (t.date < from || t.date > today) continue;
        if (t.type === 'expense' && !t.recurringId && !t.installment) sum += t.amount;
      }
      // 7日未満しかデータがないときは信頼できないので 0 扱い
      return days < 7 ? 0 : Math.round(sum / days);
    });
  }
  function forecast(nMonths) {
    nMonths = nMonths || 4;
    const today = U.today();
    const perDay = variableDaily();
    let base = totalAssets(today);
    const out = [];
    let cursor = today; // ここまで計算済み
    for (let i = 0; i < nMonths; i++) {
      const ym = U.addMonths(U.thisMonth(), i);
      const { y, m } = U.parseYM(ym);
      const end = ym + '-' + U.pad(U.daysInMonth(y, m));
      const from = U.addDays(cursor, 1);
      let scheduled = 0;
      for (const t of S().transactions) {
        if (t.date >= from && t.date <= end) scheduled += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
      }
      upcomingRecurring(from, end).forEach((t) => { scheduled += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0; });
      const days = U.dayDiff(cursor, end);
      const variable = perDay * days;
      base = base + scheduled - variable;
      out.push({ ym, total: base, scheduled, variable, days });
      cursor = end;
    }
    return { perDay, months: out };
  }

  // ---- 分析 ----
  function range(fromYM, toYM) {
    const out = [];
    for (let m = fromYM; m <= toYM; m = U.addMonths(m, 1)) out.push(m);
    return out;
  }
  function ranking(fromYM, toYM, by, limit) {
    const map = {};
    range(fromYM, toYM).forEach((ym) => {
      for (const t of month(ym).txs) {
        if (t.type !== 'expense') continue;
        let key;
        if (by === 'category') key = t.categoryId || '_none';
        else key = normalizeName(t.payee || t.memo.replace(/（\d+\/\d+回）$/, '')) || '（未入力）';
        const e = map[key] || (map[key] = { key, amount: 0, count: 0 });
        e.amount += t.amount;
        e.count++;
      }
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, limit || 10);
  }
  // 店名の表記ゆれを少しだけ吸収（全角英数→半角、空白の統一）
  function normalizeName(s) {
    return String(s || '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[\s　]+/g, ' ')
      .trim();
  }
  function compare(ym) {
    const cur = monthSummary(ym), prev = monthSummary(U.addMonths(ym, -1)), yoy = monthSummary(U.addMonths(ym, -12));
    const ids = new Set([...Object.keys(cur.byCat), ...Object.keys(prev.byCat), ...Object.keys(yoy.byCat)]);
    const rows = [...ids]
      .map((id) => ({ id, cat: KB.store.cat(id), cur: cur.byCat[id] || 0, prev: prev.byCat[id] || 0, yoy: yoy.byCat[id] || 0 }))
      .filter((r) => !r.cat || r.cat.type === 'expense')
      .sort((a, b) => b.cur - a.cur);
    return { cur, prev, yoy, rows };
  }
  function calendar(ym) {
    const days = {};
    for (const t of month(ym).txs) {
      if (t.type === 'expense') days[t.date] = (days[t.date] || 0) + t.amount;
    }
    return days;
  }
  function yearReport(y) {
    const months = range(y + '-01', y + '-12').map((ym) => Object.assign({ ym }, monthSummary(ym)));
    const income = months.reduce((x, m) => x + m.income, 0);
    const expense = months.reduce((x, m) => x + m.expense, 0);
    const byCat = {};
    months.forEach((m) => Object.keys(m.byCat).forEach((k) => { byCat[k] = (byCat[k] || 0) + m.byCat[k]; }));
    return { y, months, income, expense, net: income - expense, rate: income > 0 ? (income - expense) / income : null, byCat };
  }

  // ---- 検索 ----
  function filter(q) {
    const kw = (q.keyword || '').trim().toLowerCase();
    const kws = kw ? kw.split(/[\s　]+/) : [];
    let list = S().transactions.filter((t) => {
      if (q.type && t.type !== q.type) return false;
      if (q.from && t.date < q.from) return false;
      if (q.to && t.date > q.to) return false;
      if (q.min !== undefined && q.min !== null && t.amount < q.min) return false;
      if (q.max !== undefined && q.max !== null && t.amount > q.max) return false;
      if (q.categoryId && t.categoryId !== q.categoryId) return false;
      if (q.accountId && t.accountId !== q.accountId && t.toAccountId !== q.accountId) return false;
      if (q.tag && !t.tags.includes(q.tag)) return false;
      if (kws.length) {
        const c = KB.store.cat(t.categoryId);
        const hay = (t.memo + ' ' + t.payee + ' ' + (c ? c.name : '') + ' ' + t.tags.map((x) => '#' + x).join(' ') + ' ' + t.method).toLowerCase();
        if (!kws.every((k) => hay.includes(k))) return false;
      }
      return true;
    });
    const dir = q.sort && q.sort.endsWith('asc') ? 1 : -1;
    if (q.sort && q.sort.startsWith('amount')) list.sort((a, b) => (a.amount - b.amount) * dir || (a.date < b.date ? 1 : -1));
    else list.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1) * (dir === 1 ? -1 : 1));
    return list;
  }
  function allTags() {
    return cached('tags', () => {
      const m = {};
      S().transactions.forEach((t) => t.tags.forEach((g) => { m[g] = (m[g] || 0) + 1; }));
      return Object.keys(m).sort((a, b) => m[b] - m[a]);
    });
  }
  function tagSummary(fromYM, toYM) {
    const m = {};
    range(fromYM, toYM).forEach((ym) => month(ym).txs.forEach((t) => {
      if (t.type !== 'expense') return;
      t.tags.forEach((g) => { m[g] = (m[g] || 0) + t.amount; });
    }));
    return Object.entries(m).map(([tag, amount]) => ({ tag, amount })).sort((a, b) => b.amount - a.amount);
  }
  function payees() {
    return cached('payees', () => {
      const m = {};
      S().transactions.forEach((t) => { if (t.payee) m[t.payee] = (m[t.payee] || 0) + 1; });
      return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 200);
    });
  }

  // ---- 貯金目標 ----
  function goalProgress(g) {
    const b = balances();
    const saved = (g.accountIds || []).reduce((x, id) => x + Math.max(0, b[id] || 0), 0);
    const rate = g.target > 0 ? saved / g.target : 0;
    let perMonth = null;
    if (g.deadline && saved < g.target) {
      const months = Math.max(1, U.monthDiff(U.thisMonth(), g.deadline.slice(0, 7)) + 1);
      perMonth = Math.ceil((g.target - saved) / months);
    }
    return { saved, rate, perMonth };
  }

  // ---- 連続入力日数 ----
  function streak() {
    const days = new Set(S().activity.entryDays);
    let d = U.today();
    if (!days.has(d)) d = U.addDays(d, -1); // 今日まだなら昨日から数える
    let n = 0;
    while (days.has(d)) { n++; d = U.addDays(d, -1); }
    // 最長記録
    let best = 0, run = 0, prev = null;
    S().activity.entryDays.forEach((x) => {
      run = prev && U.addDays(prev, 1) === x ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    });
    return { current: n, best, todayDone: days.has(U.today()) };
  }

  // ---- バッジ ----
  const BADGES = [
    { id: 'first', icon: '🌱', name: 'はじめの一歩', desc: '初めて記録した' },
    { id: 'streak3', icon: '🔥', name: '3日坊主卒業', desc: '3日連続で記録した' },
    { id: 'streak7', icon: '📅', name: '1週間継続', desc: '7日連続で記録した' },
    { id: 'streak30', icon: '🏅', name: '1か月継続', desc: '30日連続で記録した' },
    { id: 'streak100', icon: '👑', name: '100日継続', desc: '100日連続で記録した' },
    { id: 'count100', icon: '📒', name: '記録100件', desc: '取引を100件記録した' },
    { id: 'budget', icon: '🎯', name: '予算達成', desc: '1か月間、すべての予算内に収めた' },
    { id: 'surplus', icon: '💰', name: '黒字の月', desc: '収入が支出を上回った月があった' },
    { id: 'surplus3', icon: '📈', name: '3か月連続黒字', desc: '3か月続けて黒字だった' },
    { id: 'saving10', icon: '✂️', name: '節約上手', desc: '前月より支出を10%以上減らした' },
    { id: 'goal', icon: '🏆', name: '目標達成', desc: '貯金目標を達成した' },
  ];
  // 新しく取ったバッジの id を返す（state を直接更新する）
  function checkBadges(s) {
    const got = s.badges;
    const earned = [];
    const give = (id) => { if (!got[id]) { got[id] = U.today(); earned.push(id); } };
    const manual = s.transactions.filter((t) => !t.recurringId && !t.installment).length;
    if (manual >= 1) give('first');
    const st = streak();
    const best = Math.max(st.best, st.current);
    if (best >= 3) give('streak3');
    if (best >= 7) give('streak7');
    if (best >= 30) give('streak30');
    if (best >= 100) give('streak100');
    if (manual >= 100) give('count100');
    // 終わった月だけで判定
    const cur = U.thisMonth();
    let run = 0;
    for (let i = 12; i >= 1; i--) {
      const ym = U.addMonths(cur, -i);
      const ms = monthSummary(ym);
      if (!ms.count) { run = 0; continue; }
      if (ms.income > ms.expense) { give('surplus'); run++; if (run >= 3) give('surplus3'); } else run = 0;
      const bs = budgetStatus(ym);
      if (bs.length && bs.every((r) => r.spent <= r.available)) give('budget');
      const pv = monthSummary(U.addMonths(ym, -1));
      if (pv.expense > 0 && ms.expense > 0 && ms.expense <= pv.expense * 0.9) give('saving10');
    }
    if (s.goals.some((g) => g.target > 0 && goalProgress(g).saved >= g.target)) give('goal');
    return earned;
  }

  KB.calc = {
    month, monthSummary, balances, totalAssets, assetTrend, delta,
    budgetAmount, setBudget, budgetStatus, carryIn, dailyAllowance, level,
    occurrences, nextFrom, generateRecurring, upcomingRecurring, splitAmounts, installmentTxs,
    statement, cardForecast, projectedBalance, nextBusinessDay, variableDaily, forecast,
    range, ranking, compare, calendar, yearReport, filter, allTags, tagSummary, payees, normalizeName,
    goalProgress, streak, BADGES, checkBadges,
  };
})();
