# taiyo-uriage-bunseki — 開発ガイド

太陽シルバーサービス向けの消耗品売上分析ダッシュボード。単一HTML(`index.html`)で配布し、
営業所へはファイル1個のコピーで渡せることが要件。CDN依存ゼロ・全機能クライアントサイド完結。

## セッション開始時に必ず確認すること

1. 本ファイル（プロジェクト固有の設計・制約）
2. `Learnings.md`（過去に発生した不具合パターンと再発防止策）
3. `HANDOFF.md`（機能追加の経緯・仕様変更の理由。詳細な背景が必要なときに参照）

## ビルド構成（最重要）

- **編集対象は必ず `src/index.html`**（React JSX を `text/babel` で埋め込んだ約7,000行の単一ファイル）。
  ルート直下の `index.html` はビルド成果物であり、直接編集しても次のビルドで上書きされる。
- ビルド: `cd build && node build.js` → ルート直下 `index.html`（約1.1〜1.3MB、jspdf/html2canvas同梱）を生成。
- 依存関係は `build/node_modules` にのみ存在（react/react-dom/lucide-react/jspdf/html2canvas/esbuild/tailwindcss）。
  ルートの `package.json` はテスト実行専用（`npm test` → `node --test test/**/*.test.mjs`）。
- コード変更後は **必ず `cd build && node build.js` を実行してからコミット**する。
  `git diff --stat` で `index.html` と `src/index.html` の両方が更新されていることを確認する。
- `.gitignore`: `build/node_modules/` `build/tailwind.output.css` `*.log` `_serve.cjs` `_testdata.csv`

## アーキテクチャ概要（`src/index.html` 内の主要関数・行番号目安）

データ層:
- `analyzeCsv` / `decodeCsvBuffer` / `parseDelimited` — CSV取込（UTF-8/Shift-JIS自動判別、引用符対応）
- `buildAnalytics(rows, masters, baseSel)` — 1パス索引集計。ダッシュボード等の主要データソース
- `buildPeriodReport(rows, masters, fromIdx, toIdx, ...)` — 任意期間の集計（12ヶ月窓に依存しない）
- `classifyCustomerName` / `autoCategory` / `resolveCategory` — 施設/個人判定・商品分類（手動→学習→内蔵辞書の優先順位）

帳票ビルダー（`build*Html` 系。印刷とPDF保存で同じHTMLを共有）:
- `buildReportHtml` / `buildFacilitySalesHtml` / `buildFacilityOrderHtml` / `buildQuoteHtml` /
  `buildDocInternalHtml` / `buildSalesSearchHtml` / `buildPriceRevisionHtml` / `buildPriceRevisionInternalHtml` /
  `buildPriceCheckListHtml`

画面（View）コンポーネント: `DashboardView` / `FacilitiesView` / `FacilityTrendView` / `RepsView` /
`ProductsView` / `StockView`（適正在庫） / `ImportView` / `PriceRevisionView` / `PriceCheckListPanel` /
`DocComposer`（発注書・見積書共通） / `SettingsView` / `SalesLookupView`(`SalesSearchPanel`) / `TargetsView`

## データ永続化（すべて localStorage、CDN・サーバー通信なし）

- `taiyo_uriage_rows_v1` — 明細行
- `taiyo_uriage_masters_v1` — 分類/扱い/学習ルール/設定などのマスタ
- `taiyo_uriage_meta_v1` — メタ情報
- `taiyo_uriage_docs_v1` — 保存済み発注書・見積書
- 保存は `useDebouncedSave`（500msデバウンス）。作成中の下書き（`orderDraft`/`quoteDraft`等）もリロードで消えないよう対象に含める。

## 必ず守る実装パターン（過去の不具合修正から確立）

- **数値入力欄は `onFocus={e => e.target.select()}` を必須**にする。既存値（特に`0`）の後ろに数字が
  追記されて誤った値になる事故を防ぐため。新しい数値`<input>`を追加するときは必ず付与する。
- **テキスト入力の候補提示に `<datalist>` を使わない**。ブラウザ実装依存で位置がずれる（埋め込みビュー環境で顕著）。
  施設別検索・`DocComposer`と同じ「絶対配置divの自作候補リスト」方式に統一する。
- **印刷/PDF帳票を変更したら、印刷プレビューを開閉しても他の画面状態（タブ・選択中の施設・期間選択等）が
  変わらないことを確認する。** 過去に「印刷プレビューを閉じるとホーム画面に戻る」不具合があった（開閉用state
  が他の表示状態と結合していたため）。
- **帳票のtable行を増減・列を増減したら、`colspan`の再計算を確認する。** 空白行や合計行のcolspanズレによる
  不具合が複数回発生している。
- **`<input type="number">` のスピンボタンはCSSで非表示にする**（プロジェクト全体の既定）。
- 数量欄など「編集不可で空欄固定表示」の項目と「編集可能」の項目を混在させる帳票（発注書=数量空欄・単価固定、
  見積書=編集可）があるため、既存の類似帳票をコピーする際は編集可否の仕様が同じとは限らない点に注意する。
- CSV列名・日付書式は外部の販売管理システム側の仕様変更で予告なく変わる。列名マッピングは
  「1キーにつき候補配列」（例: `['担当者','営業担当名','営業担当','担当']`）で複数候補に対応し、
  日付パースは年2桁/4桁どちらも許容する（`parseDateStr`）。取込0件・失敗時はまずプレビューモーダルの
  「不正な行の理由」を確認するのが最短の切り分け方。

## 検証の作法

- 新機能・修正は可能な限り実CSV（数千行規模）で検証し、集計値を手計算・独立検算と突き合わせる
  （HANDOFF.mdに過去の検算例あり: 年次/年度/月次の売上合計など）。
- リロード後のスキーマ復元、JSON全削除→インポート復元、対象画面のコンソールエラー0件を確認する。
- `test/parseDateStr.test.mjs` のような日付パースの単体テストは、実装（`DATE_RE`等）を変更したら
  必ずテストケースを追随させる（`node --test`）。

## デプロイ

- GitHub Pages: リポジトリ `main` ブランチ直下の `index.html` を配信
  （公開URL: https://akamar08taiyo-bot.github.io/taiyo-uriage-bunseki/）。
- 更新手順: コード変更 → `cd build && node build.js` → 動作確認 → ルート`index.html`をコミット・push
  （1〜3分で反映）。`src/index.html` も同時にコミットすること。

## 参考

- 機能追加・仕様変更の経緯や詳細な設計判断は `HANDOFF.md` を参照。
- 再発防止のための不具合パターン集は `Learnings.md` を参照。タスク完了時にはそこへの追記を検討する。
