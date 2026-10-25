/* 定期・分割：固定費や定期収入の自動登録、分割払いの管理 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store, C = () => KB.calc;
  const TL = { expense: '支出', income: '収入', transfer: '振替' };

  function dayLabel(d) { return d >= 31 ? '毎月末日' : '毎月' + d + '日'; }

  function render() {
    const s = ST().state;
    const today = U.today();
    let html = '<div class="page-head"><h1>定期・分割</h1><button class="btn btn-primary" data-x="add">＋ 定期を追加</button></div>';
    html += '<section class="card"><h2 class="card-title">定期の収支（毎月自動で登録）</h2><p class="hint">家賃・サブスク・給与など。指定日になると（アプリを開いたときに）自動で明細に登録されます。月の日数より大きい日は月末になります。</p>';
    if (!s.recurring.length) html += '<p class="empty">まだありません</p>';
    else {
      let mE = 0, mI = 0;
      s.recurring.filter((r) => r.active).forEach((r) => { if (r.type === 'expense') mE += r.amount; if (r.type === 'income') mI += r.amount; });
      html += '<p class="muted">毎月の固定費 ' + h(U.yen(mE)) + '・定期収入 ' + h(U.yen(mI)) + '</p><ul class="plan-list">';
      s.recurring.forEach((r) => {
        const c = ST().cat(r.categoryId);
        const next = C().occurrences(r, r.lastDate ? U.addDays(r.lastDate, 1) : r.startMonth + '-01', U.addDays(today, 400))[0];
        html += '<li class="plan-row' + (r.active ? '' : ' is-off') + '">' + (r.type === 'transfer' ? '<span class="cat-icon" style="--c:#8a8f98">⇄</span>' : KB.ui.catIcon(c)) +
          '<span class="grow"><strong>' + h(r.name) + '</strong> ' + (r.active ? '' : '<span class="flag">停止中</span>') +
          '<span class="muted small">' + TL[r.type] + '・' + dayLabel(r.day) + '・' + h((ST().acc(r.accountId) || { name: '口座なし' }).name) + (r.type === 'transfer' ? ' → ' + h((ST().acc(r.toAccountId) || { name: '口座なし' }).name) : '') +
          (next && r.active ? '・次回 ' + h(U.fmtDate(next, next.slice(0, 4) !== today.slice(0, 4))) : '') + (r.endMonth ? '・' + h(U.fmtMonth(r.endMonth)) + 'まで' : '') + '</span></span>' +
          KB.ui.money({ type: r.type, amount: r.amount }) + '<button class="btn btn-small" data-edit="' + h(r.id) + '">編集</button></li>';
      });
      html += '</ul>';
    }
    html += '</section>';

    html += '<section class="card"><div class="card-head"><h2 class="card-title">分割払い</h2><button class="btn btn-small" data-x="add-inst">＋ 分割払いを登録</button></div><p class="hint">総額と回数から毎月の支払いに振り分け、全回分を「予定」として登録します（端数は1回目に加算）。</p>';
    if (!s.installments.length) html += '<p class="empty">まだありません</p>';
    else {
      html += '<ul class="plan-list">';
      s.installments.forEach((p) => {
        const txs = s.transactions.filter((t) => t.installment && t.installment.planId === p.id);
        const paid = txs.filter((t) => t.date <= today);
        const rest = txs.filter((t) => t.date > today).reduce((x, t) => x + t.amount, 0);
        html += '<li class="plan-row">' + KB.ui.catIcon(ST().cat(p.categoryId)) + '<span class="grow"><strong>' + h(p.name) + '</strong>' +
          '<span class="muted small">総額 ' + h(U.yen(p.total)) + '・' + p.count + '回・' + h(U.fmtMonth(p.startMonth)) + 'から・' + h((ST().acc(p.accountId) || { name: '' }).name) + '</span>' +
          KB.ui.progress(txs.length ? paid.length / txs.length : 0, 'ok', p.name + 'の支払い状況') +
          '<span class="small">支払い済み ' + paid.length + '/' + txs.length + '回・残り ' + h(U.yen(rest)) + '</span></span>' +
          '<a class="btn btn-small" href="#/list?keyword=' + encodeURIComponent(p.memo || p.name) + '">明細</a><button class="btn btn-small btn-danger-ghost" data-del-inst="' + h(p.id) + '">削除</button></li>';
      });
      html += '</ul>';
    }
    html += '</section>';
    return html;
  }

  function form(id) {
    const s = ST().state;
    // 保存されているデータを直接書き換えないよう、コピーを編集する
    const found = id ? s.recurring.find((x) => x.id === id) : null;
    const r = found ? Object.assign({}, found, { tags: (found.tags || []).slice() }) : { name: '', type: 'expense', amount: '', day: Number(U.today().slice(8)), categoryId: null, accountId: (ST().accs()[0] || {}).id, toAccountId: null, method: '', payee: '', memo: '', tags: [], startMonth: U.thisMonth(), endMonth: null, active: true };
    const st = { type: r.type };
    const body = KB.ui.modal('<form id="rf" novalidate></form>', { title: id ? '定期を編集' : '定期を追加' });
    const f = body.querySelector('#rf');
    function draw() {
      const cats = st.type === 'transfer' ? [] : ST().cats(st.type);
      f.innerHTML =
        '<div class="seg">' + ['expense', 'income', 'transfer'].map((t) => '<button type="button" class="seg-btn seg-' + t + (st.type === t ? ' is-on' : '') + '" aria-pressed="' + (st.type === t) + '" data-type="' + t + '">' + TL[t] + '</button>').join('') + '</div>' +
        '<div class="grid-2"><div class="field"><label for="r-name">名前</label><input id="r-name" maxlength="30" value="' + h(r.name) + '" placeholder="例：家賃"></div>' +
        '<div class="field"><label for="r-amt">金額（円）</label><input id="r-amt" inputmode="numeric" value="' + h(r.amount === '' ? '' : U.fmt(r.amount)) + '"></div></div>' +
        '<div class="grid-3"><div class="field"><label for="r-day">毎月の日</label><select id="r-day">' + Array.from({ length: 31 }, (_, i) => i + 1).map((d) => '<option value="' + d + '"' + (d === r.day ? ' selected' : '') + '>' + (d === 31 ? '末日' : d + '日') + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="r-start">開始月</label><input id="r-start" type="month" value="' + h(r.startMonth) + '"></div>' +
        '<div class="field"><label for="r-end">終了月（任意）</label><input id="r-end" type="month" value="' + h(r.endMonth || '') + '"></div></div>' +
        (st.type !== 'transfer' ? '<div class="field"><label for="r-cat">カテゴリ</label><select id="r-cat">' + KB.ui.options(cats, r.categoryId) + '</select></div>' : '') +
        '<div class="grid-2"><div class="field"><label for="r-acc">' + (st.type === 'transfer' ? '振替元' : '口座') + '</label><select id="r-acc">' + KB.ui.accOptions(r.accountId) + '</select></div>' +
        (st.type === 'transfer' ? '<div class="field"><label for="r-to">振替先</label><select id="r-to">' + KB.ui.accOptions(r.toAccountId, { empty: '選んでください' }) + '</select></div>'
          : '<div class="field"><label for="r-method">支払い方法</label><select id="r-method"><option value="">（なし）</option>' + ST().METHODS.map((m) => '<option' + (m === r.method ? ' selected' : '') + '>' + h(m) + '</option>').join('') + '</select></div>') + '</div>' +
        '<div class="field"><label for="r-memo">メモ</label><input id="r-memo" maxlength="200" value="' + h(r.memo || '') + '"></div>' +
        '<div class="field"><label for="r-tags">タグ</label><input id="r-tags" value="' + h((r.tags || []).map((g) => '#' + g).join(' ')) + '"></div>' +
        '<label class="check"><input type="checkbox" id="r-active"' + (r.active ? ' checked' : '') + '> 自動登録を有効にする</label>' +
        (!id ? '<p class="hint">開始月が過去の場合、その月から今日までの分もまとめて登録されます。</p>' : '<p class="hint">変更はこれから登録される分に反映されます（登録済みの明細は変わりません）。</p>') +
        '<p class="form-error" role="alert" id="r-err"></p><div class="btn-row">' + (id ? '<button type="button" class="btn btn-danger-ghost" data-del>削除</button>' : '') + '<span class="spacer"></span><button class="btn btn-primary">保存</button></div>';
    }
    function read() {
      const v = (q) => { const el = f.querySelector(q); return el ? el.value : null; };
      r.name = (v('#r-name') || '').trim();
      r.amount = v('#r-amt');
      r.day = Number(v('#r-day'));
      r.startMonth = v('#r-start');
      r.endMonth = v('#r-end') || null;
      if (v('#r-cat') !== null) r.categoryId = v('#r-cat');
      r.accountId = v('#r-acc');
      if (v('#r-to') !== null) r.toAccountId = v('#r-to') || null;
      if (v('#r-method') !== null) r.method = v('#r-method');
      r.memo = (v('#r-memo') || '').trim();
      r.tags = U.parseTags(v('#r-tags'));
      r.active = f.querySelector('#r-active').checked;
    }
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (b) { read(); st.type = b.dataset.type; draw(); return; }
      if (e.target.closest('[data-del]')) {
        KB.ui.closeModal();
        KB.ui.act('定期の削除', (s2) => { s2.recurring = s2.recurring.filter((x) => x.id !== id); }, '定期を削除しました（登録済みの明細は残ります）');
      }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      const err = f.querySelector('#r-err');
      const amt = U.parseYen(r.amount);
      if (!r.name) { err.textContent = '名前を入れてください'; return; }
      if (!Number.isFinite(amt) || amt <= 0) { err.textContent = '金額を1円以上で入れてください'; return; }
      if (!/^\d{4}-\d{2}$/.test(r.startMonth || '')) { err.textContent = '開始月を選んでください'; return; }
      if (r.endMonth && r.endMonth < r.startMonth) { err.textContent = '終了月が開始月より前です'; return; }
      if (st.type === 'transfer' && (!r.toAccountId || r.toAccountId === r.accountId)) { err.textContent = '振替先を振替元と別の口座にしてください'; return; }
      if (st.type !== 'transfer' && !r.categoryId) { err.textContent = 'カテゴリを選んでください'; return; }
      KB.ui.closeModal();
      let n = 0;
      KB.ui.act(id ? '定期の編集' : '定期の追加', (s2) => {
        const rec = { name: r.name, type: st.type, amount: amt, day: r.day, categoryId: st.type === 'transfer' ? null : r.categoryId, accountId: r.accountId, toAccountId: st.type === 'transfer' ? r.toAccountId : null,
          method: st.type === 'transfer' ? '' : r.method, payee: r.payee || '', memo: r.memo, tags: r.tags, startMonth: r.startMonth, endMonth: r.endMonth, active: r.active };
        if (id) {
          const old = s2.recurring.find((x) => x.id === id);
          // 停止→再開のときは、止めていた間の分をさかのぼって登録しない（今月以降から）
          if (!old.active && rec.active) {
            const prevMonthEnd = U.addDays(U.thisMonth() + '-01', -1);
            if (!old.lastDate || old.lastDate < prevMonthEnd) old.lastDate = prevMonthEnd;
          }
          Object.assign(old, rec);
        }
        else s2.recurring.push(Object.assign({ id: U.uid('r_'), lastDate: null }, rec));
        n = C().generateRecurring(s2);
      }, (id ? '定期を更新しました' : '定期を追加しました'));
      if (n) KB.ui.toast(n + ' 件の明細を自動登録しました');
    });
    draw();
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.x === 'add') form(null);
      else if (b.dataset.edit) form(b.dataset.edit);
      else if (b.dataset.x === 'add-inst') KB.views.input.open({ type: 'expense', mode: 'installment' });
      else if (b.dataset.delInst) {
        const t = ST().state.transactions.find((x) => x.installment && x.installment.planId === b.dataset.delInst);
        if (t) KB.views.input.remove([t.id], { planOnly: true });
        else KB.ui.act('分割払いの削除', (s) => { s.installments = s.installments.filter((p) => p.id !== b.dataset.delInst); });
      }
    });
  }

  KB.views.plans = { title: '定期・分割', render, bind };
})();
