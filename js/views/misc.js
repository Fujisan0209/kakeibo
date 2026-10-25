/* バッジ一覧とスマホ用メニュー */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util, h = U.h;

  KB.views.badges = {
    title: 'バッジ',
    render() {
      const got = KB.store.state.badges;
      const st = KB.calc.streak();
      return '<div class="page-head"><h1>記録の習慣とバッジ</h1></div>' +
        '<section class="cards-3"><div class="stat"><span class="stat-label">連続記録</span><span class="stat-value">🔥 ' + st.current + ' 日</span></div>' +
        '<div class="stat"><span class="stat-label">最長記録</span><span class="stat-value">' + Math.max(st.best, st.current) + ' 日</span></div>' +
        '<div class="stat"><span class="stat-label">獲得バッジ</span><span class="stat-value">' + Object.keys(got).length + ' / ' + KB.calc.BADGES.length + '</span></div></section>' +
        '<p class="hint">連続記録は「その日に手で記録したかどうか」で数えます（定期の自動登録は含みません）。</p>' +
        '<ul class="badge-grid">' + KB.calc.BADGES.map((b) => '<li class="badge' + (got[b.id] ? ' is-got' : '') + '"><span class="badge-icon" aria-hidden="true">' + (got[b.id] ? b.icon : '🔒') + '</span><strong>' + h(b.name) + '</strong><span class="muted small">' + h(b.desc) + '</span>' +
          '<span class="small">' + (got[b.id] ? '獲得：' + h(U.fmtDate(got[b.id], true)) : '未獲得') + '</span></li>').join('') + '</ul>';
    },
  };

  KB.views.menu = {
    title: 'メニュー',
    render() {
      const items = [
        ['#/budget', '🎯', '予算', 'カテゴリ別の予算・繰り越し'],
        ['#/accounts', '🏦', '口座・資産', '残高・カード予測・資産推移・貯金目標'],
        ['#/plans', '🔁', '定期・分割', '固定費・定期収入・分割払い'],
        ['#/badges', '🏅', 'バッジ', '連続記録と達成バッジ'],
        ['#/settings?tab=categories', '🏷️', 'カテゴリ', '追加・編集・アイコンと色'],
        ['#/settings?tab=templates', '⚡', 'テンプレート', 'ワンタップ記録の編集'],
        ['#/settings?tab=data', '💾', 'データ管理', 'バックアップ・CSV・元に戻す'],
        ['#/settings?tab=display', '🌙', '表示・ロック', 'ダークモード・パスコード'],
        ['#/settings?tab=reminder', '⏰', 'リマインダー', '入力忘れのお知らせ'],
      ];
      return '<div class="page-head"><h1>メニュー</h1></div><ul class="menu-list">' + items.map(([href, ic, name, desc]) =>
        '<li><a href="' + href + '"><span class="menu-icon" aria-hidden="true">' + ic + '</span><span class="grow"><strong>' + h(name) + '</strong><span class="muted small">' + h(desc) + '</span></span><span aria-hidden="true">›</span></a></li>').join('') + '</ul>' +
        '<p class="hint center">データはこの端末のブラウザ内だけに保存されています。</p>';
    },
  };
})();
