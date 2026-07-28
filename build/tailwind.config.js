/** @type {import('tailwindcss').Config} */
// 売上分析アプリ用：ソース ../src/index.html を走査して使用クラスのみを静的生成し、
// cdn.tailwindcss.com（外部CDN）依存をなくす。
module.exports = {
  content: ['../src/index.html'],
  theme: { extend: {} },
  safelist: [],
  corePlugins: { preflight: true },
};
