// 月途中の比較を「進捗率」で出すことのテスト。
//
// 今月を含む期間は締まっておらず、売上は取り込んだ最終売上日までしかない。これを締まった前月・前年同月と
// 増減率で比べると、まだ注文が来ていないだけの施設が「減少」「離脱」に見えるため、月途中は
// 「比較先の何％まで来たか」（進捗率）で表す。
//
// このアプリは単一HTMLのため import できない。src/index.html から集計の関数をそのまま取り出して動かす。
// 「今日」で月途中かを決めるので、Date を差し替えて日付を固定する。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8')
const code = src.slice(src.indexOf('const yen = '), src.indexOf('function Segmented('))
const load = (y, mo, d) => {
  class FixedDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(y, mo - 1, d, 10, 0, 0) }
  }
  return new Function('zipSync', 'strToU8', 'Date', code + '\nreturn { periodProgress, progressPct, buildAnalytics }')(
    (files) => files, (s) => s, FixedDate,
  )
}

const masters = {
  customers: {
    '見本の里': { type: 'facility', rep: '見本' },
    '見本の家': { type: 'facility', rep: '見本' },
  },
  catOverrides: {}, catRules: [], settings: {},
}
// [売上番号, 売上日, 顧客, 商品, 数量, 単位, 単価, 金額, 粗利, 仕入先, 原価]
const row = (no, date, name, amt) => [no, date, name, '見本の手袋', 1, '箱', amt, amt, amt * 0.2, '見本商事', amt * 0.8]
const rows = [
  row('1', '2025/10/15', '見本の里', 100000),
  row('2', '2025/10/20', '見本の家', 50000),
  row('3', '2026/9/10', '見本の里', 80000),
  row('4', '2026/9/12', '見本の家', 30000),
  row('5', '2026/10/27', '見本の里', 40000), // 見本の家は10月まだ注文なし
]

test('今月を含む期間は月途中、締まった月は null', () => {
  const { periodProgress } = load(2026, 10, 28)
  const latest = { y: 2026, mo: 10, d: 27, idx: 2026 * 12 + 9 }
  const oct = 2026 * 12 + 9
  assert.deepEqual(periodProgress(oct, oct, latest), { asOf: latest, asOfLabel: '10/27', pace: 87 }) // 27/31日
  assert.equal(periodProgress(oct - 1, oct - 1, latest), null) // 9月は締まっている
  // 年度（4月〜翌3月）は 6ヶ月＋27/31 が経過
  assert.equal(periodProgress(2026 * 12 + 3, 2027 * 12 + 2, latest).pace, 57)
  // 今年度累計（4月〜10月）
  assert.equal(periodProgress(2026 * 12 + 3, oct, latest).pace, 98)
})

test('月が替われば、データが月末まで入っていなくても締まった月として扱う', () => {
  const { periodProgress } = load(2026, 11, 2)
  const oct = 2026 * 12 + 9
  assert.equal(periodProgress(oct, oct, { y: 2026, mo: 10, d: 30, idx: oct }), null)
})

test('進捗率は比較先が0以下なら出さない', () => {
  const { progressPct } = load(2026, 10, 28)
  assert.equal(progressPct(40000, 100000), 40)
  assert.equal(progressPct(120000, 100000), 120)
  assert.equal(progressPct(40000, 0), null)
  assert.equal(progressPct(40000, -500), null)
  assert.equal(progressPct(40000, 100000, false), null)
})

test('月途中の基準月：施設・担当の前月比・前年同月比に進捗率が入る', () => {
  const { buildAnalytics } = load(2026, 10, 28)
  const data = buildAnalytics(rows, masters)
  assert.equal(data.baseLabel, '2026年10月')
  assert.equal(data.progress.asOfLabel, '10/27')
  assert.equal(data.progress.pace, 87)
  assert.ok(data.fyProgress)
  const sato = data.facByName.get('見本の里'), ie = data.facByName.get('見本の家')
  assert.equal(sato.yoyProg, 40) // 40,000 ÷ 前年10月 100,000
  assert.equal(sato.momProg, 50) // 40,000 ÷ 9月 80,000
  assert.equal(ie.yoyProg, 0) // まだ注文がないだけ（増減率なら -100%）
  assert.equal(ie.yoyPct, -100)
  const rep = data.reps.find(r => r.rep === '見本')
  assert.equal(rep.yoyProg, 27) // 40,000 ÷ 150,000
  assert.equal(rep.momProg, 36) // 40,000 ÷ 110,000
})

test('締まった基準月では progress は null（従来どおり増減率で表示）', () => {
  const { buildAnalytics } = load(2026, 11, 2)
  const data = buildAnalytics(rows, masters)
  assert.equal(data.progress, null)
  assert.equal(data.fyProgress, null)
  assert.equal(data.facByName.get('見本の里').yoyPct, -60)
})
