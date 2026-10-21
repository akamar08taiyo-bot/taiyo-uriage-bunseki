---
name: taiyo-uriage-bunseki-app
description: 太陽シルバーサービスの業務アプリ「消耗品売上管理」（画面の名前は売上分析ダッシュボード。リポジトリ akamar08taiyo-bot/taiyo-uriage-bunseki、公開は https://akamar08taiyo-bot.github.io/taiyo-uriage-bunseki/ 、太陽ポータルのタイル）を直す・機能を足す・公開するときに必ず使う。販売管理システムの売上照会 CSV（Shift-JIS）の取り込み、施設別・施設別推移・担当別・商品の集計、ダッシュボード、適正在庫、発注書作成・見積書作成（印刷・PDF保存・Excel保存）、価格改定、ターゲット先進捗確認、レポート、営業所の設定の話が出たら、アプリ名を言われなくても使う。1ファイルの src/index.html を直して build/ でビルドする手順、印刷と Excel を同じデータから作る仕組み、テスト（npm test）、Excel の落とし穴、公開とデプロイの確かめ方がまとまっている。見積・提案書作成（taiyo-mitsumori）・チラシ作成（消耗品）の御見積書とは別のアプリ。
---

# 消耗品売上管理（taiyo-uriage-bunseki）

販売管理システムの「売上照会」CSV（Shift-JIS）を取り込み、施設別・商品別・担当別に集計し、施設あての発注書・見積書などの帳票を作るアプリ。
使うのは営業所の担当営業（パソコンとスマホ）。依頼してくるのは行橋営業所の担当者（プログラマーではない）。データはブラウザの localStorage だけ（サーバーなし）。
このスキルは 2026年10月のセッション（見積書・発注書を Excel でも保存できるようにした）までの知識をまとめたもの。

ポータル全体に共通のこと（公開の流れ・ユーザーの好み・報告のしかた）は `taiyo-portal` スキル、Excel の作り方と確かめ方の詳しいことは `taiyo-excel-export` スキルにある（入っていれば一緒に読む）。

## まず全体をつかむ

| もの | 場所 |
|---|---|
| ソース | `akamar08taiyo-bot/taiyo-uriage-bunseki`（main）の `src/index.html`（約7,500行の1ファイル。React 18 の JSX が `<script type="text/babel">` の中）。**直すのはここ** |
| ビルド | `build/`（`build.js`・`package.json`）。esbuild（es2017）で JSX と依存（react・lucide-react・jspdf・html2canvas・fflate）をまとめ、Tailwind 3 を入れ、ルートの `index.html`（約1.4MB、CDN なし）を書く |
| テスト | ルートの `package.json` はテストのためだけ：`npm test`（`node --test "test/**/*.test.mjs"`。npm install は不要） |
| 記録 | `HANDOFF.md`（変更の記録。README はない。古い記述＝約3,100行・Windows の環境のこと＝もある）。変えたらここに足す |
| 公開 | main に push → GitHub Pages（main のルート）。ポータルのタイル `name:'消耗品売上管理'` はこの URL を開くだけ（ポータルにはコピーしない） |

名前がいくつかある：ポータルのタイル「消耗品売上管理」、`<title>`「売上分析ダッシュボード - 太陽シルバーサービス」、リポジトリ・HANDOFF.md「売上分析」。

## 画面と帳票

- タブ（`const TABS`。名前は設定の `settings.tabLabels` で変えられる）：ダッシュボード／施設別／施設別推移／担当別／売上管理・商品検索（売上検索・価格確認リスト・分類別サマリー・ランキング・売れ筋・停滞・粗利率チェック）／
  適正在庫／発注書作成／見積書作成／価格改定／ターゲット先進捗確認／データ取込／設定。
