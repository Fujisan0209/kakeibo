/* 設定：カテゴリ、テンプレート、表示・ロック、リマインダー、データ管理 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  const ST = () => KB.store;
  let tab = 'categories';
  let catType = 'expense';
  const ICONS = ['🍙', '🍱', '🍜', '☕', '🍰', '🍺', '🛒', '🧴', '🧻', '🚃', '🚌', '🚗', '⛽', '✈️', '🏠', '💡', '💧', '🔥', '📱', '💻', '💊', '🏥', '🎮', '🎬', '🎵', '📚', '🎓', '👕', '👟', '💇', '💄', '🎁', '🍻', '💐', '🐶', '👶', '🛡️', '🏛️', '💴', '💼', '✨', '🪙', '📈', '🏦', '🎯', '📦', '🧾', '❤️'];
  const COLORS = ['#e07a5f', '#f2a541', '#c9a227', '#81b29a', '#2e7d32', '#26a69a', '#3d85c6', '#5c6bc0', '#7e57c2', '#ab47bc', '#ec407a', '#8d6e63', '#607d8b', '#9e9e9e'];
  const TABS = [['categories', 'カテゴリ'], ['templates', 'テンプレート'], ['display', '表示・ロック'], ['reminder', 'リマインダー'], ['data', 'データ管理']];

  function render(params) {
    if (params.tab && TABS.some((t) => t[0] === params.tab)) tab = params.tab;
    let html = '<div class="page-head"><h1>設定</h1></div><div class="tabs" role="tablist">' +
      TABS.map(([k, l]) => '<button role="tab" aria-selected="' + (tab === k) + '" class="tab' + (tab === k ? ' is-on' : '') + '" data-tab="' + k + '">' + l + '</button>').join('') + '</div>';
    html += ({ categories, templates, display, reminder, data })[tab]();
    return html;
  }

  // ---- カテゴリ ----
  function categories() {
    const list = ST().cats(catType, true);
    const counts = {};
    ST().state.transactions.forEach((t) => { if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1; });
    return '<section class="card"><div class="card-head"><div class="seg seg-small">' + [['expense', '支出'], ['income', '収入']].map(([k, l]) => '<button class="seg-btn' + (catType === k ? ' is-on' : '') + '" aria-pressed="' + (catType === k) + '" data-cattype="' + k + '">' + l + 'のカテゴリ</button>').join('') + '</div>' +
      '<button class="btn btn-primary btn-small" data-x="add-cat">＋ 追加</button></div><ul class="sort-list">' +
      list.map((c, i) => '<li class="' + (c.archived ? 'is-off' : '') + '">' + KB.ui.catIcon(c) + '<span class="grow">' + h(c.name) + (c.archived ? ' <span class="flag">非表示</span>' : '') + ' <small class="muted">' + (counts[c.id] || 0) + '件</small></span>' +
        '<button class="icon-btn" data-up="' + h(c.id) + '" aria-label="' + h(c.name) + 'を上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="icon-btn" data-down="' + h(c.id) + '" aria-label="' + h(c.name) + 'を下へ"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn btn-small" data-edit-cat="' + h(c.id) + '">編集</button></li>').join('') + '</ul></section>';
  }
  function catForm(id) {
    const c = id ? ST().cat(id) : { name: '', icon: catType === 'income' ? '💴' : '📦', color: COLORS[Math.floor(Math.random() * COLORS.length)], type: catType };
    const used = id ? ST().state.transactions.filter((t) => t.categoryId === id).length : 0;
    const body = KB.ui.modal('<form id="cf" novalidate>' +
      '<div class="field"><label for="c-name">名前</label><input id="c-name" maxlength="20" value="' + h(c.name) + '"></div>' +
      '<fieldset class="field"><legend>アイコン</legend><div class="icon-grid">' + ICONS.map((ic) => '<label class="icon-opt"><input type="radio" name="icon" value="' + h(ic) + '"' + (ic === c.icon ? ' checked' : '') + '><span>' + ic + '</span></label>').join('') + '</div>' +
      '<label class="small" for="c-icon">ほかの絵文字や文字（1〜2文字）</label><input id="c-icon" maxlength="4" value="' + h(ICONS.includes(c.icon) ? '' : c.icon) + '" class="input-short"></fieldset>' +
      '<fieldset class="field"><legend>色</legend><div class="color-grid">' + COLORS.map((col) => '<label class="color-opt" style="--c:' + col + '"><input type="radio" name="color" value="' + col + '"' + (col === c.color ? ' checked' : '') + '><span class="sr-only">' + col + '</span></label>').join('') +
      '<label class="color-custom">その他 <input type="color" id="c-color" value="' + h(U.safeColor(c.color)) + '"></label></div></fieldset>' +
      '<p class="form-error" role="alert" id="c-err"></p><div class="btn-row">' +
      (id ? (used ? '<button type="button" class="btn btn-danger-ghost" data-archive>' + (c.archived ? '再表示する' : '非表示にする') + '</button>' : '<button type="button" class="btn btn-danger-ghost" data-del>削除</button>') : '') +
      '<span class="spacer"></span><button class="btn btn-primary">保存</button></div>' +
      (used ? '<p class="hint">' + used + ' 件の明細で使われているため削除できません。非表示にすると入力の選択肢から外れます（集計には残ります）。</p>' : '') + '</form>', { title: id ? 'カテゴリを編集' : 'カテゴリを追加' });
    const f = body.querySelector('#cf');
    f.querySelector('#c-color').addEventListener('input', () => { f.querySelectorAll('input[name=color]').forEach((r) => { r.checked = false; }); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.querySelector('#c-name').value.trim();
      const custom = f.querySelector('#c-icon').value.trim();
      const icon = custom || (f.querySelector('input[name=icon]:checked') || {}).value || '📦';
      const picked = f.querySelector('input[name=color]:checked');
      const color = U.safeColor(picked ? picked.value : f.querySelector('#c-color').value);
      const err = f.querySelector('#c-err');
      if (!name) { err.textContent = '名前を入れてください'; return; }
      if (ST().state.categories.some((x) => x.name === name && x.type === c.type && x.id !== id)) { err.textContent = '同じ名前のカテゴリがあります'; return; }
      KB.ui.closeModal();
      KB.ui.act(id ? 'カテゴリの編集' : 'カテゴリの追加', (s) => {
        if (id) Object.assign(s.categories.find((x) => x.id === id), { name, icon, color });
        else s.categories.push({ id: U.uid('c_'), type: c.type, name, icon, color, order: s.categories.length, archived: false });
      });
    });
    f.addEventListener('click', (e) => {
      if (e.target.closest('[data-archive]')) { KB.ui.closeModal(); KB.ui.act('カテゴリの表示切り替え', (s) => { const x = s.categories.find((y) => y.id === id); x.archived = !x.archived; }); }
      if (e.target.closest('[data-del]')) {
        KB.ui.closeModal();
        KB.ui.act('カテゴリの削除', (s) => {
          s.categories = s.categories.filter((x) => x.id !== id);
          delete s.budgets[id];
          s.templates.forEach((t) => { if (t.categoryId === id) t.categoryId = null; });
          s.recurring.forEach((r) => { if (r.categoryId === id) r.active = false; });
        });
      }
    });
  }
  function move(id, dir) {
    KB.ui.act('並べ替え', (s) => {
      const c = s.categories.find((x) => x.id === id);
      const list = s.categories.filter((x) => x.type === c.type).sort((a, b) => a.order - b.order);
      const i = list.indexOf(c), j = i + dir;
      if (j < 0 || j >= list.length) return false;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((x, k) => { x.order = k; });
    }, '並べ替えました');
  }

  // ---- テンプレート ----
  function templates() {
    const list = ST().state.templates;
    return '<section class="card"><div class="card-head"><h2 class="card-title">テンプレート</h2><button class="btn btn-primary btn-small" data-x="add-tpl">＋ 追加</button></div>' +
      '<p class="hint">ホームの「ワンタップ記録」に並びます。入力画面の「テンプレ保存」からも作れます。</p>' +
      (list.length ? '<ul class="sort-list">' + list.map((t, i) => '<li>' + (t.type === 'transfer' ? '<span class="cat-icon" style="--c:#8a8f98">⇄</span>' : KB.ui.catIcon(ST().cat(t.categoryId))) +
        '<span class="grow">' + h(t.name) + ' <small class="muted">' + h(KB.ui.txTitle(t)) + '</small></span>' + KB.ui.money(t) +
        '<button class="icon-btn" data-tup="' + i + '" aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn btn-small" data-edit-tpl="' + h(t.id) + '">編集</button></li>').join('') + '</ul>' : '<p class="empty">まだありません</p>') + '</section>';
  }
  function tplForm(id) {
    const s = ST().state;
    const found = id ? s.templates.find((x) => x.id === id) : null;
    const t = found ? Object.assign({}, found, { tags: (found.tags || []).slice() }) : { name: '', type: 'expense', amount: '', categoryId: null, accountId: (ST().accs()[0] || {}).id, toAccountId: null, method: '', payee: '', memo: '', tags: [] };
    const st = { type: t.type };
    const body = KB.ui.modal('<form id="tf" novalidate></form>', { title: id ? 'テンプレートを編集' : 'テンプレートを追加' });
    const f = body.querySelector('#tf');
    function draw() {
      f.innerHTML = '<div class="seg">' + ['expense', 'income', 'transfer'].map((k) => '<button type="button" class="seg-btn seg-' + k + (st.type === k ? ' is-on' : '') + '" aria-pressed="' + (st.type === k) + '" data-type="' + k + '">' + KB.ui.TYPE_LABEL[k] + '</button>').join('') + '</div>' +
        '<div class="grid-2"><div class="field"><label for="t-name">ボタンの名前</label><input id="t-name" maxlength="20" value="' + h(t.name) + '"></div>' +
        '<div class="field"><label for="t-amt">金額（円）</label><input id="t-amt" inputmode="numeric" value="' + h(t.amount === '' ? '' : U.fmt(t.amount)) + '"></div></div>' +
        (st.type !== 'transfer' ? '<div class="field"><label for="t-cat">カテゴリ</label><select id="t-cat">' + KB.ui.options(ST().cats(st.type), t.categoryId) + '</select></div>' : '') +
        '<div class="grid-2"><div class="field"><label for="t-acc">口座</label><select id="t-acc">' + KB.ui.accOptions(t.accountId) + '</select></div>' +
        (st.type === 'transfer' ? '<div class="field"><label for="t-to">振替先</label><select id="t-to">' + KB.ui.accOptions(t.toAccountId, { empty: '選んでください' }) + '</select></div>'
          : '<div class="field"><label for="t-method">支払い方法</label><select id="t-method"><option value="">（口座に合わせる）</option>' + ST().METHODS.map((m) => '<option' + (m === t.method ? ' selected' : '') + '>' + h(m) + '</option>').join('') + '</select></div>') + '</div>' +
        (st.type !== 'transfer' ? '<div class="field"><label for="t-payee">お店・相手</label><input id="t-payee" maxlength="60" value="' + h(t.payee || '') + '"></div>' : '') +
        '<div class="field"><label for="t-memo">メモ</label><input id="t-memo" maxlength="200" value="' + h(t.memo || '') + '"></div>' +
        '<div class="field"><label for="t-tags">タグ</label><input id="t-tags" value="' + h((t.tags || []).map((g) => '#' + g).join(' ')) + '"></div>' +
        '<p class="form-error" role="alert" id="t-err"></p><div class="btn-row">' + (id ? '<button type="button" class="btn btn-danger-ghost" data-del>削除</button>' : '') + '<span class="spacer"></span><button class="btn btn-primary">保存</button></div>';
    }
    const read = () => {
      const v = (q) => { const el = f.querySelector(q); return el ? el.value : null; };
      t.name = (v('#t-name') || '').trim(); t.amount = v('#t-amt');
      if (v('#t-cat') !== null) t.categoryId = v('#t-cat');
      t.accountId = v('#t-acc');
      if (v('#t-to') !== null) t.toAccountId = v('#t-to') || null;
      if (v('#t-method') !== null) t.method = v('#t-method');
      if (v('#t-payee') !== null) t.payee = v('#t-payee').trim();
      t.memo = (v('#t-memo') || '').trim(); t.tags = U.parseTags(v('#t-tags'));
    };
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (b) { read(); st.type = b.dataset.type; draw(); }
      if (e.target.closest('[data-del]')) { KB.ui.closeModal(); KB.ui.act('テンプレートの削除', (s2) => { s2.templates = s2.templates.filter((x) => x.id !== id); }); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      const amt = U.parseYen(t.amount);
      const err = f.querySelector('#t-err');
      if (!t.name) { err.textContent = '名前を入れてください'; return; }
      if (!Number.isFinite(amt) || amt <= 0) { err.textContent = '金額を1円以上で入れてください'; return; }
      if (st.type === 'transfer' && (!t.toAccountId || t.toAccountId === t.accountId)) { err.textContent = '振替先を振替元と別の口座にしてください'; return; }
      KB.ui.closeModal();
      const rec = { name: t.name, type: st.type, amount: amt, categoryId: st.type === 'transfer' ? null : t.categoryId, accountId: t.accountId, toAccountId: st.type === 'transfer' ? t.toAccountId : null, method: st.type === 'transfer' ? '' : t.method, payee: st.type === 'transfer' ? '' : t.payee || '', memo: t.memo, tags: t.tags };
      KB.ui.act(id ? 'テンプレートの編集' : 'テンプレートの追加', (s2) => {
        if (id) Object.assign(s2.templates.find((x) => x.id === id), rec);
        else s2.templates.push(Object.assign({ id: U.uid('tp_') }, rec));
      });
    });
    draw();
  }

  // ---- 表示・ロック ----
  function display() {
    const st = ST().state.settings;
    return '<section class="card"><h2 class="card-title">テーマ</h2><div class="seg" role="radiogroup" aria-label="テーマ">' +
      [['auto', '🖥️ OSに合わせる'], ['light', '☀️ ライト'], ['dark', '🌙 ダーク']].map(([k, l]) => '<button role="radio" aria-checked="' + (st.theme === k) + '" class="seg-btn' + (st.theme === k ? ' is-on' : '') + '" data-theme="' + k + '">' + l + '</button>').join('') + '</div></section>' +
      '<section class="card"><h2 class="card-title">パスコードロック</h2>' +
      '<div class="banner banner-warn">⚠️ これは<strong>のぞき見防止用の簡易ロック</strong>です。データそのものは暗号化されていません。ブラウザの開発者ツールなどからは中身を読めます。共用のパソコンでは使わないでください。</div>' +
      (st.passcode ? '<p>ロックは <strong>ON</strong> です。アプリを開くたびにパスコードを聞きます。</p><div class="btn-row"><button class="btn" data-x="pass-set">パスコードを変更</button><button class="btn btn-danger-ghost" data-x="pass-off">ロックを解除する</button><button class="btn" data-x="lock-now">今すぐロック</button></div>'
        : '<p class="muted">4〜8桁の数字で設定します。パスコードはソルト付きでハッシュ化して保存します。</p><button class="btn btn-primary" data-x="pass-set">パスコードを設定</button>') +
      '<p class="hint">パスコードを忘れたときは、ロック画面の「データを消して初期化」しかありません。事前にバックアップを取ってください。</p></section>';
  }
  function passForm() {
    const body = KB.ui.modal('<form id="pf" novalidate><div class="field"><label for="p1">新しいパスコード（4〜8桁の数字）</label><input id="p1" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></div>' +
      '<div class="field"><label for="p2">もう一度</label><input id="p2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></div><p class="form-error" role="alert" id="p-err"></p>' +
      '<div class="btn-row end"><button class="btn btn-primary">設定する</button></div></form>', { title: 'パスコードを設定' });
    const f = body.querySelector('#pf');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const a = f.querySelector('#p1').value, b = f.querySelector('#p2').value;
      const err = f.querySelector('#p-err');
      if (!/^\d{4,8}$/.test(a)) { err.textContent = '4〜8桁の数字にしてください'; return; }
      if (a !== b) { err.textContent = '2回の入力が一致しません'; return; }
      const salt = U.uid('s');
      const hash = U.hashPasscode(a, salt);
      KB.ui.closeModal();
      try {
        KB.store.mutate('パスコード設定', (s) => { s.settings.passcode = { salt, hash }; }, { noUndo: true });
        KB.ui.toast('パスコードを設定しました');
      } catch (er) { KB.ui.toast(er.message, { type: 'error' }); }
    });
  }

  // ---- リマインダー ----
  function reminder() {
    const r = ST().state.settings.reminder;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const permText = { granted: '✅ 通知は許可されています', denied: '🚫 通知はブロックされています（ブラウザの設定で許可できます）', default: '通知はまだ許可されていません', unsupported: 'このブラウザでは通知が使えません' }[perm];
    return '<section class="card"><h2 class="card-title">入力リマインダー</h2>' +
      '<div class="toggle-row"><div><strong>毎日決まった時刻にお知らせ</strong><p class="muted small">その日にまだ記録していなければ知らせます。</p></div><label class="switch"><input type="checkbox" id="rem-on"' + (r.enabled ? ' checked' : '') + '><span class="switch-ui" aria-hidden="true"></span><span class="sr-only">リマインダー</span></label></div>' +
      '<div class="field"><label for="rem-time">時刻</label><input id="rem-time" type="time" value="' + h(r.time) + '" class="input-short"></div>' +
      '<p>' + h(permText) + '</p>' +
      (perm === 'default' ? '<button class="btn" data-x="perm">通知を許可する</button>' : '') + (perm === 'granted' ? '<button class="btn" data-x="test-notify">テスト通知</button>' : '') +
      '<p class="hint">サーバーを使わないため、通知が届くのは<strong>アプリ（このページ）を開いている間</strong>だけです。閉じている間に時刻を過ぎた場合は、次に開いたときにアプリ内のバナーでお知らせします。通知が許可されていない場合もバナーでお知らせします。</p></section>';
  }

  // ---- データ管理 ----
  function data() {
    const s = ST().state;
    const last = s.settings.lastBackupAt;
    return '<section class="card"><h2 class="card-title">バックアップ（JSON）</h2>' +
      '<p class="muted">すべてのデータ（設定・カテゴリ・口座・明細・予算など）を1つのファイルに保存します。' + (last ? '最後のバックアップ：' + h(U.fmtDate(KB.ui.localDate(last), true)) : 'まだバックアップしていません。') + '</p>' +
      '<label class="check"><input type="checkbox" id="with-receipts" checked> レシート画像も含める（ファイルが大きくなります）</label>' +
      '<div class="btn-row"><button class="btn btn-primary" data-x="backup">バックアップを保存</button><label class="btn file-btn">バックアップから復元<input type="file" accept=".json,application/json" id="restore-file" hidden></label></div>' +
      '<p class="hint">データはこのブラウザの中にしか保存されていません。ブラウザのデータ消去や端末の故障で消えるため、定期的にバックアップしてください。</p></section>' +
      '<section class="card"><h2 class="card-title">CSV（Excel など）</h2><p class="muted">BOM付き UTF-8 で書き出すので、Excel で開いても文字化けしません。読み込みは UTF-8 と Shift_JIS に対応しています。</p>' +
      '<div class="btn-row"><button class="btn" data-x="csv-out">CSVを書き出す</button><label class="btn file-btn">CSVを読み込む<input type="file" accept=".csv,text/csv" id="csv-file" hidden></label></div>' +
      '<details><summary>CSV の列について</summary><p class="small">ID, 日付, 種類（支出/収入/振替）, 金額, カテゴリ, 口座, 振替先口座, 支払い方法, お店・相手, メモ, タグ（#区切り）。「日付」と「金額」以外は省略できます。種類がない場合は金額がマイナスなら支出とみなします。ID が同じ行は上書きします。知らないカテゴリ・口座は新しく作ります。</p></details></section>' +
      '<section class="card"><h2 class="card-title">元に戻す</h2><p class="muted">' + (ST().canUndo() ? '直前の操作：「' + h(ST().undoLabel()) + '」' : '元に戻せる操作はありません') + '（Ctrl+Z でも戻せます。ページを再読み込みすると履歴は消えます）</p>' +
      '<button class="btn" data-x="undo"' + (ST().canUndo() ? '' : ' disabled') + '>元に戻す</button></section>' +
      '<section class="card"><h2 class="card-title">保存の状態</h2><ul class="bullets" id="storage-info"><li>保存先：' + (ST().backend === 'idb' ? 'IndexedDB' : 'localStorage') + '</li><li>明細 ' + U.fmt(s.transactions.length) + ' 件・データ量 約 ' + U.fmt(Math.round(ST().serialize().length / 1024)) + ' KB</li></ul>' +
      '<button class="btn btn-small" data-x="persist">データを消されにくくする（永続化をリクエスト）</button></section>' +
      '<section class="card card-danger"><h2 class="card-title">すべてのデータを消す</h2><p class="muted">明細・口座・設定・レシート画像をすべて削除し、最初の状態に戻します。元に戻せません。</p><button class="btn btn-danger" data-x="wipe">すべて削除</button></section>';
  }

  async function doBackup(el) {
    const withR = el.querySelector('#with-receipts').checked;
    try {
      const json = await KB.io.exportJSON(withR);
      U.download('kakeibo-backup-' + U.today() + '.json', json, 'application/json');
      KB.store.mutate('バックアップ日時', (s) => { s.settings.lastBackupAt = new Date().toISOString(); }, { noUndo: true });
      KB.ui.toast('バックアップを保存しました');
    } catch (e) { KB.ui.toast('バックアップできませんでした：' + e.message, { type: 'error' }); }
  }
  async function doRestore(file) {
    try {
      const text = await file.text();
      const b = KB.io.parseBackup(text);
      const n = b.data.transactions.length;
      const ok = await KB.ui.confirm('「' + file.name + '」から復元します。\n明細 ' + n + ' 件' + (b.exportedAt ? '（' + b.exportedAt.slice(0, 10) + ' 時点）' : '') + '\n\n今のデータはすべて置き換わります（直後なら「元に戻す」で戻せます）。', { ok: '復元する', danger: true });
      if (!ok) return;
      await KB.io.restore(b);
      KB.ui.toast('復元しました', { undo: true });
    } catch (e) { KB.ui.toast('復元できませんでした：' + e.message, { type: 'error', ms: 8000 }); }
  }
  async function doCSVImport(file) {
    try {
      const text = await KB.io.readText(file);
      const plan = KB.io.planCSV(text);
      const body = KB.ui.modal('<p>「' + h(file.name) + '」の内容</p><ul class="bullets"><li>追加：<strong>' + plan.adds + '</strong> 件</li><li>上書き（同じID）：' + plan.updates + ' 件</li>' +
        (plan.newCats.length ? '<li>新しいカテゴリ：' + plan.newCats.map((c) => h(c.name)).join('、') + '</li>' : '') +
        (plan.newAccs.length ? '<li>新しい口座：' + plan.newAccs.map((a) => h(a.name)).join('、') + '</li>' : '') +
        (plan.errors.length ? '<li class="neg-text">読み込めない行：' + plan.errors.length + ' 件</li>' : '') + '</ul>' +
        (plan.errors.length ? '<details><summary>読み込めない行の詳細</summary><ul class="small">' + plan.errors.slice(0, 50).map((e) => '<li>' + h(e) + '</li>').join('') + '</ul></details>' : '') +
        '<div class="btn-row end"><button class="btn" data-close2>やめる</button><button class="btn btn-primary" data-ok' + (plan.items.length ? '' : ' disabled') + '>読み込む</button></div>', { title: 'CSV の読み込み' });
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-close2]')) KB.ui.closeModal();
        if (e.target.closest('[data-ok]')) {
          KB.ui.closeModal();
          try { KB.io.applyCSV(plan); KB.ui.toast(plan.items.length + ' 件を読み込みました', { undo: true }); } catch (er) { KB.ui.toast(er.message, { type: 'error' }); }
        }
      });
    } catch (e) { KB.ui.toast('CSV を読み込めませんでした：' + e.message, { type: 'error', ms: 8000 }); }
  }

  function bind(el) {
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const x = b.dataset.x;
      if (b.dataset.tab) { tab = b.dataset.tab; history.replaceState(null, '', '#/settings?tab=' + tab); KB.ui.refresh(); return; }
      if (b.dataset.cattype) { catType = b.dataset.cattype; KB.ui.refresh(); return; }
      if (b.dataset.editCat) return catForm(b.dataset.editCat);
      if (b.dataset.up) return move(b.dataset.up, -1);
      if (b.dataset.down) return move(b.dataset.down, 1);
      if (b.dataset.editTpl) return tplForm(b.dataset.editTpl);
      if (b.dataset.tup) {
        const i = Number(b.dataset.tup);
        return KB.ui.act('並べ替え', (s) => { const t = s.templates; [t[i - 1], t[i]] = [t[i], t[i - 1]]; }, '並べ替えました');
      }
      if (b.dataset.theme) {
        KB.store.mutate('テーマ', (s) => { s.settings.theme = b.dataset.theme; }, { noUndo: true });
        KB.ui.applyTheme();
        return;
      }
      switch (x) {
        case 'add-cat': return catForm(null);
        case 'add-tpl': return tplForm(null);
        case 'pass-set': return passForm();
        case 'pass-off':
          if (await KB.ui.confirm('パスコードロックを解除しますか？')) { KB.store.mutate('ロック解除', (s) => { s.settings.passcode = null; }, { noUndo: true }); KB.ui.toast('ロックを解除しました'); }
          return;
        case 'lock-now': return KB.app.lock();
        case 'perm':
          try { await Notification.requestPermission(); } catch (er) { /* 古いブラウザ */ }
          KB.ui.refresh();
          return;
        case 'test-notify': return KB.app.notify('家計簿', 'これはテスト通知です。');
        case 'backup': return doBackup(el);
        case 'csv-out': return U.download('kakeibo-' + U.today() + '.csv', KB.io.exportCSV(), 'text/csv;charset=utf-8');
        case 'undo': return KB.ui.doUndo();
        case 'persist':
          if (navigator.storage && navigator.storage.persist) {
            const ok = await navigator.storage.persist();
            KB.ui.toast(ok ? '永続化されました（自動では消されにくくなります）' : 'ブラウザに許可されませんでした。ホーム画面に追加すると許可されやすくなります');
          } else KB.ui.toast('このブラウザでは使えません');
          return;
        case 'wipe': {
          const ok = await KB.ui.confirm('すべてのデータを削除します。元に戻せません。\n先にバックアップを取りましたか？', { ok: 'すべて削除', danger: true });
          if (!ok) return;
          try { localStorage.removeItem(KB.store.KEY); localStorage.removeItem('kakeibo.backend'); localStorage.removeItem('kakeibo.lastInput'); } catch (er) { /* ignore */ }
          await KB.idb.clear('receipts').catch(() => {});
          await KB.idb.clear('kv').catch(() => {});
          location.hash = '#/home';
          location.reload();
          return;
        }
      }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'restore-file' && t.files[0]) { doRestore(t.files[0]); t.value = ''; }
      if (t.id === 'csv-file' && t.files[0]) { doCSVImport(t.files[0]); t.value = ''; }
      if (t.id === 'rem-on' || t.id === 'rem-time') {
        const on = el.querySelector('#rem-on').checked;
        const time = el.querySelector('#rem-time').value || '21:00';
        KB.store.mutate('リマインダー', (s) => { s.settings.reminder.enabled = on; s.settings.reminder.time = time; }, { noUndo: true });
        if (on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => KB.ui.refresh(), () => {});
        KB.ui.toast(on ? 'リマインダーを ' + time + ' に設定しました' : 'リマインダーを OFF にしました');
      }
    });
    // 保存容量の目安
    const info = el.querySelector('#storage-info');
    if (info && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const li = document.createElement('li');
        li.textContent = 'ブラウザの保存領域：' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB 使用 / 上限の目安 ' + U.fmt(Math.round((est.quota || 0) / 1024 / 1024)) + ' MB';
        info.appendChild(li);
      }, () => {});
    }
  }

  KB.views.settings = { title: '設定', render, bind };
})();
