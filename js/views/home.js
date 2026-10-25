/* ホーム：今月の状況、予算警告、1日あたり、資産、カード予測、テンプレート、最近の明細 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store, C = () => KB.calc;

  function banners() {
    const s = ST().state;
    let out = '';
    const r = s.settings.reminder;
    const st = C().streak();
    if (r.enabled && !st.todayDone) {
      const now = new Date();
      const hm = U.pad(now.getHours()) + ':' + U.pad(now.getMinutes());
      if (hm >= r.time) out += '<div class="banner banner-info" role="status">📝 今日の記録がまだです。<button class="btn btn-small btn-primary" data-act="add">記録する</button></div>';
    }
    const n = s.transactions.length;
    const last = s.settings.lastBackupAt;
    if (n >= 20 && (!last || U.dayDiff(last.slice(0, 10), U.today()) >= 30)) {
      out += '<div class="banner banner-warn" role="status">💾 ' + (last ? '最後のバックアップから30日以上たっています。' : 'まだバックアップがありません。') +
        'データはこのブラウザの中にしかありません。<a class="btn btn-small" href="#/settings?tab=data">バックアップ</a></div>';
    }
    if (KB.store.backend === 'idb') out += '<div class="banner banner-info">ℹ️ データ量が多いため、保存先を IndexedDB に切り替えています。</div>';
    return out;
  }

  function render() {
    const s = ST().state;
    const ym = U.thisMonth();
    const ms = C().monthSummary(ym);
    const today = U.today();
    // 今日までの実績と予定に分ける
    let incomeDone = 0, expenseDone = 0, planned = 0;
    C().month(ym).txs.forEach((t) => {
      if (t.type === 'transfer') return;
      if (t.date <= today) { if (t.type === 'income') incomeDone += t.amount; else expenseDone += t.amount; } else planned++;
    });
    const da = C().dailyAllowance();
    const bs = C().budgetStatus(ym).filter((r) => r.level !== 'ok').sort((a, b) => b.rate - a.rate);
    const assets = C().totalAssets();
    const prev = C().assetTrend(2)[0];
    const cards = ST().accs().filter((a) => a.kind === 'card' && a.card);
    const st = C().streak();
    const badgeCount = Object.keys(s.badges).length;
    const tpls = s.templates;
    const recent = s.transactions.filter((t) => t.date <= today).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 8);

    let html = '<div class="page-head"><h1>' + h(U.fmtMonth(ym)) + 'の家計</h1><button class="btn btn-primary only-pc" data-act="add">＋ 記録する</button></div>';
    html += banners();

    html += '<section class="cards-3" aria-label="今月の収支">' +
      '<div class="stat"><span class="stat-label">収入</span><span class="stat-value">' + KB.ui.net(incomeDone) + '</span></div>' +
      '<div class="stat"><span class="stat-label">支出</span><span class="stat-value"><span class="amt amt-expense">−' + h(U.yen(expenseDone)) + '</span></span></div>' +
      '<div class="stat"><span class="stat-label">収支</span><span class="stat-value">' + KB.ui.net(incomeDone - expenseDone) + '</span></div>' +
      '</section>';
    if (planned) html += '<p class="hint">このほか今月の予定が ' + planned + ' 件あります（予定を含む収支 ' + h(U.yenSigned(ms.net)) + '）。</p>';

    html += '<div class="grid-home">';
    // 1日あたり
    html += '<a class="card card-link" href="#/budget"><h2 class="card-title">今月あと1日</h2>';
    if (da) {
      html += '<p class="big-number' + (da.rest < 0 ? ' is-neg' : '') + '">' + h(U.yen(da.perDay)) + '<small> / 日</small></p>' +
        '<p class="muted">予算の残り ' + h(U.yen(da.rest)) + '・残り ' + da.daysLeft + ' 日' + (da.scheduled ? '（予定 ' + h(U.yen(da.scheduled)) + ' を差し引き済み）' : '') + '</p>' +
        (da.rest < 0 ? '<p class="level-badge level-over">⛔ 予算を ' + h(U.yen(-da.rest)) + ' 超えています</p>' : '');
    } else {
      html += '<p class="muted">予算を設定すると、1日に使える金額がわかります。</p><span class="btn btn-small">予算を設定</span>';
    }
    html += '</a>';
    // 予算警告
    html += '<a class="card card-link" href="#/budget"><h2 class="card-title">予算の状況</h2>';
    if (!C().budgetStatus(ym).length) html += '<p class="muted">予算はまだありません。</p>';
    else if (!bs.length) html += '<p class="ok-text">✅ すべてのカテゴリが予算の80%未満です</p>';
    else {
      html += '<ul class="mini-list">' + bs.slice(0, 4).map((r) => '<li>' + KB.ui.catIcon(r.cat) + '<span class="grow">' + h(r.cat.name) + '</span>' +
        '<span class="level-badge level-' + r.level + '">' + (r.level === 'over' ? '⛔ 超過 ' : '⚠️ ') + (Number.isFinite(r.rate) ? Math.round(r.rate * 100) + '%' : '') + '</span></li>').join('') + '</ul>';
    }
    html += '</a>';
    // 資産
    html += '<a class="card card-link" href="#/accounts"><h2 class="card-title">総資産</h2><p class="big-number' + (assets < 0 ? ' is-neg' : '') + '">' + h(U.yen(assets)) + '</p>' +
      (prev ? '<p class="muted">先月末から ' + KB.ui.net(assets - prev.total) + '</p>' : '');
    cards.forEach((a) => {
      const f = C().cardForecast(a).find((x) => x.amount > 0);
      if (f) html += '<p class="muted">💳 ' + h(a.name) + '：' + h(U.fmtDate(f.payDate)) + ' に ' + h(U.yen(f.amount)) + (f.closed ? '' : '（見込み）') + (f.shortage ? ' <span class="level-badge level-over">残高不足</span>' : '') + '</p>';
    });
    html += '</a>';
    // 連続記録
    html += '<a class="card card-link" href="#/badges"><h2 class="card-title">記録の習慣</h2><p class="big-number">🔥 ' + st.current + '<small> 日連続</small></p>' +
      '<p class="muted">' + (st.todayDone ? '今日は記録済み ✔' : '今日はまだ記録していません') + '・最長 ' + Math.max(st.best, st.current) + ' 日・バッジ ' + badgeCount + '/' + C().BADGES.length + '</p></a>';
    html += '</div>';

    // テンプレート
    html += '<section class="card"><div class="card-head"><h2 class="card-title">ワンタップ記録</h2><a class="link-small" href="#/settings?tab=templates">テンプレートを編集</a></div>';
    if (tpls.length) {
      html += '<p class="hint">押すと今日の日付ですぐ記録します。内容を直したいときは ✎ から。</p><div class="tpl-grid">' + tpls.map((t) => {
        const c = ST().cat(t.categoryId);
        return '<div class="tpl-item"><button class="tpl-btn" data-tpl="' + h(t.id) + '">' + (t.type === 'transfer' ? '<span class="cat-icon" style="--c:#8a8f98">⇄</span>' : KB.ui.catIcon(c)) +
          '<span class="tpl-name">' + h(t.name) + '</span><span class="tpl-amt">' + h(U.yen(t.amount)) + '</span></button>' +
          '<button class="icon-btn" data-tpledit="' + h(t.id) + '" aria-label="' + h(t.name) + 'を編集して記録">✎</button></div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="muted">よく使う記録をテンプレートにすると、ワンタップで入力できます。入力画面の「テンプレ保存」から作れます。</p>';
    }
    html += '</section>';

    html += '<section class="card"><div class="card-head"><h2 class="card-title">最近の明細</h2><a class="link-small" href="#/list">すべて見る</a></div>' +
      KB.ui.txList(recent, { empty: 'まだ記録がありません。「＋ 記録する」から始めましょう。' }) + '</section>';
    return html;
  }

  function quickAdd(id) {
    const t = ST().state.templates.find((x) => x.id === id);
    if (!t) return;
    if (!ST().acc(t.accountId) || (t.type !== 'transfer' && !ST().cat(t.categoryId))) {
      KB.views.input.open({ tplId: id });
      return;
    }
    KB.ui.act('テンプレートで記録', (s) => {
      const now = new Date().toISOString();
      s.transactions.push({ id: U.uid('t_'), type: t.type, date: U.today(), amount: t.amount, categoryId: t.type === 'transfer' ? null : t.categoryId, accountId: t.accountId, toAccountId: t.type === 'transfer' ? t.toAccountId : null, method: t.method || '', payee: t.payee || '', memo: t.memo || '', tags: (t.tags || []).slice(), receiptId: null, recurringId: null, installment: null, createdAt: now, updatedAt: now });
      ST().markEntryDay(s);
    }, '「' + t.name + '」' + U.yen(t.amount) + ' を記録しました');
  }

  // 明細一覧などで共通に使うクリック処理
  function bindCommon(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit],[data-act="add"],[data-tpl],[data-tpledit]');
      if (!b) return;
      if (b.dataset.edit) KB.views.input.open({ id: b.dataset.edit });
      else if (b.dataset.tpl) quickAdd(b.dataset.tpl);
      else if (b.dataset.tpledit) KB.views.input.open({ tplId: b.dataset.tpledit });
      else KB.views.input.open({});
    });
  }

  KB.views.home = { title: 'ホーム', render, bind: bindCommon, bindCommon, quickAdd };
})();
