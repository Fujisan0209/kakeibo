/* 予算：カテゴリ別の月予算、使いすぎ警告、1日あたり、繰り越し */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store, C = () => KB.calc;
  let ym = null;

  function render(params) {
    if (params.ym && /^\d{4}-\d{2}$/.test(params.ym)) ym = params.ym;
    if (!ym) ym = U.thisMonth();
    const s = ST().state;
    const isCur = ym === U.thisMonth();
    const rows = C().budgetStatus(ym);
    const byId = {};
    rows.forEach((r) => { byId[r.cat.id] = r; });
    const da = isCur ? C().dailyAllowance() : null;
    let html = '<div class="page-head"><h1>予算</h1>' + monthNav() + '</div>';

    html += '<section class="card"><div class="toggle-row"><div><h2 class="card-title">余った予算を翌月に繰り越す</h2><p class="muted">ON にした月から計算します。超過（マイナス）は繰り越しません。</p></div>' +
      '<label class="switch"><input type="checkbox" id="carry"' + (s.settings.carryover ? ' checked' : '') + '><span class="switch-ui" aria-hidden="true"></span><span class="sr-only">繰り越し</span></label></div>' +
      (s.settings.carryover && s.settings.carryoverSince ? '<p class="hint">' + h(U.fmtMonth(s.settings.carryoverSince)) + 'から繰り越しています。</p>' : '') + '</section>';

    if (rows.length) {
      const tot = rows.reduce((a, r) => ({ available: a.available + r.available, spent: a.spent + r.spent, scheduled: a.scheduled + r.scheduled }), { available: 0, spent: 0, scheduled: 0 });
      const lvl = C().level(tot.spent, tot.available);
      html += '<section class="cards-3">' +
        '<div class="stat"><span class="stat-label">予算合計' + (s.settings.carryover ? '（繰越込み）' : '') + '</span><span class="stat-value">' + h(U.yen(tot.available)) + '</span></div>' +
        '<div class="stat"><span class="stat-label">使った額</span><span class="stat-value">' + h(U.yen(tot.spent)) + '</span>' + KB.ui.progress(tot.available ? tot.spent / tot.available : 0, lvl, '予算全体の使用率') + '</div>' +
        (isCur && da ? '<div class="stat stat-accent"><span class="stat-label">今月あと1日</span><span class="stat-value">' + h(U.yen(da.perDay)) + '</span><span class="muted small">残り ' + da.daysLeft + ' 日（予定・固定費 ' + h(U.yen(da.scheduled)) + ' を除く' + (da.over ? '。超過分は含めない' : '') + '）</span></div>'
          : '<div class="stat"><span class="stat-label">残り</span><span class="stat-value">' + KB.ui.net(tot.available - tot.spent) + '</span></div>') +
        '</section>';
    }

    html += '<section class="card"><div class="card-head"><h2 class="card-title">カテゴリ別</h2><span class="muted small">金額を変えると' + h(U.fmtMonth(ym)) + '以降に適用</span></div><ul class="budget-list">';
    ST().cats('expense').forEach((c) => {
      const r = byId[c.id];
      const spent = r ? r.spent : C().month(ym).byCat[c.id] || 0;
      html += '<li class="budget-row">' +
        '<div class="budget-name">' + KB.ui.catIcon(c) + '<span>' + h(c.name) + '</span></div>' +
        '<div class="budget-input"><label class="sr-only" for="b-' + h(c.id) + '">' + h(c.name) + 'の予算</label><span aria-hidden="true">¥</span><input id="b-' + h(c.id) + '" data-cat="' + h(c.id) + '" inputmode="numeric" placeholder="未設定" value="' + (r ? h(U.fmt(r.budget)) : '') + '"></div>' +
        '<div class="budget-bar">' + (r ? KB.ui.progress(r.rate, r.level, c.name + 'の使用率') : '') + '</div>' +
        '<div class="budget-nums num">' + h(U.yen(spent)) + (r ? ' / ' + h(U.yen(r.available)) : '') +
        (r && r.carry ? '<span class="muted small">（繰越 ' + h(U.yen(r.carry)) + '）</span>' : '') +
        (r && r.scheduled ? '<span class="muted small">予定 ' + h(U.yen(r.scheduled)) + '</span>' : '') +
        (r ? '<span class="small ' + (r.rest < 0 ? 'neg-text' : 'muted') + '">' + (r.rest < 0 ? '超過 ' + h(U.yen(-r.rest)) : '残り ' + h(U.yen(r.rest))) + '</span>' : '') + '</div>' +
        '</li>';
    });
    html += '</ul></section>';
    return html;
  }

  function monthNav() {
    return '<div class="month-nav"><button class="icon-btn" data-ym="' + U.addMonths(ym, -1) + '" aria-label="前の月">‹</button><strong>' + h(U.fmtMonth(ym)) + '</strong>' +
      '<button class="icon-btn" data-ym="' + U.addMonths(ym, 1) + '" aria-label="次の月">›</button>' + (ym !== U.thisMonth() ? '<button class="btn btn-small" data-ym="' + U.thisMonth() + '">今月</button>' : '') + '</div>';
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ym]');
      if (b) { ym = b.dataset.ym; KB.ui.refresh(); }
    });
    el.querySelector('#carry').addEventListener('change', (e) => {
      const on = e.target.checked;
      KB.ui.act(on ? '繰り越しを ON' : '繰り越しを OFF', (s) => {
        s.settings.carryover = on;
        s.settings.carryoverSince = on ? (s.settings.carryoverSince || U.thisMonth()) : null;
      }, on ? '繰り越しを ON にしました' : '繰り越しを OFF にしました');
    });
    el.querySelectorAll('[data-cat]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        const amt = v === '' ? null : U.parseYen(v);
        if (amt !== null && (!Number.isFinite(amt) || amt < 0)) { KB.ui.toast('予算は0円以上の整数で入れてください', { type: 'error' }); inp.focus(); return; }
        const c = ST().cat(inp.dataset.cat);
        KB.ui.act('予算の変更', (s) => { C().setBudget(s, inp.dataset.cat, ym, amt); }, c.name + 'の予算を' + (amt === null ? '解除' : U.yen(amt) + 'に') + 'しました');
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });
  }

  KB.views.budget = { title: '予算', render, bind };
})();
