/* 入力シート：収入・支出・振替の登録と編集、テンプレート、分割払い、レシート添付 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store;
  const LAST_KEY = 'kakeibo.lastInput';

  function getLast() {
    try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch (e) { return {}; }
  }
  function setLast(type, v) {
    try {
      const l = getLast();
      l[type] = v;
      l.type = type;
      localStorage.setItem(LAST_KEY, JSON.stringify(l));
    } catch (e) { /* 保存できなくても動作に影響なし */ }
  }

  // 入力シートを開く。opts: { id（編集）, tplId, type, date, copyId }
  function open(opts) {
    opts = opts || {};
    const s = ST().state;
    const editing = opts.id ? s.transactions.find((t) => t.id === opts.id) : null;
    if (opts.id && !editing) { KB.ui.toast('明細が見つかりません', { type: 'error' }); return; }
    const src = editing || (opts.copyId && s.transactions.find((t) => t.id === opts.copyId)) || null;
    const tpl = opts.tplId ? s.templates.find((t) => t.id === opts.tplId) : null;
    const last = getLast();
    const type = (src && src.type) || (tpl && tpl.type) || opts.type || last.type || 'expense';
    const lt = last[type] || {};
    const f = {
      type,
      mode: 'normal',
      amount: src ? src.amount : tpl ? tpl.amount : '',
      date: editing ? editing.date : opts.date || U.today(),
      categoryId: (src && src.categoryId) || (tpl && tpl.categoryId) || lt.categoryId || null,
      accountId: (src && src.accountId) || (tpl && tpl.accountId) || lt.accountId || (ST().accs()[0] || {}).id,
      toAccountId: (src && src.toAccountId) || (tpl && tpl.toAccountId) || lt.toAccountId || null,
      method: (src && src.method) || (tpl && tpl.method) || '',
      payee: (src && src.payee) || (tpl && tpl.payee) || '',
      memo: (src && src.memo) || (tpl && tpl.memo) || '',
      tags: ((src && src.tags) || (tpl && tpl.tags) || []).slice(),
      receiptId: editing ? editing.receiptId : null,
      count: 3,
      startMonth: U.thisMonth(),
      day: Number((opts.date || U.today()).slice(8)),
    };
    if (opts.mode === 'installment' && !editing && f.type === 'expense') f.mode = 'installment';
    if (opts.prefill) Object.assign(f, opts.prefill);
    const body = KB.ui.modal('<form id="txform" novalidate></form>', { title: editing ? '明細を編集' : '記録する' });
    const form = body.querySelector('#txform');
    let keepOpen = false;

    function catsFor(t) { return ST().cats(t); }
    function draw() {
      const cats = f.type === 'transfer' ? [] : catsFor(f.type);
      if (f.type !== 'transfer' && !cats.some((c) => c.id === f.categoryId)) {
        const keep = editing && ST().cat(f.categoryId) && ST().cat(f.categoryId).type === f.type;
        if (!keep) f.categoryId = cats[0] ? cats[0].id : null;
      }
      const acc = ST().acc(f.accountId);
      if (!f.method && acc) f.method = ST().KIND_METHOD[acc.kind] || '';
      const tpls = s.templates.filter((t) => t.type === f.type);
      const isInst = f.mode === 'installment';
      const tags = KB.calc.allTags().filter((g) => !f.tags.includes(g)).slice(0, 8);
      let html = '';
      html += '<div class="seg" role="radiogroup" aria-label="種類">' +
        ['expense', 'income', 'transfer'].map((t) => '<button type="button" role="radio" aria-checked="' + (f.type === t) + '" class="seg-btn seg-' + t + (f.type === t ? ' is-on' : '') + '" data-type="' + t + '">' + { expense: '− 支出', income: '＋ 収入', transfer: '⇄ 振替' }[t] + '</button>').join('') + '</div>';
      if (!editing && tpls.length) {
        html += '<div class="tpl-row" aria-label="テンプレート">' + tpls.map((t) => '<button type="button" class="chip" data-tpl="' + h(t.id) + '">' + h(t.name) + ' <small>' + h(U.yen(t.amount)) + '</small></button>').join('') + '</div>';
      }
      if (!editing && f.type === 'expense') {
        html += '<div class="seg seg-small" role="radiogroup" aria-label="支払い回数"><button type="button" role="radio" aria-checked="' + !isInst + '" class="seg-btn' + (!isInst ? ' is-on' : '') + '" data-mode="normal">1回払い</button>' +
          '<button type="button" role="radio" aria-checked="' + isInst + '" class="seg-btn' + (isInst ? ' is-on' : '') + '" data-mode="installment">分割払い</button></div>';
      }
      html += '<div class="field field-amount"><label for="f-amount">' + (isInst ? '総額' : '金額') + '（円）</label>' +
        '<div class="amount-input"><span aria-hidden="true">¥</span><input id="f-amount" name="amount" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="0" value="' + h(f.amount === '' ? '' : U.fmt(f.amount)) + '" required autofocus></div></div>';
      if (isInst) {
        const preview = Number.isFinite(U.parseYen(f.amount)) && U.parseYen(f.amount) > 0 && f.count >= 2 ? KB.calc.splitAmounts(U.parseYen(f.amount), f.count) : null;
        html += '<div class="grid-3">' +
          '<div class="field"><label for="f-count">回数</label><input id="f-count" type="number" min="2" max="120" inputmode="numeric" value="' + h(f.count) + '"></div>' +
          '<div class="field"><label for="f-start">初回の月</label><input id="f-start" type="month" value="' + h(f.startMonth) + '"></div>' +
          '<div class="field"><label for="f-day">毎月の日</label><input id="f-day" type="number" min="1" max="31" inputmode="numeric" value="' + h(f.day) + '"></div></div>' +
          '<p class="hint" id="inst-preview">' + (preview ? '毎月 ' + h(U.yen(preview[1] !== undefined ? preview[1] : preview[0])) + '×' + f.count + '回' + (preview[0] !== preview[1] ? '（1回目のみ ' + h(U.yen(preview[0])) + '）' : '') + '。月の日数より大きい日は月末になります。' : '総額と回数（2〜120回）を入れてください') + '</p>';
      } else {
        html += '<div class="field"><label for="f-date">日付</label><div class="date-row"><input id="f-date" type="date" value="' + h(f.date) + '" required>' +
          '<button type="button" class="btn btn-small" data-date="0">今日</button><button type="button" class="btn btn-small" data-date="-1">昨日</button></div></div>';
      }
      if (!ST().accs().length) html += '<p class="banner banner-warn">口座がありません。<a href="#/accounts" data-closelink>口座・資産</a>で口座を追加してください。</p>';
      if (f.type !== 'transfer' && !cats.length) html += '<p class="banner banner-warn">' + (f.type === 'income' ? '収入' : '支出') + 'のカテゴリがありません。<a href="#/settings?tab=categories" data-closelink>カテゴリを追加</a>してください。</p>';
      if (f.type !== 'transfer') {
        html += '<fieldset class="field"><legend>カテゴリ <a href="#/settings?tab=categories" class="link-small" data-closelink>編集</a></legend><div class="cat-grid">' +
          cats.map((c) => '<label class="cat-opt' + (c.id === f.categoryId ? ' is-on' : '') + '"><input type="radio" name="cat" value="' + h(c.id) + '"' + (c.id === f.categoryId ? ' checked' : '') + '>' + KB.ui.catIcon(c) + '<span>' + h(c.name) + '</span></label>').join('') +
          (editing && ST().cat(f.categoryId) && ST().cat(f.categoryId).archived ? '<label class="cat-opt is-on"><input type="radio" name="cat" value="' + h(f.categoryId) + '" checked>' + KB.ui.catIcon(ST().cat(f.categoryId)) + '<span>' + h(ST().cat(f.categoryId).name) + '</span></label>' : '') +
          '</div></fieldset>';
      }
      html += '<div class="grid-2">';
      html += '<div class="field"><label for="f-acc">' + (f.type === 'transfer' ? '振替元の口座' : f.type === 'income' ? '入金先の口座' : '支払う口座') + '</label><select id="f-acc">' + KB.ui.accOptions(f.accountId) + '</select></div>';
      if (f.type === 'transfer') {
        html += '<div class="field"><label for="f-to">振替先の口座</label><select id="f-to">' + KB.ui.accOptions(f.toAccountId, { exclude: f.accountId, empty: '選んでください' }) + '</select></div>';
      } else {
        html += '<div class="field"><label for="f-method">支払い方法</label><select id="f-method">' + ['<option value="">（なし）</option>'].concat(ST().METHODS.map((m) => '<option' + (m === f.method ? ' selected' : '') + '>' + h(m) + '</option>')).join('') + '</select></div>';
      }
      html += '</div>';
      if (f.type !== 'transfer') {
        html += '<div class="field"><label for="f-payee">' + (f.type === 'income' ? '相手（会社名など）' : 'お店・相手') + '</label><input id="f-payee" list="payee-list" maxlength="60" autocomplete="off" value="' + h(f.payee) + '" placeholder="例：スーパー○○"><datalist id="payee-list">' + KB.calc.payees().map((p) => '<option value="' + h(p) + '">').join('') + '</datalist></div>';
      }
      html += '<div class="field"><label for="f-memo">メモ</label><input id="f-memo" maxlength="200" autocomplete="off" value="' + h(f.memo) + '"></div>';
      html += '<div class="field"><label for="f-tags">タグ <small class="muted">（スペース区切り。例：#旅行 #出張）</small></label><input id="f-tags" autocomplete="off" value="' + h(f.tags.map((g) => '#' + g).join(' ')) + '">' +
        (tags.length ? '<div class="chip-row">' + tags.map((g) => '<button type="button" class="chip chip-small" data-addtag="' + h(g) + '">#' + h(g) + '</button>').join('') + '</div>' : '') + '</div>';
      if (!isInst) {
        html += '<div class="field"><span class="label">レシート画像</span><div class="receipt-row" id="receipt-row">' +
          (f.receiptId ? '<img id="receipt-preview" alt="添付したレシート" class="receipt-thumb"><button type="button" class="btn btn-small" data-receipt-view>拡大</button><button type="button" class="btn btn-small" data-receipt-remove>外す</button>'
            : '<label class="btn btn-small file-btn">📷 画像を添付<input type="file" accept="image/*" id="f-receipt" hidden></label><small class="muted">長辺1280pxに縮小して保存します</small>') +
          '</div></div>';
      }
      html += '<p class="form-error" id="form-error" role="alert"></p>';
      html += '<div class="btn-row sticky-actions">';
      if (editing) {
        html += '<button type="button" class="btn btn-danger-ghost" data-delete>削除</button><button type="button" class="btn" data-copy>複製</button>';
      } else {
        html += '<button type="button" class="btn" data-savetpl title="今の内容をテンプレートとして保存">テンプレ保存</button>';
      }
      html += '<span class="spacer"></span>';
      if (!editing) html += '<button type="button" class="btn" data-again>保存して続ける</button>';
      html += '<button type="submit" class="btn btn-primary">' + (editing ? '更新する' : '保存') + '</button></div>';
      form.innerHTML = html;
      if (f.receiptId) KB.receipts.url(f.receiptId).then((u) => { const im = form.querySelector('#receipt-preview'); if (im && u) im.src = u; });
    }

    // 画面上の値を f に読み込む
    function read() {
      const v = (id) => { const el = form.querySelector(id); return el ? el.value : undefined; };
      if (v('#f-amount') !== undefined) f.amount = v('#f-amount');
      if (v('#f-date') !== undefined) f.date = v('#f-date');
      const cat = form.querySelector('input[name=cat]:checked');
      if (cat) f.categoryId = cat.value;
      if (v('#f-acc') !== undefined) f.accountId = v('#f-acc');
      if (v('#f-to') !== undefined) f.toAccountId = v('#f-to') || null;
      if (v('#f-method') !== undefined) f.method = v('#f-method');
      if (v('#f-payee') !== undefined) f.payee = v('#f-payee').trim();
      if (v('#f-memo') !== undefined) f.memo = v('#f-memo').trim();
      if (v('#f-tags') !== undefined) f.tags = U.parseTags(v('#f-tags'));
      if (v('#f-count') !== undefined) f.count = parseInt(v('#f-count'), 10) || 0;
      if (v('#f-start') !== undefined) f.startMonth = v('#f-start');
      if (v('#f-day') !== undefined) f.day = parseInt(v('#f-day'), 10) || 0;
    }
    function err(msg, focus) {
      const e = form.querySelector('#form-error');
      e.textContent = msg;
      if (focus) { const el = form.querySelector(focus); if (el) el.focus(); }
      return false;
    }
    function validate() {
      read();
      const amt = U.parseYen(f.amount);
      if (!Number.isFinite(amt) || amt <= 0) return err('金額を1円以上の整数で入れてください', '#f-amount');
      if (amt > 999999999999) return err('金額が大きすぎます', '#f-amount');
      if (f.mode === 'installment') {
        if (!(f.count >= 2 && f.count <= 120)) return err('回数は2〜120回で入れてください', '#f-count');
        if (amt < f.count) return err('総額が回数より少ないと分割できません', '#f-amount');
        if (!/^\d{4}-\d{2}$/.test(f.startMonth)) return err('初回の月を選んでください', '#f-start');
        if (!(f.day >= 1 && f.day <= 31)) return err('毎月の日は1〜31で入れてください', '#f-day');
      } else if (!U.isValidDate(f.date)) return err('日付を正しく入れてください', '#f-date');
      if (f.type !== 'transfer' && !f.categoryId) return err('カテゴリを選んでください');
      if (!ST().acc(f.accountId)) return err('口座を選んでください', '#f-acc');
      if (f.type === 'transfer') {
        if (!f.toAccountId || !ST().acc(f.toAccountId)) return err('振替先の口座を選んでください', '#f-to');
        if (f.toAccountId === f.accountId) return err('振替元と振替先が同じです', '#f-to');
      }
      f.amountInt = amt;
      return true;
    }
    function record() {
      return {
        type: f.type, date: f.date, amount: f.amountInt,
        categoryId: f.type === 'transfer' ? null : f.categoryId, accountId: f.accountId,
        toAccountId: f.type === 'transfer' ? f.toAccountId : null,
        method: f.type === 'transfer' ? '' : f.method, payee: f.type === 'transfer' ? '' : f.payee, memo: f.memo, tags: f.tags,
        receiptId: f.receiptId || null,
      };
    }

    function save(again) {
      if (!validate()) return;
      const rec = record();
      setLast(f.type, { categoryId: rec.categoryId, accountId: rec.accountId, toAccountId: rec.toAccountId });
      let ok;
      if (editing) {
        ok = KB.ui.act('明細の編集', (st) => {
          const t = st.transactions.find((x) => x.id === editing.id);
          if (!t) throw new Error('明細が見つかりません');
          Object.assign(t, rec, { updatedAt: new Date().toISOString() });
        }, '更新しました');
      } else if (f.mode === 'installment') {
        ok = KB.ui.act('分割払いの登録', (st) => {
          const plan = { id: U.uid('i_'), name: f.payee || f.memo || (ST().cat(f.categoryId) || {}).name || '分割払い', total: f.amountInt, count: f.count, startMonth: f.startMonth, day: f.day,
            categoryId: f.categoryId, accountId: f.accountId, method: f.method, payee: f.payee, memo: f.memo, tags: f.tags, createdAt: new Date().toISOString() };
          st.installments.push(plan);
          KB.calc.installmentTxs(plan).forEach((t) => st.transactions.push(t));
          ST().markEntryDay(st);
        }, '分割払い（' + f.count + '回）を登録しました');
      } else {
        ok = KB.ui.act('記録', (st) => {
          const now = new Date().toISOString();
          st.transactions.push(Object.assign({ id: U.uid('t_'), recurringId: null, installment: null, createdAt: now, updatedAt: now }, rec));
          ST().markEntryDay(st);
        }, (f.type === 'income' ? '収入' : f.type === 'expense' ? '支出' : '振替') + ' ' + U.yen(rec.amount) + ' を記録しました');
      }
      if (ok === false) return;
      if (again) {
        // 日付・口座・カテゴリは残して金額などを空にする
        f.amount = ''; f.memo = ''; f.payee = ''; f.receiptId = null; f.mode = 'normal';
        keepOpen = true;
        draw();
        const a = form.querySelector('#f-amount');
        if (a) a.focus();
      } else {
        KB.ui.closeModal();
      }
    }

    form.addEventListener('click', async (e) => {
      const b = e.target.closest('button, a');
      if (!b) return;
      if (b.dataset.type) { read(); f.type = b.dataset.type; f.mode = 'normal'; f.method = ''; const l = getLast()[f.type] || {}; if (!editing) { f.categoryId = l.categoryId || null; } draw(); return; }
      if (b.dataset.mode) { read(); f.mode = b.dataset.mode; draw(); return; }
      if (b.dataset.tpl) {
        const t = s.templates.find((x) => x.id === b.dataset.tpl);
        if (t) Object.assign(f, { type: t.type, amount: t.amount, categoryId: t.categoryId, accountId: t.accountId || f.accountId, toAccountId: t.toAccountId, method: t.method, payee: t.payee || '', memo: t.memo, tags: (t.tags || []).slice() });
        draw();
        return;
      }
      if (b.dataset.date !== undefined) { read(); f.date = U.addDays(U.today(), Number(b.dataset.date)); draw(); return; }
      if (b.dataset.addtag) { read(); if (!f.tags.includes(b.dataset.addtag)) f.tags.push(b.dataset.addtag); draw(); return; }
      if (b.hasAttribute('data-closelink')) { KB.ui.closeModal(); return; }
      if (b.hasAttribute('data-again')) { e.preventDefault(); save(true); return; }
      if (b.hasAttribute('data-receipt-remove')) { read(); f.receiptId = null; draw(); return; }
      if (b.hasAttribute('data-receipt-view')) { const u = await KB.receipts.url(f.receiptId); if (u) window.open(u, '_blank', 'noopener'); return; }
      if (b.hasAttribute('data-savetpl')) {
        if (!validate()) return;
        const name = (f.payee || f.memo || (ST().cat(f.categoryId) || {}).name || 'テンプレート').slice(0, 20);
        KB.ui.act('テンプレートの追加', (st) => {
          st.templates.push({ id: U.uid('tp_'), name, type: f.type, amount: f.amountInt, categoryId: f.categoryId, accountId: f.accountId, toAccountId: f.toAccountId, method: f.method, payee: f.payee, memo: f.memo, tags: f.tags.slice() });
        }, 'テンプレート「' + name + '」を保存しました');
        draw();
        return;
      }
      if (b.hasAttribute('data-copy')) { KB.ui.closeModal(); setTimeout(() => open({ copyId: editing.id }), 0); return; }
      if (b.hasAttribute('data-delete')) { KB.ui.closeModal(); remove([editing.id]); }
    });
    form.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.name === 'cat') { read(); form.querySelectorAll('.cat-opt').forEach((l) => l.classList.toggle('is-on', l.querySelector('input').checked)); return; }
      if (t.id === 'f-acc') { read(); const a = ST().acc(f.accountId); if (a && f.type !== 'transfer') f.method = ST().KIND_METHOD[a.kind] || f.method; draw(); return; }
      if (t.id === 'f-receipt' && t.files && t.files[0]) {
        read();
        const row = form.querySelector('#receipt-row');
        row.innerHTML = '<span class="muted">圧縮しています…</span>';
        try {
          const r = await KB.receipts.save(t.files[0]);
          f.receiptId = r.id;
          KB.ui.toast('レシートを添付しました（' + Math.round(r.size / 1024) + 'KB）');
        } catch (er) {
          KB.ui.toast('画像を保存できませんでした：' + er.message, { type: 'error' });
        }
        draw();
      }
    });
    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'f-amount') {
        // 入力中に3桁区切りを付ける（カーソル位置は末尾からの距離で保つ）
        const raw = t.value;
        const fromEnd = raw.length - (t.selectionStart || raw.length);
        const n = U.parseYen(raw);
        if (Number.isFinite(n) && n >= 0) {
          t.value = U.fmt(n);
          const p = Math.max(0, t.value.length - fromEnd);
          try { t.setSelectionRange(p, p); } catch (_) { /* ignore */ }
        }
        if (f.mode === 'installment') instPreview();
      }
      if (t.id === 'f-count' && f.mode === 'installment') instPreview();
    });
    // 分割払いの毎月の額のプレビュー（金額・回数の入力に合わせて更新）
    function instPreview() {
      read();
      const pv = form.querySelector('#inst-preview');
      if (!pv) return;
      const n2 = U.parseYen(f.amount);
      if (!(n2 > 0 && f.count >= 2 && f.count <= 120)) { pv.textContent = '総額と回数（2〜120回）を入れてください'; return; }
      const a = KB.calc.splitAmounts(n2, f.count);
      pv.textContent = '毎月 ' + U.yen(a[1]) + '×' + f.count + '回' + (a[0] !== a[1] ? '（1回目のみ ' + U.yen(a[0]) + '）' : '') + '。月の日数より大きい日は月末になります。';
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save(false);
    });
    draw();
    return { get keepOpen() { return keepOpen; } };
  }

  // 削除（分割払いの回なら、プラン全体の削除も選べる）
  async function remove(ids, opts) {
    opts = opts || {};
    const s = ST().state;
    const list = s.transactions.filter((t) => ids.includes(t.id));
    if (!list.length) return;
    const inst = list.length === 1 && list[0].installment ? list[0].installment : null;
    if (inst) {
      const plan = s.installments.find((p) => p.id === inst.planId);
      const future = s.transactions.filter((t) => t.installment && t.installment.planId === inst.planId && t.date > U.today()).length;
      const body = KB.ui.modal((opts.planOnly ? '<p>分割払い「' + h(plan ? plan.name : '') + '」を削除します。</p>' : '<p>この明細は分割払い「' + h(plan ? plan.name : '') + '」の ' + inst.no + '/' + inst.count + ' 回目です。</p>') +
        '<div class="stack">' + (opts.planOnly ? '' : '<button class="btn" data-x="one">この回だけ削除</button>') +
        '<button class="btn" data-x="future">今後の回（' + future + '件）とプランを削除</button>' +
        '<button class="btn btn-danger" data-x="all">すべての回とプランを削除</button></div>', { title: '分割払いの削除' });
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        const x = b.dataset.x;
        KB.ui.closeModal();
        KB.ui.act('分割払いの削除', (st) => {
          if (x === 'one') st.transactions = st.transactions.filter((t) => t.id !== list[0].id);
          else {
            const today = U.today();
            st.transactions = st.transactions.filter((t) => !(t.installment && t.installment.planId === inst.planId && (x === 'all' || t.date > today)));
            st.installments = st.installments.filter((p) => p.id !== inst.planId);
          }
        }, '削除しました');
      });
      return;
    }
    KB.ui.act(list.length > 1 ? list.length + '件の削除' : '明細の削除', (st) => {
      const set = new Set(ids);
      st.transactions = st.transactions.filter((t) => !set.has(t.id));
    }, list.length > 1 ? list.length + '件を削除しました' : '削除しました');
  }

  KB.views.input = {
    title: '記録する',
    open, remove,
    render(params) {
      // 直接 #/input で来たときはホームを出してシートを開く
      setTimeout(() => {
        open({ type: params.type, id: params.id, tplId: params.tpl });
        history.replaceState(null, '', '#/home');
      }, 0);
      return KB.views.home.render(params);
    },
    bind(el, params) { KB.views.home.bind(el, params); },
  };
})();
