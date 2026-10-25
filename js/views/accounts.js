/* 口座・資産：口座ごとの残高、クレカの引き落とし予測、資産推移、貯金目標 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store, C = () => KB.calc;
  const KIND_ICON = { cash: '👛', bank: '🏦', card: '💳', emoney: '📲' };

  function render() {
    const s = ST().state;
    const bal = C().balances();
    const accs = ST().accs();
    const total = C().totalAssets();
    let html = '<div class="page-head"><h1>口座・資産</h1><button class="btn btn-primary" data-x="add-acc">＋ 口座を追加</button></div>';
    html += '<section class="cards-3"><div class="stat"><span class="stat-label">総資産（今日時点）</span><span class="stat-value">' + h(U.yen(total)) + '</span></div>';
    const debt = accs.filter((a) => a.kind === 'card').reduce((x, a) => x + Math.min(0, bal[a.id] || 0), 0);
    html += '<div class="stat"><span class="stat-label">カードの未払い</span><span class="stat-value">' + h(U.yen(-debt)) + '</span></div>';
    html += '<div class="stat"><span class="stat-label">口座の数</span><span class="stat-value">' + accs.length + '</span></div></section>';

    // 口座一覧
    html += '<section class="card"><h2 class="card-title">口座ごとの残高</h2><ul class="acc-list">';
    accs.forEach((a) => {
      const b = bal[a.id] || 0;
      html += '<li class="acc-row"><span class="acc-icon" aria-hidden="true">' + KIND_ICON[a.kind] + '</span><span class="grow"><strong>' + h(a.name) + '</strong><span class="muted small">' + h(ST().ACCOUNT_KINDS[a.kind]) + '</span></span>' +
        '<span class="num' + (b < 0 ? ' neg-text' : '') + '">' + h(U.yen(b)) + '</span>' +
        '<a class="btn btn-small" href="#/list?accountId=' + encodeURIComponent(a.id) + '">明細</a><button class="btn btn-small" data-edit-acc="' + h(a.id) + '">編集</button></li>';
    });
    html += '</ul><div class="btn-row"><button class="btn" data-x="transfer">⇄ 口座間の振替を記録</button></div>' +
      '<p class="hint">振替（ATM引き出し、チャージ、カードの引き落としなど）は、収入・支出の集計には含めません。</p></section>';

    // クレジットカード
    const cards = accs.filter((a) => a.kind === 'card');
    if (cards.length) {
      html += '<section class="card"><h2 class="card-title">クレジットカードの引き落とし予測</h2>';
      cards.forEach((a) => {
        const c = a.card || {};
        html += '<h3 class="sub-title">💳 ' + h(a.name) + ' <small class="muted">締め日 ' + (c.closingDay >= 31 ? '月末' : c.closingDay + '日') + '・支払日 ' + (c.payMonthOffset === 2 ? '翌々月' : '翌月') + (c.payDay >= 31 ? '末日' : c.payDay + '日') + '</small></h3>';
        const fc = C().cardForecast(a);
        if (!fc.length) html += '<p class="muted">予定はありません。</p>';
        else {
          html += '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">支払日</th><th scope="col">利用期間</th><th scope="col" class="num">金額</th><th scope="col">状態</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>';
          fc.forEach((f) => {
            html += '<tr><td>' + h(U.fmtDate(f.payDate)) + '</td><td class="small">' + h(f.start.slice(5).replace('-', '/')) + '〜' + h(f.end.slice(5).replace('-', '/')) + '</td>' +
              '<td class="num">' + h(U.yen(f.amount)) + '</td><td>' + (f.closed ? '確定' : '利用中（見込み）') +
              (f.shortage ? '<br><span class="level-badge level-over">⛔ ' + h(f.payAccount.name) + 'の残高不足見込み（' + h(U.yen(f.payAccountBalance)) + '）</span>' : '') + '</td>' +
              '<td>' + (f.amount > 0 ? '<button class="btn btn-small" data-pay="' + h(a.id) + '" data-amount="' + f.amount + '" data-date="' + h(f.payDate) + '">引き落としを記録</button>' : '') + '</td></tr>';
          });
          html += '</tbody></table></div>';
        }
        if (!c.payAccountId || !ST().acc(c.payAccountId)) html += '<p class="hint">引き落とし口座を設定すると、残高不足を予測できます（「編集」から）。</p>';
      });
      html += '<p class="hint">土日の場合は翌月曜日として計算しています（祝日は考慮していません）。</p></section>';
    }

    // 資産推移
    const trend = C().assetTrend(12);
    const fc = C().forecast(4);
    const pts = trend.map((t) => ({ label: Number(t.ym.slice(5)) + '月', value: t.total }));
    // 今月は予測の月末値を点線で、その先3か月も点線
    fc.months.forEach((m, i) => { if (i > 0) pts.push({ label: Number(m.ym.slice(5)) + '月', value: m.total, dashed: true }); });
    html += '<section class="card"><h2 class="card-title">資産推移</h2><p class="muted small">実線：各月末の総資産（今月は今日時点）　点線：予測</p>' + KB.charts.line(pts, { label: '総資産の推移' }) +
      '<details><summary>数値で見る</summary><div class="table-wrap"><table class="table"><thead><tr><th scope="col">月</th><th scope="col" class="num">総資産</th></tr></thead><tbody>' +
      trend.map((t) => '<tr><td>' + h(U.fmtMonth(t.ym)) + '</td><td class="num">' + h(U.yen(t.total)) + '</td></tr>').join('') +
      fc.months.slice(1).map((m) => '<tr><td>' + h(U.fmtMonth(m.ym)) + '（予測）</td><td class="num">' + h(U.yen(m.total)) + '</td></tr>').join('') +
      '</tbody></table></div></details></section>';

    // 貯金目標
    html += '<section class="card"><div class="card-head"><h2 class="card-title">貯金目標</h2><button class="btn btn-small" data-x="add-goal">＋ 目標を追加</button></div>';
    if (!s.goals.length) html += '<p class="muted">目標金額と、貯める口座を決めると達成率がわかります。</p>';
    s.goals.forEach((g) => {
      const p = C().goalProgress(g);
      const done = p.saved >= g.target;
      html += '<div class="goal"><div class="goal-head"><strong>' + (done ? '🏆 ' : '🎯 ') + h(g.name) + '</strong><span class="num">' + h(U.yen(p.saved)) + ' / ' + h(U.yen(g.target)) + '（' + Math.floor(p.rate * 100) + '%）</span>' +
        '<button class="btn btn-small" data-edit-goal="' + h(g.id) + '">編集</button></div>' + KB.ui.progress(Math.min(1, p.rate), done ? 'ok' : 'ok', g.name + 'の達成率') +
        '<p class="muted small">対象：' + (g.accountIds || []).map((id) => (ST().acc(id) || { name: '（削除済み）' }).name).map(h).join('、') +
        (g.deadline ? '・期限 ' + h(U.fmtDate(g.deadline, true)) : '') + (p.perMonth ? '・あと月 ' + h(U.yen(p.perMonth)) + ' ずつ' : '') + (done ? '・達成しました！' : '') + '</p></div>';
    });
    html += '</section>';
    return html;
  }

  function accountForm(id) {
    const a = id ? ST().acc(id) : { name: '', kind: 'bank', initialBalance: 0, card: { closingDay: 15, payDay: 10, payMonthOffset: 1, payAccountId: null } };
    const c = a.card || { closingDay: 15, payDay: 10, payMonthOffset: 1, payAccountId: null };
    const used = id ? ST().state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length : 0;
    const dayOpts = (sel) => Array.from({ length: 31 }, (_, i) => i + 1).map((d) => '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + (d === 31 ? '月末' : d + '日') + '</option>').join('');
    const body = KB.ui.modal(
      '<form id="accf" novalidate><div class="field"><label for="a-name">口座の名前</label><input id="a-name" maxlength="20" required value="' + h(a.name) + '"></div>' +
      '<div class="grid-2"><div class="field"><label for="a-kind">種類</label><select id="a-kind">' + Object.entries(ST().ACCOUNT_KINDS).map(([k, v]) => '<option value="' + k + '"' + (a.kind === k ? ' selected' : '') + '>' + KIND_ICON[k] + ' ' + v + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="a-init">記録を始める前の残高（円）</label><input id="a-init" inputmode="numeric" value="' + h(U.fmt(a.initialBalance)) + '"><small class="muted">カードの未払い残高はマイナスで入力</small></div></div>' +
      '<fieldset class="field card-fields"' + (a.kind === 'card' ? '' : ' hidden') + '><legend>カードの設定</legend><div class="grid-2">' +
      '<div class="field"><label for="a-close">締め日</label><select id="a-close">' + dayOpts(c.closingDay) + '</select></div>' +
      '<div class="field"><label for="a-payoff">支払月</label><select id="a-payoff"><option value="1"' + (c.payMonthOffset !== 2 ? ' selected' : '') + '>翌月</option><option value="2"' + (c.payMonthOffset === 2 ? ' selected' : '') + '>翌々月</option></select></div>' +
      '<div class="field"><label for="a-pay">支払日</label><select id="a-pay">' + dayOpts(c.payDay) + '</select></div>' +
      '<div class="field"><label for="a-payacc">引き落とし口座</label><select id="a-payacc">' + KB.ui.options(ST().accs().filter((x) => x.id !== id && x.kind !== 'card'), c.payAccountId, { empty: '（未設定）' }) + '</select></div></div></fieldset>' +
      '<p class="form-error" role="alert" id="a-err"></p><div class="btn-row">' +
      (id ? (used ? '<button type="button" class="btn btn-danger-ghost" data-archive>' + (a.archived ? '再表示する' : '非表示にする') + '</button>' : '<button type="button" class="btn btn-danger-ghost" data-del>削除</button>') : '') +
      '<span class="spacer"></span><button class="btn btn-primary">保存</button></div>' +
      (id && used ? '<p class="hint">この口座には ' + used + ' 件の明細があるため削除できません。非表示にすると入力の選択肢から外れます（残高と履歴は残ります）。</p>' : '') + '</form>',
      { title: id ? '口座を編集' : '口座を追加' });
    const f = body.querySelector('#accf');
    f.querySelector('#a-kind').addEventListener('change', (e) => { f.querySelector('.card-fields').hidden = e.target.value !== 'card'; });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.querySelector('#a-name').value.trim();
      const init = U.parseYen(f.querySelector('#a-init').value || '0');
      const err = f.querySelector('#a-err');
      if (!name) { err.textContent = '名前を入れてください'; return; }
      if (ST().state.accounts.some((x) => x.name === name && x.id !== id)) { err.textContent = '同じ名前の口座があります'; return; }
      if (!Number.isFinite(init)) { err.textContent = '残高は整数で入れてください'; return; }
      const kind = f.querySelector('#a-kind').value;
      const card = kind === 'card' ? { closingDay: +f.querySelector('#a-close').value, payDay: +f.querySelector('#a-pay').value, payMonthOffset: +f.querySelector('#a-payoff').value, payAccountId: f.querySelector('#a-payacc').value || null } : undefined;
      KB.ui.closeModal();
      KB.ui.act(id ? '口座の編集' : '口座の追加', (s) => {
        if (id) {
          const x = s.accounts.find((y) => y.id === id);
          Object.assign(x, { name, kind, initialBalance: init });
          if (card) x.card = card; else delete x.card;
        } else {
          s.accounts.push(Object.assign({ id: U.uid('a_'), name, kind, initialBalance: init, order: s.accounts.length, archived: false }, card ? { card } : {}));
        }
      }, id ? '口座を更新しました' : '口座「' + name + '」を追加しました');
    });
    f.addEventListener('click', (e) => {
      if (e.target.closest('[data-archive]')) {
        KB.ui.closeModal();
        KB.ui.act('口座の表示切り替え', (s) => { const x = s.accounts.find((y) => y.id === id); x.archived = !x.archived; });
      }
      if (e.target.closest('[data-del]')) {
        KB.ui.closeModal();
        KB.ui.act('口座の削除', (s) => {
          s.accounts = s.accounts.filter((y) => y.id !== id);
          // 参照している設定を外す
          s.templates.forEach((t) => { if (t.accountId === id) t.accountId = null; if (t.toAccountId === id) t.toAccountId = null; });
          s.recurring.forEach((r) => { if (r.accountId === id || r.toAccountId === id) r.active = false; });
          s.accounts.forEach((y) => { if (y.card && y.card.payAccountId === id) y.card.payAccountId = null; });
          s.goals.forEach((g) => { g.accountIds = (g.accountIds || []).filter((x) => x !== id); });
        }, '口座を削除しました');
      }
    });
  }

  function goalForm(id) {
    const g = id ? ST().state.goals.find((x) => x.id === id) : { name: '', target: '', accountIds: [], deadline: '' };
    const body = KB.ui.modal('<form id="gf" novalidate><div class="field"><label for="g-name">目標の名前</label><input id="g-name" maxlength="30" value="' + h(g.name) + '" placeholder="例：旅行資金"></div>' +
      '<div class="grid-2"><div class="field"><label for="g-target">目標金額（円）</label><input id="g-target" inputmode="numeric" value="' + h(g.target === '' ? '' : U.fmt(g.target)) + '"></div>' +
      '<div class="field"><label for="g-dl">期限（任意）</label><input id="g-dl" type="date" value="' + h(g.deadline || '') + '"></div></div>' +
      '<fieldset class="field"><legend>貯める口座（残高の合計で達成率を計算）</legend><div class="check-list">' +
      ST().accs().filter((a) => a.kind !== 'card').map((a) => '<label><input type="checkbox" value="' + h(a.id) + '"' + ((g.accountIds || []).includes(a.id) ? ' checked' : '') + '> ' + h(a.name) + '</label>').join('') + '</div></fieldset>' +
      '<p class="form-error" role="alert" id="g-err"></p><div class="btn-row">' + (id ? '<button type="button" class="btn btn-danger-ghost" data-del>削除</button>' : '') + '<span class="spacer"></span><button class="btn btn-primary">保存</button></div></form>', { title: id ? '目標を編集' : '貯金目標を追加' });
    const f = body.querySelector('#gf');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.querySelector('#g-name').value.trim();
      const target = U.parseYen(f.querySelector('#g-target').value);
      const ids = [...f.querySelectorAll('.check-list input:checked')].map((x) => x.value);
      const deadline = f.querySelector('#g-dl').value || null;
      const err = f.querySelector('#g-err');
      if (!name) { err.textContent = '名前を入れてください'; return; }
      if (!Number.isFinite(target) || target <= 0) { err.textContent = '目標金額を1円以上で入れてください'; return; }
      if (!ids.length) { err.textContent = '口座を1つ以上選んでください'; return; }
      KB.ui.closeModal();
      KB.ui.act(id ? '目標の編集' : '目標の追加', (s) => {
        if (id) Object.assign(s.goals.find((x) => x.id === id), { name, target, accountIds: ids, deadline });
        else s.goals.push({ id: U.uid('g_'), name, target, accountIds: ids, deadline });
      });
    });
    f.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) { KB.ui.closeModal(); KB.ui.act('目標の削除', (s) => { s.goals = s.goals.filter((x) => x.id !== id); }); }
    });
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.x === 'add-acc') accountForm(null);
      else if (b.dataset.editAcc) accountForm(b.dataset.editAcc);
      else if (b.dataset.x === 'add-goal') goalForm(null);
      else if (b.dataset.editGoal) goalForm(b.dataset.editGoal);
      else if (b.dataset.x === 'transfer') KB.views.input.open({ type: 'transfer' });
      else if (b.dataset.pay) {
        const a = ST().acc(b.dataset.pay);
        const date = b.dataset.date;
        KB.views.input.open({ type: 'transfer', prefill: { accountId: a.card.payAccountId || (ST().accs().find((x) => x.kind === 'bank') || {}).id, toAccountId: a.id, amount: Number(b.dataset.amount), date, memo: a.name + ' 引き落とし' } });
      }
    });
  }

  KB.views.accounts = { title: '口座・資産', render, bind };
})();
