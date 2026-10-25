# 設計メモ（kakeibo）

## 制約
- サーバーなし。`index.html` を file:// で開いても動く → ES Modules は使わず、classic script で `window.KB` 名前空間に登録する。
- GitHub Pages（https）では Service Worker + manifest で PWA 化。file:// では SW 登録をスキップ。
- グラフは自作 SVG（外部ライブラリなし → CDN 固定・オフラインキャッシュ問題を回避）。
- 金額はすべて整数（円）。`parseYen` で入力を整数化、計算は整数のみ。

## ファイル構成
- index.html … シェル（サイドバー / 下部タブ / メイン / モーダル / トースト）
- css/style.css … デザイントークン（ライト/ダーク）、レイアウト、コンポーネント
- js/util.js … エスケープ(h)、金額表示、日付ユーティリティ、SHA-256、CSV パース
- js/store.js … 状態・永続化（localStorage）・schemaVersion とマイグレーション・Undo・初期データ
- js/receipts.js … レシート画像（IndexedDB、縮小・JPEG 圧縮）
- js/calc.js … 残高、集計、予算と繰り越し、1日あたり、クレカ予測、資産推移、将来予測、定期/分割の生成、連続日数、バッジ判定
- js/charts.js … SVG グラフ（棒+折れ線、ドーナツ、折れ線、カレンダーヒートマップ）
- js/io.js … CSV（BOM付き UTF-8 出力 / UTF-8・Shift_JIS 自動判別入力）、JSON バックアップ/復元
- js/ui.js … ルーター、モーダル、トースト、共通部品
- js/views/*.js … 画面ごと（home, input, list, budget, accounts, analysis, plans(定期・分割), settings, menu, lock）
- js/app.js … 起動処理（マイグレーション→ロック→定期生成→描画）
- sw.js / manifest.webmanifest / icons/

## データモデル（localStorage キー `kakeibo.data`）
```
{
  schemaVersion: 1,
  settings: { theme:'auto'|'light'|'dark', carryover:boolean, passcode:{salt,hash}|null,
              reminder:{enabled, time:'21:00', lastNotified:'YYYY-MM-DD'}, createdAt },
  categories:   [{id, type:'expense'|'income', name, icon, color, order, archived}],
  accounts:     [{id, name, kind:'cash'|'bank'|'card'|'emoney', initialBalance:int, order, archived,
                  card?:{closingDay:1-31(31=月末), payDay:1-31, payMonthOffset:1|2, payAccountId}}],
  transactions: [{id, type:'expense'|'income'|'transfer', date:'YYYY-MM-DD', amount:int>0,
                  categoryId|null, accountId, toAccountId|null, method, memo, tags:[string],
                  receiptId|null, recurringId|null, installment:{planId,no,count}|null,
                  createdAt, updatedAt}],
  templates:    [{id, name, type, amount, categoryId, accountId, toAccountId, method, memo, tags}],
  recurring:    [{id, name, type, amount, day(1-31,月末に丸め), categoryId, accountId, toAccountId,
                  method, memo, tags, startMonth:'YYYY-MM', endMonth|null, lastDate|null, active}],
  installments: [{id, name, total, count, startMonth, day, categoryId, accountId, method, memo, tags, createdAt}],
  budgets:      { [categoryId]: [{from:'YYYY-MM', amount:int}] }   // 履歴で持ち、過去月の予算を保つ
  goals:        [{id, name, target:int, accountIds:[id], deadline|null}],
  activity:     { entryDays:['YYYY-MM-DD'] },   // 入力した日（連続日数用）
  badges:       { [badgeId]: 'YYYY-MM-DD' }
}
```
- 金額は常に正、向きは type で表す。口座残高 = initialBalance + 収入 − 支出 − 振替出 + 振替入。
- クレカ口座は残高がマイナス＝未払い。引き落としは「銀行→クレカ」の振替で記録。
- 振替は収支集計（収入・支出・予算・ランキング・グラフ）に含めない。資産推移には影響しない（総資産は不変）。
- 未来日付（分割の今後の回、予定）は「予定」と表示。現在残高は今日までの取引で計算、予測には含める。

## 主な計算
- 分割：総額 total を count 回に。基本額 = floor(total/count)、端数（total − 基本額×count）は1回目に上乗せ。合計は必ず total と一致。登録時に全回分の取引を生成（installment.planId で紐づけ、プラン削除で未来分のみ/全回削除を選べる）。
- 定期：起動時と日付変更時に、startMonth〜今日 で未生成の回を生成。day が月の日数を超える場合は月末に丸める（2/29 などうるう年対応）。lastDate で二重生成を防止。
- 予算と繰り越し：月 M の使える額 = 予算(M) + 繰越(M)。繰越(M) = carryover ON のとき max(0, 使える額(M−1) − 支出(M−1))、予算履歴の最初の月から順に計算。OFF なら 0。
- 警告：使用率 >= 80% 黄、>= 100% 赤（色に加えて「注意」「超過」の文字とアイコン）。
- 今月あと1日いくら：(予算合計＋繰越 − 今月支出（予算対象カテゴリ）) ÷ 今日を含む残り日数、0 未満は 0 と超過額表示。
- クレカ予測：締め日 C、支払日 P、支払月オフセット k（翌月=1）。締め日が来ていない現在の請求期間と、締め済み未払いの期間について、期間内のそのカードの支出合計−期間内の返金…を集計して支払日と金額を表示。
- 資産推移：各月末時点の全口座残高合計（12か月）。
- 月末残高の将来予測：現在の総資産 + 今月残りの定期収支 + 予定（未来日付の取引）− 変動支出の日割り（過去3か月の定期以外の支出平均/日 × 残り日数）。翌月以降3か月も同様に月単位で。
- 連続入力日数：entryDays の今日（または昨日）から遡って連続する日数。
- バッジ：初めての記録、3/7/30/100日連続、記録100件、予算内で1か月達成、黒字月、3か月連続黒字、貯金目標達成。

## 画面（ハッシュルーティング）
- PC: 左サイドバー。スマホ（<= 768px）: 下部タブ（ホーム / 明細 / ＋入力 / 分析 / メニュー）。
- #/home: 今月の収入・支出・収支、1日あたり使える額、予算警告、総資産、クレカ予測、テンプレートボタン、最近の明細、連続日数、リマインダーバナー
- #/input（?id= で編集, ?tpl= でテンプレ）: 支出/収入/振替タブ、通常/分割、レシート添付
- #/list: 絞り込み（キーワード・期間・金額・カテゴリ・タグ・口座・種類）、並べ替え、まとめて編集・削除
- #/budget: カテゴリ別予算と進捗、繰り越し ON/OFF
- #/accounts: 口座と残高、クレカ設定と予測、資産推移、貯金目標
- #/analysis: 月別推移、カテゴリ円グラフ、前月比・前年同月比、カレンダー、ランキング、将来予測、年間レポート
- #/plans: 定期（固定費・定期収入）と分割払い
- #/settings: カテゴリ、テンプレート、表示（テーマ）、ロック、リマインダー、データ管理（CSV/JSON/全消去）、バッジ
- #/menu: スマホ用のメニュー一覧

## Undo
- 変更系操作の直前に状態のスナップショット（JSON文字列）をメモリ上のスタックに積む（最大20件）。トーストの「元に戻す」と Ctrl+Z / 設定画面のボタンで戻す。永続化はしない。

## セキュリティ
- 表示はすべてテンプレート文字列 + `h()` エスケープ。innerHTML に生値を入れない。
- パスコード：ランダムソルト + SHA-256（純 JS 実装）で保存。画面に「簡易ロックであり、データ自体は暗号化されない」と明記。
