// JSX を事前コンパイル＋全依存をバンドルして単一HTMLに同梱するビルドスクリプト
// 入力: ../src/index.html (text/babel ブロックを含む)
// 出力: ../index.html (text/babel → type=module + 依存込み圧縮JS)
// 目的: 外部CDNに依存せず、ファイルを開くだけで必ず起動する。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

const SRC = process.argv[2] || path.join(__dirname, '..', 'src', 'index.html');
const DST = process.argv[3] || path.join(__dirname, '..', 'index.html');

(async () => {
  const html = fs.readFileSync(SRC, 'utf8');

  // --- Tailwind CSS をソースから静的生成（cdn.tailwindcss.com 依存を排除） ---
  console.log('Tailwind CSS 生成中…');
  execSync('npx tailwindcss -c tailwind.config.js -i tailwind.input.css -o tailwind.output.css --minify', { cwd: __dirname, stdio: 'pipe' });
  const tailwindCss = fs.readFileSync(path.join(__dirname, 'tailwind.output.css'), 'utf8');
  console.log(`Tailwind CSS size: ${tailwindCss.length} bytes (minified)`);

  const re = /(<script type="text\/babel"[^>]*>)([\s\S]*?)(<\/script>)/;
  const m = html.match(re);
  if (!m) { console.error('text/babel script not found'); process.exit(1); }
  const jsx = m[2];
  console.log(`JSX size: ${jsx.length} bytes`);

  // esbuild で JSX をバンドル（react/react-dom/lucide-react を node_modules から解決し全て同梱）
  const result = await esbuild.build({
    stdin: {
      contents: jsx,
      resolveDir: __dirname,
      loader: 'jsx',
      sourcefile: 'app.jsx',
    },
    bundle: true,
    format: 'esm',
    // 古めのブラウザでも構文エラーで落ちないよう es2017 まで下げてビルドする
    target: 'es2017',
    jsx: 'transform',
    minify: true,
    legalComments: 'none',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const code = result.outputFiles[0].text;
  console.log(`Bundled size: ${code.length} bytes (minified, 依存込み)`);

  // 重要: 置換文字列内の `$&` などが特殊解釈されないよう関数形式を使用
  let out = html.replace(m[0], () => `<script type="module">${code}</script>`);

  // --- Tailwind: cdn.tailwindcss.com の <script> を、生成した静的CSSの <style> に置換 ---
  const twTag = '<script src="https://cdn.tailwindcss.com"></script>';
  if (out.includes(twTag)) {
    out = out.replace(twTag, () => `<style id="tailwind">${tailwindCss}</style>`);
  } else {
    console.warn('⚠ 警告: tailwind CDN タグが見つかりませんでした');
  }

  // 同梱検証: CDN参照が残っていないこと
  if (/esm\.sh|unpkg\.com|ga\.jspm\.io/.test(code)) {
    console.warn('⚠ 警告: バンドル後JSにCDN参照が残っています');
  }
  if (/cdn\.tailwindcss\.com/.test(out)) {
    console.warn('⚠ 警告: HTMLにtailwind CDN参照が残っています');
  }

  fs.writeFileSync(DST, out);
  console.log(`Built: ${DST} (${out.length} bytes)`);
})().catch(e => { console.error(e); process.exit(1); });