- 営業所マスタ19拠点を内蔵。初めて開くと営業所を選ぶ（OfficePicker）。ポータルにログイン済みなら `taiyo_portal_session` の営業所を使う（同じサイト）。
- 帳票（印刷 HTML）：`buildReportHtml`・`buildFacilitySalesHtml`・`buildFacilityOrderHtml`（発注書）・`buildQuoteHtml`（御見積書）・`buildDocInternalHtml`（社内用。仕入・粗利入りで社外秘）・
  `buildSalesSearchHtml`・`buildPriceRevisionHtml`・`buildPriceRevisionInternalHtml`・`buildPriceCheckListHtml`。**Excel で保存できるのは見積書・発注書だけ**（`buildDocXlsx`）。
- 発注書：施設から当社（太陽シルバーサービス株式会社＋営業所 御中）への注文書を担当営業が代わりに作るもの。数量は空欄（施設が手書き）、合計なし、単価は既定で出さない（showPrices=false）、
  「発注日：（ご記入ください）」と発注元の枠（施設名・住所/TEL/FAX は任意・ご担当者）。A4 1枚に縮める（`data-fit-page`）。
- 見積書：金額は常に出す。御見積金額は税抜なら小計、`taxIncluded` なら合計。合計欄は `showTotal`（既定オフ）。見積番号 `M-YYYYMMDD-01`、有効期限30日。消費税 10% は**切り捨て**。

## 印刷・PDF・Excel は同じデータから

`DocComposer` の `docModel()` が1つの `m` を作り、
印刷 `buildHtml`（`buildQuoteHtml`／`buildFacilityOrderHtml`）・PDF `handlePdf` → `exportPdf(buildHtml(), docFileName('.pdf'))`・Excel `handleExcel` → `downloadText(docFileName('.xlsx'), buildDocXlsx(docType, docModel()), XL_MIME)` に分かれる。
**帳票の HTML を変えたら `buildDocXlsx` も同じに直す。** ファイル名は `御見積書_施設名_YYYY-MM-DD.xlsx`・`発注書_施設名_YYYY-MM-DD.xlsx`（PDF と同じで拡張子だけ）。ボタンは「PDF保存」の右の「Excel保存」。
印刷の流れ：`openPrint(html)` → プレビュー（contenteditable）→「印刷する」→ `syncPrintHolder` → `window.print()`。**プレビューで手で直した文字は PDF・Excel には入らない。**

## Excel 出力（`src/index.html` の Excel の部分。`XL_MINCHO` などで探す）

- `XL_MINCHO='BIZ UDP明朝 Medium'`・`XL_YEN='"¥"#,##0;"¥"-#,##0'`・`xlEsc`・`xlRef`・`xlNum`（15桁）・`xlColWidth`・字の幅 `XL_ASCII_EM`／`xlTextEm`・`xlLineCount`（使える幅＝(幅−4mm)×0.93）・
  `createXlsxBook()`（style・addSheet＝setCols／height≤409pt／cell／box・toBytes＝Print_Area・Print_Titles・`fullCalcOnLoad`・`[Content_Types].xml` を先頭に `zipSync(…,{level:6})`）・`xlLetterSpace`・`buildDocXlsx(kind, m)`。
- 頭の部分（題名・宛名・御見積金額・右の枠）は印刷と同じ位置（横 mm：本文幅 W=184・右の枠 70mm、縦 pt）に置き、表の列の境目（優先。2mm 以内はまとめる）と頭の部分の境目（1pt 以内）から行・列を作って結合する。
  列の割合（％）は印刷の colgroup と同じ：見積書はカテゴリ14・入数9・数量10・単位8・単価14・金額16、発注書はカテゴリ15・入数9・数量11・単位8・単価13（出さない列は 0）、残りが品名。
- 式（どれもキャッシュ値つき）：金額 `N(数量)*単価`、小計 `SUM`、消費税 `INT(小計*0.1)`、合計 小計＋消費税、御見積金額 小計か合計のセル。
- 印刷設定：A4縦、余白 左右13mm・上下14mm（印刷の padding と同じ）、横1ページ。見積書は表の見出しを各ページに繰り返し、発注書は `fitToHeight=1`。

## ユーザーの好み（このアプリ）

