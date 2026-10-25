/* 明細：検索・絞り込み・並べ替え・まとめて編集・削除 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store;
  const PAGE = 150;

  let q = { keyword: '', type: '', from: '', to: '', min: '', max: '', categoryId: '', accountId: '', tag: '', sort: 'date-desc' };
  let shown = PAGE;
  let selecting = false;
  const selected = new Set();
  let lastList = [];

  function query() {
    const n = (v) => { const x = U.parseYen(v); return Number.isFinite(x) ? x : null; };
    return Object.assign({}, q, { min: q.min === '' ? null : n(q.min), max: q.max === '' ? null : n(q.max) });
  }

  function filtersActive() {
    return ['keyword', 'type', 'from', 'to', 'min', 'max', 'categoryId', 'accountId', 'tag'].some((k) => q[k] !== '');
  }

  function render(params) {
    // 他の画面からの絞り込み指定（例：#/list?tag=旅行）
    if (params && Object.keys(params).length) {
      q = Object.assign({ keyword: '', type: '', from: '', to: '', min: '', max: '', categoryId: '', accountId: '', tag: '', sort: 'date-desc' }, params);
      shown = PAGE;
      history.replaceState(null, '', '#/list'); // 再描画のたびに条件が戻らないように
    }
    const cats = ST().cats(null, true);
    const tags = KB.calc.allTags();
    let html = '<div class="page-head"><h1>明細</h1><div class="btn-row"><button class="btn" data-x="select" aria-pressed="' + selecting + '">' + (selecting ? '選択をやめる' : 'まとめて編集') + '</button>' +
      '<button class="btn btn-primary only-pc" data-act="add">＋ 記録する</button></div></div>';
    html += '<form class="card filter" id="filter" role="search" onsubmit="return false">' +
      '<div class="filter-main"><label class="sr-only" for="q-kw">キーワード</label><input id="q-kw" name="keyword" type="search" placeholder="🔍 メモ・お店・カテゴリ・#タグで検索" value="' + h(q.keyword) + '">' +
      '<label class="sr-only" for="q-sort">並べ替え</label><select id="q-sort" name="sort">' +
      [['date-desc', '日付が新しい順'], ['date-asc', '日付が古い順'], ['amount-desc', '金額が大きい順'], ['amount-asc', '金額が小さい順']].map(([v, l]) => '<option value="' + v + '"' + (q.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<details' + (filtersActive() && !q.keyword ? ' open' : '') + '><summary>詳しい条件' + (filtersActive() ? '（絞り込み中）' : '') + '</summary><div class="filter-grid">' +
      '<div class="field"><label for="q-type">種類</label><select id="q-type" name="type"><option value="">すべて</option><option value="expense"' + (q.type === 'expense' ? ' selected' : '') + '>支出</option><option value="income"' + (q.type === 'income' ? ' selected' : '') + '>収入</option><option value="transfer"' + (q.type === 'transfer' ? ' selected' : '') + '>振替</option></select></div>' +
      '<div class="field"><label for="q-from">期間（から）</label><input id="q-from" name="from" type="date" value="' + h(q.from) + '"></div>' +
      '<div class="field"><label for="q-to">期間（まで）</label><input id="q-to" name="to" type="date" value="' + h(q.to) + '"></div>' +
      '<div class="field"><label for="q-min">金額（以上）</label><input id="q-min" name="min" inputmode="numeric" value="' + h(q.min) + '" placeholder="¥"></div>' +
      '<div class="field"><label for="q-max">金額（以下）</label><input id="q-max" name="max" inputmode="numeric" value="' + h(q.max) + '" placeholder="¥"></div>' +
      '<div class="field"><label for="q-cat">カテゴリ</label><select id="q-cat" name="categoryId">' + KB.ui.options(cats, q.categoryId, { empty: 'すべて' }) + '</select></div>' +
      '<div class="field"><label for="q-acc">口座</label><select id="q-acc" name="accountId">' + KB.ui.options(ST().accs(true), q.accountId, { empty: 'すべて' }) + '</select></div>' +
      '<div class="field"><label for="q-tag">タグ</label><select id="q-tag" name="tag"><option value="">すべて</option>' + tags.map((g) => '<option' + (g === q.tag ? ' selected' : '') + ' value="' + h(g) + '">#' + h(g) + '</option>').join('') + '</select></div>' +
      '<div class="field field-end"><button type="button" class="btn" data-x="clear">条件をクリア</button></div>' +
      '</div><div class="chip-row">' +
      [['今月', 0], ['先月', -1]].map(([l, n]) => '<button type="button" class="chip chip-small" data-month="' + n + '">' + l + '</button>').join('') +
      '<button type="button" class="chip chip-small" data-year="0">今年</button></div></details></form>';
    html += '<div id="results"></div>';
    return html;
  }

  function results(el) {
    const list = KB.calc.filter(query());
    lastList = list;
    let inc = 0, exp = 0;
    list.forEach((t) => { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; });
    let html = '<div class="summary-bar" aria-live="polite"><span>' + U.fmt(list.length) + ' 件</span><span>収入 ' + KB.ui.net(inc) + '</span><span>支出 <span class="amt amt-expense">−' + h(U.yen(exp)) + '</span></span>' +
      '<span class="spacer"></span><button class="btn btn-small" data-x="csv"' + (list.length ? '' : ' disabled') + '>この条件でCSV</button></div>';
    if (selecting) {
      const allOn = list.length > 0 && list.every((t) => selected.has(t.id));
      html += '<div class="bulk-bar card"><label><input type="checkbox" data-x="all"' + (allOn ? ' checked' : '') + '> すべて選択（' + U.fmt(list.length) + '件）</label><strong>' + selected.size + ' 件選択中</strong>' +
        '<div class="btn-row"><button class="btn btn-small" data-x="bulk-cat"' + (selected.size ? '' : ' disabled') + '>カテゴリ変更</button>' +
        '<button class="btn btn-small" data-x="bulk-acc"' + (selected.size ? '' : ' disabled') + '>口座変更</button>' +
        '<button class="btn btn-small" data-x="bulk-tag"' + (selected.size ? '' : ' disabled') + '>タグ追加・削除</button>' +
        '<button class="btn btn-small btn-danger" data-x="bulk-del"' + (selected.size ? '' : ' disabled') + '>削除</button></div></div>';
    }
    const page = list.slice(0, shown);
    // 日付順のときだけ日付見出しでまとめる
    if (q.sort.startsWith('date')) {
      html += KB.ui.txList(page, { withYear: true, empty: filtersActive() ? '条件に合う明細はありません' : 'まだ記録がありません', rowOpts: () => ({ select: selecting, checked: false }) });
    } else {
      html += page.length ? '<ul class="tx-list">' + page.map((t) => KB.ui.txRow(t, { select: selecting, showDate: true })).join('') + '</ul>' : '<p class="empty">条件に合う明細はありません</p>';
    }
    if (list.length > shown) html += '<div class="center"><button class="btn" data-x="more">さらに表示（残り ' + U.fmt(list.length - shown) + ' 件）</button></div>';
    const box = el.querySelector('#results');
    box.innerHTML = html;
    if (selecting) box.querySelectorAll('[data-select]').forEach((c) => { c.checked = selected.has(c.dataset.select); });
  }

  function bind(el) {
    const form = el.querySelector('#filter');
    const update = () => {
      new FormData(form).forEach((v, k) => { q[k] = String(v); });
      shown = PAGE;
      results(el);
    };
    form.addEventListener('input', U.debounce(update, 200));
    form.addEventListener('change', update);
    el.addEventListener('change', (e) => {
      const c = e.target;
      if (c.dataset.select) {
        if (c.checked) selected.add(c.dataset.select); else selected.delete(c.dataset.select);
        results(el);
      } else if (c.dataset.x === 'all') {
        lastList.forEach((t) => (c.checked ? selected.add(t.id) : selected.delete(t.id)));
        results(el);
      }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const x = b.dataset.x;
      if (b.dataset.month !== undefined) {
        const ym = U.addMonths(U.thisMonth(), Number(b.dataset.month));
        const { y, m } = U.parseYM(ym);
        q.from = ym + '-01'; q.to = ym + '-' + U.pad(U.daysInMonth(y, m));
        KB.ui.refresh();
        return;
      }
      if (b.dataset.year !== undefined) { const y = U.today().slice(0, 4); q.from = y + '-01-01'; q.to = y + '-12-31'; KB.ui.refresh(); return; }
      if (b.dataset.edit && selecting) {
        // 選択モードでは行をタップすると選択を切り替える
        e.stopImmediatePropagation();
        const id = b.dataset.edit;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        results(el);
        return;
      }
      if (!x) return;
      if (x === 'select') { selecting = !selecting; selected.clear(); KB.ui.refresh(); }
      else if (x === 'clear') { q = { keyword: '', type: '', from: '', to: '', min: '', max: '', categoryId: '', accountId: '', tag: '', sort: q.sort }; KB.ui.refresh(); }
      else if (x === 'more') { shown += PAGE * 2; results(el); }
      else if (x === 'csv') { U.download('kakeibo-明細-' + U.today() + '.csv', KB.io.exportCSV(lastList.slice().reverse()), 'text/csv;charset=utf-8'); }
      else if (x === 'bulk-del') {
        const ids = [...selected];
        if (await KB.ui.confirm(ids.length + ' 件の明細を削除します。\n（直後なら「元に戻す」で戻せます）', { ok: '削除する', danger: true })) {
          KB.ui.act(ids.length + '件の削除', (s) => { s.transactions = s.transactions.filter((t) => !selected.has(t.id)); }, ids.length + ' 件を削除しました');
          selected.clear();
        }
      } else if (x === 'bulk-cat') bulkCategory();
      else if (x === 'bulk-acc') bulkAccount();
      else if (x === 'bulk-tag') bulkTag();
    }, true);
    KB.views.home.bindCommon(el);
    results(el);
  }

  function bulkCategory() {
    const ids = [...selected];
    const txs = ST().state.transactions.filter((t) => selected.has(t.id) && t.type !== 'transfer');
    const types = new Set(txs.map((t) => t.type));
    if (!txs.length) { KB.ui.toast('振替にはカテゴリがありません'); return; }
    if (types.size > 1) { KB.ui.toast('収入と支出が混ざっています。種類で絞り込んでから変更してください', { type: 'error' }); return; }
    const type = [...types][0];
    const body = KB.ui.modal('<p>' + txs.length + ' 件のカテゴリを変更します' + (ids.length > txs.length ? '（振替 ' + (ids.length - txs.length) + ' 件は対象外）' : '') + '。</p>' +
      '<div class="field"><label for="b-cat">新しいカテゴリ</label><select id="b-cat">' + KB.ui.options(ST().cats(type), null) + '</select></div>' +
      '<div class="btn-row end"><button class="btn btn-primary" data-ok>変更する</button></div>', { title: 'カテゴリをまとめて変更' });
    body.querySelector('[data-ok]').addEventListener('click', () => {
      const id = body.querySelector('#b-cat').value;
      KB.ui.closeModal();
      const set = new Set(txs.map((t) => t.id));
      KB.ui.act('カテゴリの一括変更', (s) => { s.transactions.forEach((t) => { if (set.has(t.id)) { t.categoryId = id; t.updatedAt = new Date().toISOString(); } }); }, txs.length + ' 件のカテゴリを変更しました');
    });
  }
  function bulkAccount() {
    const ids = [...selected];
    const body = KB.ui.modal('<p>' + ids.length + ' 件の口座（振替は振替元）を変更します。</p>' +
      '<div class="field"><label for="b-acc">新しい口座</label><select id="b-acc">' + KB.ui.options(ST().accs(), null) + '</select></div>' +
      '<div class="btn-row end"><button class="btn btn-primary" data-ok>変更する</button></div>', { title: '口座をまとめて変更' });
    body.querySelector('[data-ok]').addEventListener('click', () => {
      const id = body.querySelector('#b-acc').value;
      KB.ui.closeModal();
      let skipped = 0;
      KB.ui.act('口座の一括変更', (s) => {
        s.transactions.forEach((t) => {
          if (!selected.has(t.id)) return;
          if (t.type === 'transfer' && t.toAccountId === id) { skipped++; return; } // 同じ口座同士の振替にはしない
          t.accountId = id; t.updatedAt = new Date().toISOString();
        });
      }, '口座を変更しました' + (skipped ? '（振替先と同じになる ' + skipped + ' 件は変更していません）' : ''));
    });
  }
  function bulkTag() {
    const ids = [...selected];
    const body = KB.ui.modal('<p>' + ids.length + ' 件にタグを追加、または削除します。</p>' +
      '<div class="field"><label for="b-tag">タグ</label><input id="b-tag" list="b-tags" placeholder="#旅行"><datalist id="b-tags">' + KB.calc.allTags().map((g) => '<option value="' + h(g) + '">').join('') + '</datalist></div>' +
      '<div class="btn-row end"><button class="btn" data-op="remove">このタグを外す</button><button class="btn btn-primary" data-op="add">追加する</button></div>', { title: 'タグをまとめて編集' });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      const tags = U.parseTags(body.querySelector('#b-tag').value);
      if (!tags.length) { body.querySelector('#b-tag').focus(); return; }
      KB.ui.closeModal();
      const add = b.dataset.op === 'add';
      KB.ui.act(add ? 'タグの一括追加' : 'タグの一括削除', (s) => {
        s.transactions.forEach((t) => {
          if (!selected.has(t.id)) return;
          if (add) tags.forEach((g) => { if (!t.tags.includes(g)) t.tags.push(g); });
          else t.tags = t.tags.filter((g) => !tags.includes(g));
        });
      }, add ? 'タグを追加しました' : 'タグを外しました');
    });
  }

  KB.views.list = { title: '明細', render, bind };
})();
