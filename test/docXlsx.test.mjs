// 見積書・発注書の Excel 保存（buildDocXlsx）が、印刷と同じ金額・同じ中身になることのテスト。
//
// このアプリは単一HTMLのため import できない。写しを置くと本体を直したときにずれるので、
// src/index.html から帳票の関数（印刷の HTML と Excel）をそのまま取り出して動かす。
// zip は作らず（zipSync を差し替え）、xlsx の中の XML をそのまま調べる。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8')
const code = src.slice(src.indexOf('const yen = '), src.indexOf('function Segmented('))
const { buildDocXlsx, buildQuoteHtml, buildPriceRevisionXlsx, buildPriceRevisionHtml } = new Function('zipSync', 'strToU8',
  code + '\nreturn { buildDocXlsx, buildQuoteHtml, buildPriceRevisionXlsx, buildPriceRevisionHtml }')(
  (files) => files, // zip にせず、パート名 → XML の文字列のまま返す
  (s) => s,
)

const items = [
  { name: 'ニトリル手袋 Mサイズ 100枚入', cat: '手袋', qty: 10, unit: '箱', caseSize: '', price: 680 },
  { isSpacer: true },
  { name: 'とろみ調整食品 2.5kg', cat: '食品', qty: 1.5, unit: '袋', caseSize: '', price: 7200 },
  { name: '尿とりパッド 夜用 30枚', cat: '紙おむつ', qty: '', unit: '袋', caseSize: '', price: 1980 },
]
const quote = (over = {}) => ({
  facilityName: '見本の里', repName: '見本 太郎', items, showPrices: true, showCaseSize: false, showCat: true, showItemNote: false,
  issued: '2026年10月21日', note: '・見本の備考', title: '御　見　積　書', office: '行橋営業所',
  taxIncluded: false, showTotal: true, quoteNo: 'M-20261021-01', ...over,
})
const sheetOf = (files) => files['xl/worksheets/sheet1.xml']
const strings = (files) => [...files['xl/sharedStrings.xml'].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join('|')
// 印刷 HTML の「小計（税抜）」などの金額
const printed = (html, label) => Number(html.split(label)[1].match(/¥([\d,]+)/)[1].replace(/,/g, ''))

test('見積書：小計・消費税（切り捨て）・合計が印刷と同じ値の計算式になる', () => {
  const m = quote()
  const html = buildQuoteHtml(m)
  const xml = sheetOf(buildDocXlsx('quote', m))
  const sub = printed(html, '小計（税抜）'), tax = printed(html, '消費税（10%）'), total = printed(html, '合計（税込）')
  assert.deepEqual([sub, tax, total], [17600, 1760, 19360])
  assert.match(xml, new RegExp(`<f>SUM\\([A-Z]+\\d+:[A-Z]+\\d+\\)</f><v>${sub}</v>`))
  assert.match(xml, new RegExp(`<f>INT\\([A-Z]+\\d+\\*0\\.1\\)</f><v>${tax}</v>`))
  assert.match(xml, new RegExp(`<f>[A-Z]+\\d+\\+[A-Z]+\\d+</f><v>${total}</v>`))
  // 金額＝数量×単価（数量 1.5 は印刷と同じく 2 と表示し、金額は 1.5 で計算）
  assert.match(xml, /<f>N\([A-Z]+\d+\)\*[A-Z]+\d+<\/f><v>10800<\/v>/)
  // 数量が空欄の行は空のセル、金額は 0
  assert.match(xml, /<f>N\([A-Z]+\d+\)\*[A-Z]+\d+<\/f><v>0<\/v>/)
})

test('見積書：消費税は切り捨て（1,999円 → 199円）', () => {
  const m = quote({ items: [{ name: '見本', qty: 1, unit: '個', price: 1999 }] })
  const xml = sheetOf(buildDocXlsx('quote', m))
  assert.match(xml, /<f>INT\([A-Z]+\d+\*0\.1\)<\/f><v>199<\/v>/)
  assert.equal(printed(buildQuoteHtml(m), '消費税（10%）'), 199)
})

test('見積書：御見積金額は税抜なら小計、税込なら合計のセルを参照する', () => {
  for (const taxIncluded of [false, true]) {
    const xml = sheetOf(buildDocXlsx('quote', quote({ taxIncluded })))
    const sumRow = Number(xml.match(/<c r="[A-Z]+(\d+)"[^>]*><f>SUM\(/)[1])
    const target = taxIncluded ? sumRow + 2 : sumRow
    assert.match(xml, new RegExp(`<f>[A-Z]+${target}</f><v>${taxIncluded ? 19360 : 17600}</v>`))
  }
  const off = sheetOf(buildDocXlsx('quote', quote({ showTotal: false })))
  assert.doesNotMatch(off, /SUM\(/) // 合計を出さない設定では小計・合計の行も御見積金額も出さない
})

test('見積書：宛名・発行元・備考が入り、2ページ目以降にも表の見出しが出る', () => {
  const files = buildDocXlsx('quote', quote())
  const s = strings(files)
  for (const t of ['見本の里 ', '御中', '発行日：2026年10月21日', '見積番号：M-20261021-01', '行橋営業所', '担当：見本 太郎', '【備考】', '・見本の備考', '品目', '金額（税抜）']) {
    assert.ok(s.includes(t), t)
  }
  assert.match(files['xl/workbook.xml'], /_xlnm\.Print_Titles/)
  assert.match(sheetOf(files), /paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/)
})

test('発注書：数量は空欄（手書き欄）、A4 1枚に収める、営業所が無くても作れる', () => {
  const order = { ...quote(), title: '発　注　書', showPrices: false, items: items.map(it => ({ ...it, qty: '' })) }
  const files = buildDocXlsx('order', order)
  const xml = sheetOf(files)
  assert.match(xml, /fitToWidth="1" fitToHeight="1"/)
  assert.doesNotMatch(xml, /<f>/) // 金額を出さない発注書には計算式がない
  const s = strings(files)
  for (const t of ['太陽シルバーサービス株式会社　行橋営業所 ', '発注元', '見本の里', 'ご担当者：', '商品名']) assert.ok(s.includes(t), t)
  assert.doesNotThrow(() => buildDocXlsx('order', { ...order, office: null }))
  assert.doesNotThrow(() => buildDocXlsx('quote', quote({ office: null })))
})

// ---- 価格改定のご案内 ----
const revItems = [
  { name: 'ニトリル手袋 Mサイズ 100枚入', cat: '手袋', unit: '箱', caseSize: '20', currentPrice: 680, newPrice: 720 },  // 上げ
  { name: 'とろみ調整食品 2.5kg', cat: '食品', unit: '袋', caseSize: '', currentPrice: 7200, newPrice: 6900 },        // 下げ
  { name: '尿とりパッド 夜用 30枚', cat: '紙おむつ', unit: '袋', caseSize: '', currentPrice: 1980, newPrice: 1980 },   // 据え置き
  { name: '新規取扱の見本', cat: 'その他', unit: '個', caseSize: '', currentPrice: 0, newPrice: 500 },                 // 現状価格なし
]
const rev = (over = {}) => ({
  facilityName: '見本の里', title: '価格改定のご案内', issued: '2026年10月28日', note: '2026年11月1日〜の改定価格となります。\n・見本の備考',
  items: revItems, office: '行橋営業所', repName: '見本 太郎',
  showCaseSize: false, showAmounts: true, showRate: true, showCat: true, showDiff: true, ...over,
})

test('価格改定：価格差・変動率は計算式で、値は印刷と同じ。現状価格0の変動率は「―」', () => {
  const m = rev()
  const html = buildPriceRevisionHtml(m)
  for (const t of ['+¥40', '−¥300', '+5.9%', '−4.2%']) assert.ok(html.includes(t), '印刷 ' + t)
  const files = buildPriceRevisionXlsx(m)
  const xml = sheetOf(files)
  assert.match(xml, /<f>[A-Z]+\d+-[A-Z]+\d+<\/f><v>40<\/v>/)
  assert.match(xml, /<f>[A-Z]+\d+-[A-Z]+\d+<\/f><v>-300<\/v>/)
  assert.match(xml, /<f>[A-Z]+\d+-[A-Z]+\d+<\/f><v>0<\/v>/)
  const rate = [...xml.matchAll(/<f>\(([A-Z]+\d+)-([A-Z]+\d+)\)\/([A-Z]+\d+)<\/f><v>([^<]+)<\/v>/g)]
  assert.equal(rate.length, 3) // 現状価格0の行は計算式にしない
  assert.equal(Math.round(Number(rate[0][4]) * 1000) / 10, 5.9)
  assert.equal(Math.round(Number(rate[1][4]) * 1000) / 10, -4.2)
  assert.equal(rate[0][2], rate[0][3]) // 分母は現状価格のセル
  assert.ok(strings(files).includes('―'))
  // 上げ・下げ・差なしの表示形式（+／−／―）が登録されている
  assert.ok(files['xl/styles.xml'].includes('formatCode="&quot;+¥&quot;#,##0;&quot;−¥&quot;#,##0;&quot;―&quot;"'))
  assert.ok(files['xl/styles.xml'].includes('formatCode="&quot;+&quot;0.0%;&quot;−&quot;0.0%;&quot;―&quot;"'))
})

test('価格改定：宛名・発行元・備考・見出しが入り、A4 縦で2ページ目以降にも表の見出しが出る', () => {
  const files = buildPriceRevisionXlsx(rev())
  const s = strings(files)
  for (const t of ['見本の里 ', '御中', '発行日：2026年10月28日', '行橋営業所', '担当：見本 太郎', '【備考】', '・見本の備考',
    'No.', 'カテゴリ', '商品名', '現状価格\n（税抜）', '改定価格\n（税抜）', '価格差', '変動率', '下記のとおり価格を改定いたしますので、ご案内申し上げます。']) {
    assert.ok(s.includes(t), t)
  }
  assert.ok(!s.includes('入数')) // 入数は既定で出さない（印刷と同じ）
  assert.match(files['xl/workbook.xml'], /<sheet name="価格改定"/)
  assert.match(files['xl/workbook.xml'], /_xlnm\.Print_Titles/)
  assert.match(sheetOf(files), /paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/)
})

test('価格改定：金額を出さない設定では価格の列も計算式もない。宛先・営業所・備考が空でも作れる', () => {
  const files = buildPriceRevisionXlsx(rev({ showAmounts: false, showCaseSize: true, showCat: false }))
  const s = strings(files)
  assert.doesNotMatch(sheetOf(files), /<f>/)
  for (const t of ['現状価格\n（税抜）', '改定価格\n（税抜）', '価格差', '変動率', 'カテゴリ']) assert.ok(!s.includes(t), t)
  assert.ok(s.includes('入数'))
  assert.doesNotThrow(() => buildPriceRevisionXlsx(rev({ facilityName: '', office: null, note: '', repName: '' })))
  // 価格差だけ消す・変動率だけ消す
  assert.ok(!strings(buildPriceRevisionXlsx(rev({ showDiff: false }))).includes('価格差'))
  assert.ok(!strings(buildPriceRevisionXlsx(rev({ showRate: false }))).includes('変動率'))
})