- Excel：「Excel ベースで印刷できるように」「字は一番近いもの」→ 印刷と同じ中身・同じ形、書体は BIZ UDP明朝 Medium、金額は式、そのまま A4 で印刷できる。
- HANDOFF.md の決まり：入力の候補に `<datalist>` を使わず自作の候補リスト（例外：DocComposer・価格改定・ターゲット先の「担当」欄は datalist のまま）、印刷プレビューを開け閉めしてもタブ・選択を変えない、数字の入力欄の上下矢印は出さない。
- 実データ（売上 CSV。`_testdata.csv` は .gitignore）は入れない。見本は架空の名前（見本の里・見本 太郎）。
- コミットは日本語の件名と、何を・なぜ・どう確かめたかの本文。変更の記録は HANDOFF.md に足す。

## 落とし穴

1. 施設名の行の折り返し：`xlLineCount` だけだと行を多く見積もり、印刷では1行なのに折り返した → 文字の幅で測り、`toTextW > RX − 4` のときだけ折り返し、行数は `ceil(toTextW/((RX−10)×0.93))`。
2. 折り返すときは、右の 10mm（印刷の padding-right）に下の罫線だけのセルを別に置いて下線を延ばす。
3. **Excel のインデントは横位置（h:'left' か 'right'）を指定しないと効かない。**
4. 題名の字間（0.5em）：BIZ UDP明朝の全角スペースは 0.667em → 「　」を「全角2つ＋半角1つ」、字と字の間には半角。
5. 備考の行間：1つのセルにまとめると合わない → 1行ずつ別の行、高さは n×15.2pt。
6. 数量 1.5 は「2」と表示され、金額は 1.5 で計算（印刷と同じ）。消費税の `Math.floor(n*0.1)` と Excel の `INT` は 2,000万まで一致を確かめた。
7. `npm install fflate --save` で `build/package-lock.json` の `"name": "build"` が消えた → 手で戻した。依存を足すときはロックファイルの差分を見る。
8. ビルドした `index.html` では日本語が `\uXXXX`（大文字）になる。grep はその形で。
9. `parseDateStr.test.mjs` は実装の**写し**を持っている。src を直したら写しも直す。`docXlsx.test.mjs` は src の `const yen = ` から `function Segmented(` までを new Function で動かすので、帳票の関数はこの範囲に置き、そこに JSX を書かない。
10. `xlEsc` の正規表現に U+FFFE・U+FFFF が文字そのもので入っている（動くが、直すなら `\uFFFE\uFFFF` とエスケープで書く）。
11. ヘッドレスの Chromium は日本語のダウンロード名が「download」になる → `LANG=C.UTF-8 LC_ALL=C.UTF-8`。
12. 頭の部分の行の境目をまとめる幅は 1pt のまま（`buildDocXlsx` の「縦 1pt 未満」）。チラシ作成ではこの幅で結合セルが重なった → 頭の部分を変えたら `validate.py` の結合の検査を必ず。

## これから（2026-10-21 の時点）

- Excel 保存（見積書・発注書）は公開済み（a3b3254）。ポータルのタイルの使い方の文には「Excel保存」がまだない。
- Excel は見積書・発注書だけ（価格改定・社内用・レポート・価格確認リストはない）。広げるかは聞いていない。
- 本物の Excel ではまだ開いていない（会社の Excel で見本を開いてもらうよう頼んだが返事はない）。
- 見積書の「表題」欄は印刷・Excel に効かない（『御　見　積　書』で固定。効くのは社内用だけ）。TABS の説明文に廃止したアラートの文が残っている。
- ボタンの色（保存・PDF・印刷が濃い色）を、住宅改修で言われた控えめな色にそろえるかは未定（頼まれたら）。
- 開いたままの PR #1（2026-09-29、`claude/app-comprehensive-debug-c9srvh`）と、main に入っていない古いブランチがある。扱いは未定（触る前に中身を見る）。

詳しい手順は `references/build-test-publish.md`。
