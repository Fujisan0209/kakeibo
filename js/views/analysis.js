/* 分析：月別推移、カテゴリ内訳、前月比・前年同月比、カレンダー、ランキング、タグ、将来予測、年間レポート */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store, C = () => KB.calc;
  let tab = 'month';
  let ym = null;
  let year = null;
  let donutType = 'expense';
  let rankRange = 'month';

  function render(params) {
    if (params.tab) tab = params.tab;
    if (!ym) ym = U.thisMonth();
    if (!year) year = Number(U.today().slice(0, 4));
    let html = '<div class="page-head"><h1>分析</h1><div class="seg seg-small" role="tablist">' +
      [['month', '月ごと'], ['year', '年間レポート']].map(([k, l]) => '<button role="tab" aria-selected="' + (tab === k) + '" class="seg-btn' + (tab === k ? ' is-on' : '') + '" data-tab="' + k + '">' + l + '</button>').join('') + '</div></div>';
    html += tab === 'year' ? yearView() : monthView();
    return html;
  }

  function monthNav() {
    return '<div class="month-nav"><button class="icon-btn" data-ym="' + U.addMonths(ym, -1) + '" aria-label="前の月">‹</button><strong>' + h(U.fmtMonth(ym)) + '</strong>' +
      '<button class="icon-btn" data-ym="' + U.addMonths(ym, 1) + '" aria-label="次の月">›</button>' + (ym !== U.thisMonth() ? '<button class="btn btn-small" data-ym="' + U.thisMonth() + '">今月</button>' : '') + '</div>';
  }
  function pctDiff(cur, prev) {
    if (!prev) return cur ? '<span class="muted">—</span>' : '<span class="muted">±0</span>';
    const d = cur - prev;
    const p = Math.round((d / prev) * 100);
    // 支出が増えた＝悪い（▲）、減った＝良い（▼）。記号と文字で示す
    if (d === 0) return '<span class="muted">±0%</span>';
    return '<span class="' + (d > 0 ? 'neg-text' : 'pos-text') + '">' + (d > 0 ? '▲' : '▼') + ' ' + Math.abs(p) + '%<span class="sr-only">' + (d > 0 ? '増加' : '減少') + '</span></span>';
  }
  function legendRows(items, total) {
    return '<ul class="legend">' + items.map((it) => '<li><span class="swatch" style="--c:' + U.safeColor(it.color) + '"></span><span class="grow">' + h(it.icon ? it.icon + ' ' : '') + h(it.label) + '</span>' +
      '<span class="num">' + h(U.yen(it.value)) + '</span><span class="num muted pct">' + (total ? (Math.round((it.value / total) * 1000) / 10).toFixed(1) : '0.0') + '%</span></li>').join('') + '</ul>';
  }

  function monthView() {
    let html = '<div class="toolbar">' + monthNav() + '</div>';
    // 月別推移（12か月）
    const months = C().range(U.addMonths(ym, -11), ym);
    const data = months.map((m) => { const s = C().monthSummary(m); return { label: Number(m.slice(5)) + '月', income: s.income, expense: s.expense, ym: m }; });
    html += '<section class="card"><h2 class="card-title">月別の収支推移</h2><div class="legend-inline"><span><i class="lg lg-income"></i>収入</span><span><i class="lg lg-expense"></i>支出</span><span><i class="lg lg-net"></i>収支（折れ線）</span></div>' +
      KB.charts.barLine(data, { active: 11 }) +
      '<details><summary>数値で見る</summary><div class="table-wrap"><table class="table"><thead><tr><th scope="col">月</th><th scope="col" class="num">収入</th><th scope="col" class="num">支出</th><th scope="col" class="num">収支</th></tr></thead><tbody>' +
      data.map((d) => '<tr><td>' + h(U.fmtMonth(d.ym)) + '</td><td class="num">' + h(U.yen(d.income)) + '</td><td class="num">' + h(U.yen(d.expense)) + '</td><td class="num">' + KB.ui.net(d.income - d.expense) + '</td></tr>').join('') +
      '</tbody></table></div></details></section>';

    // カテゴリ内訳（ドーナツ）
    const ms = C().monthSummary(ym);
    const items = Object.entries(ms.byCat)
      .map(([id, v]) => { const c = ST().cat(id); return { id, label: c ? c.name : '未分類', icon: c ? c.icon : '', color: c ? c.color : '#8a8f98', value: v, type: c ? c.type : 'expense' }; })
      .filter((x) => x.type === donutType)
      .sort((a, b) => b.value - a.value);
    const tot = items.reduce((x, i) => x + i.value, 0);
    html += '<div class="grid-2 grid-gap">';
    html += '<section class="card"><div class="card-head"><h2 class="card-title">カテゴリ別の内訳</h2><div class="seg seg-small">' +
      [['expense', '支出'], ['income', '収入']].map(([k, l]) => '<button class="seg-btn' + (donutType === k ? ' is-on' : '') + '" aria-pressed="' + (donutType === k) + '" data-donut="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      (items.length ? '<div class="donut-wrap">' + KB.charts.donut(items, { centerLabel: donutType === 'expense' ? '支出合計' : '収入合計', label: 'カテゴリ別の' + (donutType === 'expense' ? '支出' : '収入') }) + legendRows(items, tot) + '</div>' : '<p class="empty">この月の記録はありません</p>') + '</section>';

    // 前月比・前年同月比
    const cp = C().compare(ym);
    html += '<section class="card"><h2 class="card-title">前月比・前年同月比（支出）</h2><div class="table-wrap"><table class="table"><thead><tr><th scope="col">項目</th><th scope="col" class="num">今月</th><th scope="col" class="num">前月比</th><th scope="col" class="num">前年同月比</th></tr></thead><tbody>' +
      '<tr class="row-strong"><th scope="row">支出合計</th><td class="num">' + h(U.yen(cp.cur.expense)) + '</td><td class="num">' + pctDiff(cp.cur.expense, cp.prev.expense) + '<br><small class="muted">' + h(U.yen(cp.prev.expense)) + '</small></td><td class="num">' + pctDiff(cp.cur.expense, cp.yoy.expense) + '<br><small class="muted">' + h(U.yen(cp.yoy.expense)) + '</small></td></tr>' +
      '<tr><th scope="row">収入合計</th><td class="num">' + h(U.yen(cp.cur.income)) + '</td><td class="num muted">' + h(U.yen(cp.prev.income)) + '</td><td class="num muted">' + h(U.yen(cp.yoy.income)) + '</td></tr>' +
      cp.rows.slice(0, 12).map((r) => '<tr><th scope="row">' + (r.cat ? h(r.cat.icon + ' ' + r.cat.name) : '未分類') + '</th><td class="num">' + h(U.yen(r.cur)) + '</td><td class="num">' + pctDiff(r.cur, r.prev) + '</td><td class="num">' + pctDiff(r.cur, r.yoy) + '</td></tr>').join('') +
      '</tbody></table></div><p class="hint">▲＝支出が増えた　▼＝支出が減った</p></section>';
    html += '</div>';

    // カレンダー（ヒートマップ）
    html += '<section class="card"><h2 class="card-title">カレンダー（日ごとの支出）</h2>' + calendar() + '</section>';

    // ランキング
    const range = rankRange === 'month' ? [ym, ym] : rankRange === '3m' ? [U.addMonths(ym, -2), ym] : [ym.slice(0, 4) + '-01', ym.slice(0, 4) + '-12'];
    const rc = C().ranking(range[0], range[1], 'category', 10);
    const rp = C().ranking(range[0], range[1], 'payee', 10);
    html += '<section class="card"><div class="card-head"><h2 class="card-title">支出ランキング</h2><div class="seg seg-small">' +
      [['month', 'この月'], ['3m', '直近3か月'], ['year', 'この年']].map(([k, l]) => '<button class="seg-btn' + (rankRange === k ? ' is-on' : '') + '" aria-pressed="' + (rankRange === k) + '" data-rank="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="grid-2 grid-gap"><div><h3 class="sub-title">カテゴリ別</h3>' + rankList(rc, (r) => { const c = ST().cat(r.key); return c ? c.icon + ' ' + c.name : '未分類'; }, (r) => '#/list?categoryId=' + encodeURIComponent(r.key) + '&from=' + range[0] + '-01&to=' + endOf(range[1])) + '</div>' +
      '<div><h3 class="sub-title">お店・メモ別</h3>' + rankList(rp, (r) => r.key, (r) => '#/list?keyword=' + encodeURIComponent(r.key === '（未入力）' ? '' : r.key) + '&type=expense&from=' + range[0] + '-01&to=' + endOf(range[1])) + '</div></div>';
    const tg = C().tagSummary(range[0], range[1]);
    if (tg.length) {
      html += '<h3 class="sub-title">タグ別（カテゴリをまたいで集計）</h3><div class="chip-row">' + tg.slice(0, 20).map((t) => '<a class="chip" href="#/list?tag=' + encodeURIComponent(t.tag) + '">#' + h(t.tag) + ' <strong class="num">' + h(U.yen(t.amount)) + '</strong></a>').join('') + '</div>';
    }
    html += '</section>';

    // 将来予測
    const fc = C().forecast(4);
    html += '<section class="card"><h2 class="card-title">月末残高の予測</h2><p class="muted small">今日の総資産に、登録済みの予定（分割払いなど）と定期の収支を足し、ふだんの支出（直近90日の定期・分割以外の平均 ' + h(U.yen(fc.perDay)) + '/日）を差し引いた目安です。</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">月末</th><th scope="col" class="num">予定・定期</th><th scope="col" class="num">ふだんの支出</th><th scope="col" class="num">予測残高</th></tr></thead><tbody>' +
      fc.months.map((m) => '<tr><td>' + h(U.fmtMonth(m.ym)) + '</td><td class="num">' + KB.ui.net(m.scheduled) + '</td><td class="num">−' + h(U.yen(m.variable)) + '</td><td class="num"><strong' + (m.total < 0 ? ' class="neg-text"' : '') + '>' + h(U.yen(m.total)) + '</strong></td></tr>').join('') +
      '</tbody></table></div>' + (fc.perDay === 0 && ST().state.transactions.length ? '<p class="hint">記録が7日分たまると、ふだんの支出も予測に入ります。</p>' : '') + '</section>';
    return html;
  }
  function endOf(m) { const { y, m: mm } = U.parseYM(m); return m + '-' + U.pad(U.daysInMonth(y, mm)); }

  function rankList(rows, label, href) {
    if (!rows.length) return '<p class="empty">記録がありません</p>';
    const max = rows[0].amount || 1;
    return '<ol class="rank">' + rows.map((r, i) => '<li><a href="' + h(href(r)) + '"><span class="rank-no">' + (i + 1) + '</span><span class="grow"><span class="rank-label">' + h(label(r)) + ' <small class="muted">' + r.count + '件</small></span>' +
      '<span class="rank-bar"><span style="width:' + Math.max(2, Math.round((r.amount / max) * 100)) + '%"></span></span></span><span class="num">' + h(U.yen(r.amount)) + '</span></a></li>').join('') + '</ol>';
  }

  function calendar() {
    const days = C().calendar(ym);
    const { y, m } = U.parseYM(ym);
    const dim = U.daysInMonth(y, m);
    const first = U.weekday(ym + '-01');
    const vals = Object.values(days).filter((v) => v > 0).sort((a, b) => a - b);
    // 4 段階：支出のある日の分位で区切る（外れ値に引っ張られにくい）
    const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
    const th = [q(0.25), q(0.5), q(0.75)];
    const lvl = (v) => (!v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4);
    const today = U.today();
    let html = '<div class="cal" role="grid" aria-label="' + h(U.fmtMonth(ym)) + 'の日ごとの支出"><div class="cal-row cal-head" role="row">' + U.WD.map((w, i) => '<span role="columnheader" class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</span>').join('') + '</div><div class="cal-row" role="row">';
    for (let i = 0; i < first; i++) html += '<span class="cal-cell is-blank" role="gridcell"></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = ym + '-' + U.pad(d);
      const v = days[ds] || 0;
      if ((first + d - 1) % 7 === 0 && d !== 1) html += '</div><div class="cal-row" role="row">';
      html += '<a role="gridcell" class="cal-cell heat-' + lvl(v) + (ds === today ? ' is-today' : '') + '" href="#/list?from=' + ds + '&to=' + ds + '" aria-label="' + h(U.fmtDate(ds) + ' 支出 ' + U.yen(v)) + '"><span class="cal-d">' + d + '</span><span class="cal-v">' + (v ? h(KB.charts.short(v)) : '') + '</span></a>';
    }
    html += '</div></div>';
    const total = Object.values(days).reduce((a, b) => a + b, 0);
    const n = Object.keys(days).length;
    html += '<div class="heat-legend" aria-hidden="true"><span>少</span>' + [0, 1, 2, 3, 4].map((i) => '<i class="heat-' + i + '"></i>').join('') + '<span>多</span></div>' +
      '<p class="muted small">支出のあった日 ' + n + ' 日・1日平均 ' + h(U.yen(n ? Math.round(total / dim) : 0)) + '（' + dim + '日で割った額）</p>';
    return html;
  }

  function yearView() {
    const r = C().yearReport(year);
    let html = '<div class="toolbar"><div class="month-nav"><button class="icon-btn" data-year="' + (year - 1) + '" aria-label="前の年">‹</button><strong>' + year + '年</strong><button class="icon-btn" data-year="' + (year + 1) + '" aria-label="次の年">›</button></div>' +
      '<button class="btn btn-small" data-x="print">印刷</button></div>';
    html += '<section class="cards-3"><div class="stat"><span class="stat-label">年間の収入</span><span class="stat-value">' + KB.ui.net(r.income) + '</span></div>' +
      '<div class="stat"><span class="stat-label">年間の支出</span><span class="stat-value"><span class="amt amt-expense">−' + h(U.yen(r.expense)) + '</span></span></div>' +
      '<div class="stat"><span class="stat-label">収支・貯蓄率</span><span class="stat-value">' + KB.ui.net(r.net) + '</span><span class="muted small">' + (r.rate === null ? '収入なし' : '貯蓄率 ' + Math.round(r.rate * 100) + '%') + '</span></div></section>';
    const data = r.months.map((m) => ({ label: Number(m.ym.slice(5)) + '月', income: m.income, expense: m.expense }));
    html += '<section class="card"><h2 class="card-title">月ごとの収支</h2><div class="legend-inline"><span><i class="lg lg-income"></i>収入</span><span><i class="lg lg-expense"></i>支出</span><span><i class="lg lg-net"></i>収支</span></div>' + KB.charts.barLine(data, { label: year + '年の月別収支' }) +
      '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">月</th><th scope="col" class="num">収入</th><th scope="col" class="num">支出</th><th scope="col" class="num">収支</th></tr></thead><tbody>' +
      r.months.map((m) => '<tr><td>' + Number(m.ym.slice(5)) + '月</td><td class="num">' + h(U.yen(m.income)) + '</td><td class="num">' + h(U.yen(m.expense)) + '</td><td class="num">' + KB.ui.net(m.net) + '</td></tr>').join('') +
      '<tr class="row-strong"><th scope="row">合計</th><td class="num">' + h(U.yen(r.income)) + '</td><td class="num">' + h(U.yen(r.expense)) + '</td><td class="num">' + KB.ui.net(r.net) + '</td></tr>' +
      '</tbody></table></div></section>';
    const withData = r.months.filter((m) => m.count);
    if (withData.length) {
      const maxE = withData.reduce((a, b) => (b.expense > a.expense ? b : a));
      const minE = withData.reduce((a, b) => (b.expense < a.expense ? b : a));
      html += '<section class="card"><h2 class="card-title">ひとこと</h2><ul class="bullets"><li>支出がいちばん多かったのは <strong>' + Number(maxE.ym.slice(5)) + '月</strong>（' + h(U.yen(maxE.expense)) + '）</li>' +
        '<li>いちばん少なかったのは <strong>' + Number(minE.ym.slice(5)) + '月</strong>（' + h(U.yen(minE.expense)) + '）</li>' +
        '<li>記録のある月の平均支出は ' + h(U.yen(Math.round(r.expense / withData.length))) + '/月</li></ul></section>';
    }
    const items = Object.entries(r.byCat).map(([id, v]) => { const c = ST().cat(id); return { label: c ? c.name : '未分類', icon: c ? c.icon : '', color: c ? c.color : '#8a8f98', value: v, type: c ? c.type : 'expense' }; })
      .filter((x) => x.type === 'expense').sort((a, b) => b.value - a.value);
    const tot = items.reduce((x, i) => x + i.value, 0);
    html += '<section class="card"><h2 class="card-title">カテゴリ別の年間支出</h2>' + (items.length ? '<div class="donut-wrap">' + KB.charts.donut(items, { centerLabel: '年間支出', label: year + '年のカテゴリ別支出' }) + legendRows(items, tot) + '</div>' : '<p class="empty">記録がありません</p>') + '</section>';
    return html;
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; KB.ui.refresh(); }
      else if (b.dataset.ym) { ym = b.dataset.ym; KB.ui.refresh(); }
      else if (b.dataset.year) { year = Number(b.dataset.year); KB.ui.refresh(); }
      else if (b.dataset.donut) { donutType = b.dataset.donut; KB.ui.refresh(); }
      else if (b.dataset.rank) { rankRange = b.dataset.rank; KB.ui.refresh(); }
      else if (b.dataset.x === 'print') window.print();
    });
    // グラフの棒をクリックするとその月へ
    el.querySelectorAll('.bar-group').forEach((g) => {
      g.addEventListener('click', () => {
        if (tab !== 'month') return;
        ym = U.addMonths(ym, Number(g.dataset.i) - 11);
        KB.ui.refresh();
      });
    });
  }

  KB.views.analysis = { title: '分析', render, bind };
})();
