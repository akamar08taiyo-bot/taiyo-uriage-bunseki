// 指示書 UR-02 の受入条件をテスト化したもの。
// 「非閏年2月29日、2月30日・31日、4月31日は拒否し、閏年2月29日は受理する」
//
// このアプリは単一HTMLのため import できない。src/index.html の parseDateStr と
// 同じ実装をここに写し、判定ロジックの回帰を検出する。
// src/index.html 側を変更したときは、この写しも必ず同時に更新すること。

import test from 'node:test'
import assert from 'node:assert/strict'

const DATE_RE = /^(\d{2,4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/

const isRealDate = (y, mo, d) => {
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === mo && probe.getUTCDate() === d
}

const parseDateStr = (s) => {
  const key = String(s ?? '')
  const m = DATE_RE.exec(key.trim())
  if (!m) return null
  let y = +m[1]
  if (m[1].length === 2) y += (y <= 68 ? 2000 : 1900)
  const mo = +m[2], d = +m[3]
  if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && isRealDate(y, mo, d)) {
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
  const v = parseDateStr('2028/2/29')
  assert.ok(v)
  assert.deepEqual({ y: v.y, mo: v.mo, d: v.d }, { y: 2028, mo: 2, d: 29 })
  assert.equal(parseDateStr('2024/2/29').sort, 20240229)
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
  assert.equal(parseDateStr('2101/1/1'), null) // 2100年超は対象外
})
