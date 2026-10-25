/* 起動処理：読み込み → ロック → 初回設定 → 定期の自動登録 → 描画。リマインダーと PWA もここ */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;
  let locked = false;
  let started = false;

  function overlay(html) {
    const el = document.getElementById('overlay');
    el.innerHTML = html;
    el.hidden = false;
    document.getElementById('app').setAttribute('inert', '');
    return el;
  }
  function hideOverlay() {
    const el = document.getElementById('overlay');
    el.hidden = true;
    el.innerHTML = '';
    document.getElementById('app').removeAttribute('inert');
  }

  // ---- 読み込みエラー時の画面（データを上書きしない）----
  function showLoadError() {
    const st = KB.store.state;
    const el = overlay('<div class="overlay-box"><h1>データを読み込めませんでした</h1><p>' + h(st._loadError) + '</p>' +
      '<p class="muted">保存されているデータはそのまま残しています（上書きしていません）。新しいバージョンのアプリで作られたデータの場合は、そちらで開いてください。</p>' +
      '<div class="stack"><button class="btn" data-x="raw">保存されているデータをファイルに書き出す</button>' +
      '<label class="btn file-btn">バックアップから復元<input type="file" accept=".json" hidden id="le-file"></label>' +
      '<button class="btn btn-danger" data-x="new">退避して新しく始める</button></div></div>');
    el.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'raw') U.download('kakeibo-raw-' + U.today() + '.json', st._raw, 'application/json');
      if (x.dataset.x === 'new' && await KB.ui.confirm('今のデータを退避用の場所にコピーしてから、新しく始めます。', { ok: '新しく始める', danger: true })) {
        KB.store.discardBroken();
        hideOverlay();
        boot2();
      }
    });
    el.querySelector('#le-file').addEventListener('change', async (e) => {
      try {
        const b = KB.io.parseBackup(await e.target.files[0].text());
        await KB.io.restore(b);
        hideOverlay();
        boot2();
      } catch (er) { KB.ui.toast(er.message, { type: 'error' }); }
    });
  }

  // ---- 初回設定 ----
  function showSetup() {
    const el = overlay('<div class="overlay-box"><div class="brand-big" aria-hidden="true">📒</div><h1>家計簿へようこそ</h1>' +
      '<p>サーバーを使わず、データは<strong>このブラウザの中だけ</strong>に保存されます。</p>' +
      '<p class="muted">標準のカテゴリ（食費・日用品・交通…）と口座（財布・銀行口座・クレジットカード・電子マネー）を用意します。あとから自由に変えられます。</p>' +
      '<div class="stack"><button class="btn btn-primary" data-x="empty">空の状態で始める</button><button class="btn" data-x="sample">サンプルデータを入れて試す</button>' +
      '<label class="btn file-btn">バックアップから復元<input type="file" accept=".json" hidden id="su-file"></label></div>' +
      '<p class="hint">サンプルデータは「設定 → データ管理 → すべて削除」で消せます。</p></div>');
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]');
      if (!x) return;
      KB.store.setup(x.dataset.x === 'sample');
      hideOverlay();
      boot2();
    });
    el.querySelector('#su-file').addEventListener('change', async (e) => {
      try {
        const b = KB.io.parseBackup(await e.target.files[0].text());
        await KB.io.restore(b);
        hideOverlay();
        boot2();
      } catch (er) { KB.ui.toast(er.message, { type: 'error' }); }
    });
  }

  // ---- ロック ----
  let fails = 0;
  function lock() {
    const pc = KB.store.state.settings.passcode;
    if (!pc) return false;
    locked = true;
    KB.ui.closeModal();
    const el = overlay('<form class="overlay-box lock" id="lockf"><div class="brand-big" aria-hidden="true">🔒</div><h1>パスコードを入力</h1>' +
      '<label class="sr-only" for="lock-in">パスコード</label><input id="lock-in" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" autofocus class="lock-input">' +
      '<p class="form-error" role="alert" id="lock-err"></p><button class="btn btn-primary">ロックを解除</button>' +
      '<p class="hint">のぞき見防止の簡易ロックです（データは暗号化されていません）。</p>' +
      '<details><summary>パスコードを忘れた</summary><p class="small">パスコードを忘れた場合は、データを消して初期化するしかありません。</p><button type="button" class="btn btn-danger btn-small" data-x="reset">データを消して初期化</button></details></form>');
    const f = el.querySelector('#lockf');
    const input = f.querySelector('#lock-in');
    setTimeout(() => input.focus(), 50);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = f.querySelector('#lock-err');
      if (U.hashPasscode(input.value, pc.salt) === pc.hash) {
        fails = 0;
        locked = false;
        hideOverlay();
        if (!started) boot3(); else KB.ui.refresh();
      } else {
        fails++;
        input.value = '';
        // 失敗が続くと待ち時間を入れる
        const wait = fails >= 5 ? Math.min(30, (fails - 4) * 5) : 0;
        err.textContent = 'パスコードが違います' + (wait ? '（' + wait + '秒お待ちください）' : '');
        if (wait) { input.disabled = true; setTimeout(() => { input.disabled = false; input.focus(); err.textContent = ''; }, wait * 1000); }
      }
    });
    f.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x="reset"]') && await KB.ui.confirm('すべてのデータを削除して初期化します。元に戻せません。', { ok: '削除する', danger: true })) {
        try { localStorage.removeItem(KB.store.KEY); localStorage.removeItem('kakeibo.backend'); } catch (er) { /* ignore */ }
        await KB.idb.clear('receipts').catch(() => {});
        await KB.idb.clear('kv').catch(() => {});
        location.reload();
      }
    });
    return true;
  }

  // ---- 通知・リマインダー ----
  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      KB.ui.toast(body);
      return;
    }
    const opts = { body, icon: 'icons/icon-192.png', tag: 'kakeibo-reminder' };
    // Android Chrome などは Service Worker 経由でないと通知を出せない
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => { try { new Notification(title, opts); } catch (e) { KB.ui.toast(body); } });
    } else {
      try { new Notification(title, opts); } catch (e) { KB.ui.toast(body); }
    }
  }
  function checkReminder() {
    const s = KB.store.state;
    const r = s.settings.reminder;
    if (!r.enabled || locked) return;
    const now = new Date();
    const hm = U.pad(now.getHours()) + ':' + U.pad(now.getMinutes());
    const today = U.today();
    if (hm < r.time || r.lastNotified === today || KB.calc.streak().todayDone) return;
    KB.store.mutate('リマインダー', (st) => { st.settings.reminder.lastNotified = today; }, { noUndo: true });
    if ('Notification' in window && Notification.permission === 'granted') notify('家計簿', '今日の記録がまだです。忘れないうちに入力しましょう。');
    // 許可がなくても、ホームのバナーで知らせる（描き直しで表示される）
  }

  // 日付が変わったときや、アプリに戻ってきたときに定期を登録する
  let lastDay = null;
  function daily() {
    const today = U.today();
    if (today === lastDay) return;
    lastDay = today;
    let n = 0;
    try {
      KB.store.mutate('定期の自動登録', (s) => { n = KB.calc.generateRecurring(s); return n > 0; }, { noUndo: true });
    } catch (e) { console.error(e); }
    if (n) KB.ui.toast('定期の収支を ' + n + ' 件自動で登録しました');
    KB.ui.afterChange();
  }

  // ---- 起動 ----
  async function boot() {
    KB.ui.initModal();
    await KB.store.load();
    KB.ui.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', KB.ui.applyTheme);
    if (KB.store.state._loadError) return showLoadError();
    boot2();
  }
  function boot2() {
    KB.ui.applyTheme();
    if (!KB.store.state.settings.setupDone) return showSetup();
    if (lock()) return;
    boot3();
  }
  function boot3() {
    if (started) return;
    started = true;
    daily();
    KB.ui.render();
    let raf = 0;
    KB.store.on((type, d) => {
      if (type === 'change') {
        if (d && d.external) KB.ui.applyTheme();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => KB.ui.refresh());
      }
      if (type === 'saveerror') KB.ui.toast('保存に失敗しました：' + ((d && d.message) || ''), { type: 'error', ms: 10000 });
      if (type === 'backend') KB.ui.toast('データが多くなったため、保存先を IndexedDB に切り替えました');
    });
    window.addEventListener('hashchange', () => KB.ui.render());
    // キーボード操作：Ctrl/⌘+Z で元に戻す、N で記録
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (locked) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !document.getElementById('modal').open) { e.preventDefault(); KB.ui.doUndo(); }
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !document.getElementById('modal').open) { e.preventDefault(); KB.views.input.open({}); }
    });
    document.querySelectorAll('[data-act="add"]').forEach((b) => b.addEventListener('click', () => KB.views.input.open({})));
    // 1分ごとにリマインダーと日付の変わり目を確認
    setInterval(() => { daily(); checkReminder(); }, 60 * 1000);
    // 5分以上ほかのアプリに切り替えていたら、ロックをかけ直す
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !locked && lock()) return;
      daily(); checkReminder(); KB.ui.refresh();
    });
    checkReminder();
    // 使われていないレシート画像の掃除と、保存領域の永続化リクエスト
    setTimeout(() => {
      KB.receipts.gc().catch(() => {});
      if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
        navigator.storage.persisted().then((p) => { if (!p && KB.store.state.transactions.length >= 10) navigator.storage.persist().catch(() => {}); }).catch(() => {});
      }
    }, 3000);
  }

  // ---- PWA ----
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              KB.ui.toast('新しいバージョンがあります。ページを再読み込みすると更新されます。', { ms: 10000 });
            }
          });
        });
      }).catch((e) => console.warn('Service Worker を登録できませんでした', e));
    });
  }

  KB.app = { lock, notify, boot };
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((e) => {
      console.error(e);
      document.getElementById('main').innerHTML = '<div class="card"><h1>起動できませんでした</h1><p>' + h(e.message) + '</p></div>';
    });
  });
})();
