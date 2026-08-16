// 指示書 UR-02 の受入条件をテスト化したもの。
// 「非閏年2月29日、2月30日・31日、4月31日は拒否し、閏年2月29日は受理する」
//
// このアプリは単一HTMLのため import できない。src/index.html の parseDateStr と
// 同じ実装をここに写し、判定ロジックの回帰を検出する。
// src/index.html 側を変更したときは、この写しも必ず同時に更新すること。

import test from 'node:test'
import assert from 'node:assert/strict'

// 区切りは / - . 年月 を許容（販売管理システムが「2026.7.3」形式を出すことがある）
const DATE_RE = /^(\d{2,4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/

const isRealDate = (y, mo, d) => {
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === mo && probe.getUTCDate() === d
}

const todayParts = () => { const t = new Date(); return { y: t.getFullYear(), mo: t.getMonth() + 1, d: t.getDate() } }

const parseDateStr = (s) => {
  const key = String(s ?? '')
  // NFKC で全角数字・全角スラッシュ（２０２６／７／３）も受け付ける
  const m = DATE_RE.exec(key.normalize('NFKC').trim())
  if (!m) return null
  let y = +m[1]
  if (m[1].length === 2) y += (y <= 68 ? 2000 : 1900)
  const mo = +m[2], d = +m[3]
  // 未来日は翌年まで。2026→2062 の打ち間違いを取り込むと基準月が飛び集計が壊れる
  const maxY = todayParts().y + 1
  if (y >= 2000 && y <= maxY && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && isRealDate(y, mo, d)) {
    return { y, mo, d, idx: y * 12 + mo - 1, sort: y * 10000 + mo * 100 + d }
  }
  return null
}

test('存在しない日付を売上日として取り込まない', () => {
  assert.equal(parseDateStr('2026/2/31'), null)
  assert.equal(parseDateStr('2026/2/30'), null)
  assert.equal(parseDateStr('2026/2/29'), null) // 2026年はうるう年ではない
  assert.equal(parseDateStr('2026/4/31'), null)
  assert.equal(parseDateStr('2026/6/31'), null)
  assert.equal(parseDateStr('2026/9/31'), null)
  assert.equal(parseDateStr('2026/11/31'), null)
})

test('うるう年の2月29日は受理する', () => {
  // 未来日ガード（翌年まで）があるため、検証には過去のうるう年を使う。
  // 売上データに数年先の日付が来ることはなく、来た場合は打ち間違いとして弾く仕様。
  const v = parseDateStr('2024/2/29')
  assert.ok(v)
  assert.deepEqual({ y: v.y, mo: v.mo, d: v.d }, { y: 2024, mo: 2, d: 29 })
  assert.equal(parseDateStr('2024/2/29').sort, 20240229)
  assert.equal(parseDateStr('2020/2/29').sort, 20200229)
})

test('通常の日付を受理し、並び順の値を正しく作る', () => {
  assert.equal(parseDateStr('2026/8/14').sort, 20260814)
  assert.equal(parseDateStr('2026-08-14').sort, 20260814)
  assert.equal(parseDateStr('2026年8月14日').sort, 20260814)
  assert.equal(parseDateStr('2026/12/31').sort, 20261231)
})

test('2桁年の表記に対応する', () => {
  assert.equal(parseDateStr('26/07/31').y, 2026)
  assert.equal(parseDateStr('26/2/31'), null) // 2桁年でも存在しない日付は拒否
})

test('月インデックスは年度集計と整合する', () => {
  const apr = parseDateStr('2026/4/1')
  const mar = parseDateStr('2027/3/31')
  assert.equal(mar.idx - apr.idx, 11) // 同一年度内で11ヶ月差
})

test('日付として読めないものは null', () => {
  assert.equal(parseDateStr(''), null)
  assert.equal(parseDateStr(null), null)
  assert.equal(parseDateStr('未定'), null)
  assert.equal(parseDateStr('1999/1/1'), null) // 2000年未満は対象外
  assert.equal(parseDateStr('2101/1/1'), null) // 未来すぎる年は対象外
})

test('全角表記とドット区切りを受理する', () => {
  // 販売管理システムの出力形式が変わっても取り込めなくならないようにする
  assert.equal(parseDateStr('２０２６／７／３').sort, 20260703)  // 全角数字＋全角スラッシュ
  assert.equal(parseDateStr('2026.7.3').sort, 20260703)          // ドット区切り
  assert.equal(parseDateStr('２０２６年７月３日').sort, 20260703)
})

test('遠い未来の日付は取り込まない', () => {
  // 2026→2062 のような打ち間違いが1行でもあると、その行が最新月と判定されて
  // 基準月が飛び、ダッシュボードの数字が軒並み¥0になる
  const thisYear = todayParts().y
  assert.equal(parseDateStr((thisYear + 36) + '/7/31'), null)
  assert.equal(parseDateStr((thisYear + 2) + '/1/1'), null)
  // 翌年までは正常な前倒し計上として受理する
  assert.ok(parseDateStr((thisYear + 1) + '/1/1'))
  assert.ok(parseDateStr(thisYear + '/1/1'))
})
