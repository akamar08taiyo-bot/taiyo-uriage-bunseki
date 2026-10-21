# ビルド・テスト・確かめ方・公開（消耗品売上管理）

## 1. 用意

新しいセッションでは、リポジトリを足して clone する（`add_repo`（access "push"）→ `git clone --depth 1 https://github.com/akamar08taiyo-bot/taiyo-uriage-bunseki /home/user/taiyo-uriage-bunseki` → `register_repo_root`）。
浅い clone なので `git log` は少ない。履歴は GitHub MCP の `list_commits` で読める。作業の前に `git fetch` して、ほかのセッションの push を見る。

## 2. ビルドとテスト

```sh
cd /home/user/taiyo-uriage-bunseki
npm test                          # 単体テスト（13件。npm install は不要）。1つだけなら node --test test/docXlsx.test.mjs
cd build && npm ci && node build.js   # ルートの index.html を作り直す（npm ci はロックファイルを変えない。node_modules は .gitignore）
```

- 変えていない src から作り直すと `index.html` の差分は 0 になる（なれば依存の版が動いていない）。
- `docXlsx.test.mjs`：src の `const yen = ` から `function Segmented(` までを取り出して動かし、zipSync・strToU8 を差し替えて XML を調べる（印刷の金額と Excel の式・値を比べる）。

## 3. ブラウザで確かめる

- ビルドのあと、リポジトリ直下で `python3 -m http.server 5611 --bind 127.0.0.1`。
- Playwright（`/opt/node-tools/node_modules/playwright/index.mjs`）で開き、`addInitScript` で架空のデータを入れる：
  `taiyo_uriage_masters_v1` の `settings.office`（営業所名。`defaultMasters()` の形に合わせ、営業所の一覧にある名前）と、下書き `taiyo_uriage_draft_quote_v1`・`taiyo_uriage_draft_order_v1`
  （`DocComposer` が読む形。いちばん確かなのは、画面で1件打ってから `localStorage` の中身を写して見本にすること）。
  見積書作成・発注書作成のタブ →「Excel保存」→ ダウンロードのファイル名とお知らせ「Excelを保存しました」を確かめる。
- 起動は `chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}})`（日本語のダウンロード名）。幅は 1366×900 と 390×844、コンソールのエラーは 0。

## 4. Excel を確かめる（`taiyo-excel-export` スキルの scripts）

1. 見本を作る：テストと同じ取り出し方で、本物の fflate（`build/node_modules/fflate/esm/index.mjs`）を使って、印刷 HTML と xlsx を何通りか作る
   （長い施設名・営業所なし・42行・税込・合計なし）。
2. XSD の検査（ECMA-376）と、結合の重なり・結合の中の値・行の高さ 409pt 超：`validate.py` → ALL VALID / EXCEL CHECKS OK。
3. LibreOffice の UNO で式を計算し直し、キャッシュ値と比べる：`recalc.py`（2026-10 は 25式でずれ 0）。
4. 見た目：印刷 HTML → Playwright の `page.pdf`（A4・余白0・背景あり）、xlsx → `soffice --headless --convert-to pdf`、PDF → `pdftoppm -r 80 -png` で画像にし、左右に並べて見る（ページ数は `pdfinfo`）。
5. ユーザーに、架空のデータの見本の xlsx と、印刷と並べた画像を送り、会社の Excel で開いてもらう。

## 5. 公開（main → GitHub Pages）

- **main への push は本番の公開。** ユーザーの「公開して」のあとで。作業環境の安全確認で止められたら回り道をしない。
- `src/index.html` とビルドしたルートの `index.html` を**同じコミット**に入れる（ほかに test・HANDOFF.md・`build/package*.json` を変えたらそれも）。ファイル名を挙げて `git add`（`git add -A` は使わない）。
- `git push -u origin main`。
- デプロイの確かめ：github.io はこの作業環境から見えない（curl は 403）。GitHub MCP の `actions_list`（`list_workflow_runs`、owner `akamar08taiyo-bot`、repo `taiyo-uriage-bunseki`、perPage 3）で、
  自分の head_sha の「pages build and deployment」が completed／success になるのを見る（約45秒）。走っている間は `actions_get`（`get_workflow_run`）。
- 新しい機能をユーザーに知らせるときは、ポータルのタイル（`taiyo-portal/index.html` の `name:'消耗品売上管理'` の usage）も直す（`taiyo-portal` スキル）。
