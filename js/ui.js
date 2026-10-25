/* UI 共通：ルーター、モーダル、トースト、確認ダイアログ、共通部品 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util;
  const h = U.h;
  KB.views = KB.views || {};

  // ---- ルーター（#/name?key=value）----
  function parseHash() {
    const raw = (location.hash || '#/home').slice(1);
    const [path, qs] = raw.split('?');
    const name = path.replace(/^\//, '') || 'home';
    const params = {};
    new URLSearchParams(qs || '').forEach((v, k) => { params[k] = v; });
    return { name, params };
  }
  let current = null;
  function render(keepScroll) {
    const { name, params } = parseHash();
    const view = KB.views[name] && KB.views[name].render ? KB.views[name] : KB.views.home;
    const main = document.getElementById('main');
    const y = window.scrollY;
    const changed = current !== name;
    current = name;
    try {
      // 毎回新しい要素に描くことで、イベントの二重登録を防ぐ
      const box = document.createElement('div');
      box.className = 'view view-' + name;
      box.innerHTML = view.render(params);
      main.replaceChildren(box);
      if (view.bind) view.bind(box, params);
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="card"><h2>表示中にエラーが発生しました</h2><p class="muted">' + h(e.message) + '</p></div>';
    }
    document.title = (view.title ? view.title + ' | ' : '') + '家計簿';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.getAttribute('data-nav') === name || (name !== 'home' && (a.getAttribute('data-nav-also') || '').split(' ').includes(name));
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (changed) {
      window.scrollTo(0, 0);
      if (!keepScroll) main.focus({ preventScroll: true });
    } else if (keepScroll) {
      window.scrollTo(0, y);
    }
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  // データ変更時に今の画面を描き直す（スクロール位置は保つ）
  const refresh = () => render(true);

  // ---- モーダル（<dialog>。スマホでは下からのシート）----
  let modalClose = null;
  function modal(html, opts) {
    opts = opts || {};
    const dlg = document.getElementById('modal');
    if (dlg.open) closeModal();
    if (modalClose) { const fn = modalClose; modalClose = null; fn(); }
    dlg.className = 'modal' + (opts.wide ? ' modal-wide' : '');
    dlg.innerHTML =
      '<div class="modal-head"><h2 id="modal-title">' + h(opts.title || '') + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="閉じる">✕</button></div>' +
      '<div class="modal-body">' + html + '</div>';
    dlg.setAttribute('aria-labelledby', 'modal-title');
    dlg.querySelector('[data-close]').addEventListener('click', () => closeModal());
    modalClose = opts.onClose || null;
    dlg.showModal();
    // 金額欄など [autofocus] はスマホでも選ぶ。それ以外の最初の要素はキーボードが出ないよう PC だけ
    const auto = dlg.querySelector('[autofocus]');
    const first = auto || (!matchMedia('(pointer: coarse)').matches && dlg.querySelector('.modal-body input, .modal-body select, .modal-body button'));
    if (first) first.focus();
    return dlg.querySelector('.modal-body');
  }
  function closeModal() {
    const dlg = document.getElementById('modal');
    if (dlg.open) dlg.close();
  }
  function initModal() {
    const dlg = document.getElementById('modal');
    dlg.addEventListener('close', () => {
      // close イベントは遅れて届くので、その間に次のモーダルが開いていたら中身を消さない
      if (dlg.open) return;
      dlg.innerHTML = '';
      const fn = modalClose;
      modalClose = null;
      if (fn) fn();
    });
    // 背景クリックで閉じる
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeModal(); });
  }

  // 確認ダイアログ（モーダルとは別の <dialog> を使い、入れ子でも使えるように）
  function confirmDlg(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const dlg = document.getElementById('confirm');
      dlg.innerHTML = '<form method="dialog" class="confirm-box"><p>' + h(message).replace(/\n/g, '<br>') + '</p>' +
        '<div class="btn-row end"><button value="cancel" class="btn">' + h(opts.cancel || 'キャンセル') + '</button>' +
        '<button value="ok" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" autofocus>' + h(opts.ok || 'OK') + '</button></div></form>';
      const done = () => { dlg.removeEventListener('close', done); resolve(dlg.returnValue === 'ok'); };
      dlg.returnValue = '';
      dlg.addEventListener('close', done);
      dlg.showModal();
    });
  }

  // ---- トースト ----
  function toast(msg, opts) {
    opts = opts || {};
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');
    el.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span>' + h(msg) + '</span>' + (opts.undo ? '<button type="button" class="toast-btn">元に戻す</button>' : '') +
      '<button type="button" class="toast-x" aria-label="閉じる">✕</button>';
    const remove = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 200); };
    if (opts.undo) el.querySelector('.toast-btn').addEventListener('click', () => { doUndo(); remove(); });
    el.querySelector('.toast-x').addEventListener('click', remove);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(remove, opts.ms || (opts.undo ? 7000 : 3500));
  }

  function doUndo() {
    const label = KB.store.undo();
    if (label) toast('「' + label + '」を元に戻しました');
    else toast('元に戻せる操作はありません');
  }

  // 変更をまとめて実行し、成功したら Undo 付きトーストを出す
  function act(label, fn, msg) {
    try {
      const r = KB.store.mutate(label, fn);
      if (r !== false) {
        toast(msg || label + 'しました', { undo: true });
        afterChange();
      }
      return r;
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), { type: 'error', ms: 8000 });
      return false;
    }
  }
  // バッジ判定など、変更のあとに毎回行う処理
  function afterChange() {
    try {
      let earned = [];
      KB.store.mutate('バッジ', (s) => {
        earned = KB.calc.checkBadges(s);
        return earned.length ? true : false;
      }, { noUndo: true });
      // 一度にたくさん取ったときはまとめて1つのお知らせにする
      const names = earned.map((id) => KB.calc.BADGES.find((x) => x.id === id)).filter(Boolean);
      if (names.length === 1) toast(names[0].icon + ' バッジ獲得：' + names[0].name, { type: 'success', ms: 5000 });
      else if (names.length > 1) toast('🏅 バッジを ' + names.length + ' 個獲得：' + names.map((b) => b.name).join('、'), { type: 'success', ms: 6000 });
    } catch (e) { console.error(e); }
  }

  // ---- 共通部品 ----
  const TYPE_LABEL = { expense: '支出', income: '収入', transfer: '振替' };
  // 金額表示：色だけに頼らず記号（＋／−／⇄）でも区別する
  function money(t) {
    const cls = 'amt amt-' + t.type;
    if (t.type === 'income') return '<span class="' + cls + '"><span class="sign" aria-hidden="true">＋</span>' + h(U.yen(t.amount)) + '<span class="sr-only">（収入）</span></span>';
    if (t.type === 'expense') return '<span class="' + cls + '"><span class="sign" aria-hidden="true">−</span>' + h(U.yen(t.amount)) + '<span class="sr-only">（支出）</span></span>';
    return '<span class="' + cls + '"><span class="sign" aria-hidden="true">⇄</span>' + h(U.yen(t.amount)) + '<span class="sr-only">（振替）</span></span>';
  }
  // 収支など符号付きの額
  function net(n) {
    const cls = n > 0 ? 'amt amt-income' : n < 0 ? 'amt amt-expense' : 'amt';
    return '<span class="' + cls + '">' + h(U.yenSigned(n)) + '</span>';
  }
  function catIcon(c, size) {
    if (!c) return '<span class="cat-icon" style="--c:#8a8f98" aria-hidden="true">⇄</span>';
    return '<span class="cat-icon' + (size ? ' cat-icon-' + size : '') + '" style="--c:' + U.safeColor(c.color) + '" aria-hidden="true">' + h(c.icon || '・') + '</span>';
  }
  function txTitle(t) {
    if (t.type === 'transfer') {
      const a = KB.store.acc(t.accountId), b = KB.store.acc(t.toAccountId);
      return (a ? a.name : '（削除済み）') + ' → ' + (b ? b.name : '（削除済み）');
    }
    const c = KB.store.cat(t.categoryId);
    return c ? c.name : '未分類';
  }
  function txRow(t, opts) {
    opts = opts || {};
    const c = t.type === 'transfer' ? null : KB.store.cat(t.categoryId);
    const a = KB.store.acc(t.accountId);
    const future = t.date > U.today();
    const sub = [
      t.payee ? h(t.payee) : '',
      t.memo ? h(t.memo) : '',
      t.type !== 'transfer' && a ? '<span class="chip-mini">' + h(a.name) + '</span>' : '',
      t.tags.map((g) => '<span class="tag">#' + h(g) + '</span>').join(''),
    ].filter(Boolean).join(' ');
    const flags = [
      future ? '<span class="flag flag-plan">予定</span>' : '',
      t.recurringId ? '<span class="flag" title="定期">定期</span>' : '',
      t.installment ? '<span class="flag" title="分割">分割 ' + t.installment.no + '/' + t.installment.count + '</span>' : '',
      t.receiptId ? '<span class="flag" title="レシートあり">📎</span>' : '',
    ].join('');
    return '<li class="tx' + (future ? ' is-future' : '') + '" data-id="' + h(t.id) + '">' +
      (opts.select ? '<label class="tx-check"><input type="checkbox" data-select="' + h(t.id) + '"' + (opts.checked ? ' checked' : '') + ' aria-label="選択"></label>' : '') +
      '<button type="button" class="tx-main" data-edit="' + h(t.id) + '">' +
      (t.type === 'transfer' ? '<span class="cat-icon" style="--c:#8a8f98" aria-hidden="true">⇄</span>' : catIcon(c)) +
      '<span class="tx-body"><span class="tx-title">' + h(txTitle(t)) + flags + '</span>' +
      (sub ? '<span class="tx-sub">' + sub + '</span>' : '') + '</span>' +
      '<span class="tx-right">' + money(t) + (opts.showDate ? '<span class="tx-date">' + h(t.date.slice(5).replace('-', '/')) + '</span>' : '') + '</span>' +
      '</button></li>';
  }
  // 日付ごとにまとめた明細
  function txList(list, opts) {
    opts = opts || {};
    if (!list.length) return '<p class="empty">' + h(opts.empty || '明細はまだありません') + '</p>';
    let out = '', cur = null;
    list.forEach((t) => {
      if (t.date !== cur) {
        if (cur !== null) out += '</ul>';
        cur = t.date;
        out += '<h3 class="day-head">' + h(U.fmtDate(t.date, opts.withYear)) + '</h3><ul class="tx-list">';
      }
      out += txRow(t, opts.rowOpts && opts.rowOpts(t));
    });
    return out + '</ul>';
  }

  // 進捗バー（予算・目標）。level で色と文言を変える
  function progress(rate, lvl, label) {
    const pct = Math.max(0, Math.min(100, Math.round((Number.isFinite(rate) ? rate : 1) * 100)));
    const txt = lvl === 'over' ? '超過' : lvl === 'warn' ? '注意' : '';
    return '<div class="progress progress-' + (lvl || 'ok') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + h(label || '進捗') + '">' +
      '<div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      (txt ? '<span class="level-badge level-' + lvl + '">' + (lvl === 'over' ? '⛔ ' : '⚠️ ') + txt + '</span>' : '');
  }

  function options(list, selected, opts) {
    opts = opts || {};
    let s = opts.empty !== undefined ? '<option value="">' + h(opts.empty) + '</option>' : '';
    list.forEach((x) => {
      s += '<option value="' + h(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + h((x.icon ? x.icon + ' ' : '') + x.name) + (x.archived ? '（非表示）' : '') + '</option>';
    });
    return s;
  }

  // 口座の選択肢。非表示の口座でも、いま選ばれているものは残す（編集で勝手に変わらないように）
  function accOptions(selected, opts) {
    const list = KB.store.accs().slice();
    const cur = KB.store.acc(selected);
    if (cur && cur.archived) list.push(cur);
    return options(list.filter((a) => !(opts && opts.exclude && a.id === opts.exclude)), selected, opts);
  }
  // ISO 日時（UTC）をローカルの日付に
  function localDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : U.dateStr(d);
  }

  function applyTheme() {
    const t = KB.store.state.settings.theme;
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#16191d' : '#f6f5f2');
  }

  KB.ui = {
    parseHash, render, refresh, go, modal, closeModal, initModal, confirm: confirmDlg, toast, act, doUndo, afterChange,
    money, net, catIcon, txTitle, txRow, txList, progress, options, accOptions, localDate, applyTheme, TYPE_LABEL,
  };
})();
