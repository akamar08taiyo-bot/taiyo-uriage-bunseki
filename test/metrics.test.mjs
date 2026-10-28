// 「指標の修正案・確認基準」（2026-10-28）の計算ルールと受け入れ条件のテスト。
// 計算確認用の例（第9節）と、受け入れ条件（第10節）のうちデータで確かめられるものを並べている。
//
// このアプリは単一HTMLのため import できない。src/index.html から集計の関数をそのまま取り出して動かす。
// 「今日」で月途中かを決めるので、Date を差し替えて日付を固定する。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8')
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to))
const code = slice('const yen = ', 'function Segmented(') + '\n' + slice('function buyerBreakdown(', 'function BuyersModal(') +
  '\n' + slice('function buildFacilityComparison(', '// KPIカードの施設別内訳')
const NAMES = ['comparisonWindow', 'buildPeriodReport', 'buildAnalytics', 'decomposeSalesChange', 'mergeImportRows',
  'analyzeCsv', 'buyerBreakdown', 'pctChange', 'withinCut', 'buildFacilityComparison', 'autoCategory', 'parseReferral', 'buildReformReport', 'isFacilityBuyer']
const load = (y, mo, d) => {
  class FixedDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(y, mo - 1, d, 10, 0, 0) }
  }
  return new Function('zipSync', 'strToU8', 'Date', code + '\nreturn {' + NAMES.join(',') + '}')((f) => f, (s) => s, FixedDate)
}
const L = load(2026, 10, 28)

const facility = (rep = '見本') => ({ type: 'facility', rep })
const masters = (customers) => ({ customers, catOverrides: {}, catRules: [], settings: {} })
// [売上番号, 売上日, 得意先, 商品, 数量, 単位, 単価, 金額, 粗利額, 仕入先, 仕入単価, 売上時点の担当者]
const row = (no, date, cust, prod, qty, unit, price, amount, gross, cost = null, rep = '') =>
  [no, date, cust, prod, qty, unit, price, amount, gross, '見本商事', cost, rep]
const idx = (y, mo) => y * 12 + mo - 1

test('第9節：売上が増えても粗利が減る例（売上 +1,000円・+10%、粗利 −1,000円・約−33%）', () => {
  const rows = [
    row('1', '2025/9/10', 'A施設', '見本の品', 100, '個', 100, 10000, 3000, 70),
    row('2', '2026/9/10', 'A施設', '見本の品', 100, '個', 110, 11000, 2000, 90),
  ]
  const m = masters({ A施設: facility() })
  const cur = L.buildPeriodReport(rows, m, idx(2026, 9), idx(2026, 9)).kpi
  const prev = L.buildPeriodReport(rows, m, idx(2025, 9), idx(2025, 9)).kpi
  assert.equal(cur.sales - prev.sales, 1000)
  assert.equal(L.pctChange(cur.sales, prev.sales), 10)
  assert.equal(cur.gross - prev.gross, -1000)
  assert.equal(L.pctChange(cur.gross, prev.gross), -33)
  assert.equal(cur.rate, '18.2')
  assert.equal(prev.rate, '30.0')
})

test('第9節：返品・値引きの例（合計 売上5,700円・粗利1,800円・粗利率31.6%、ケースと本は数量を合計しない）', () => {
  const rows = [
    row('1', '2026/9/1', 'A施設', '紙製品', 2, 'ケース', 3000, 6000, 1800, 2100),
    row('2', '2026/9/2', 'A施設', '洗剤', 3, '本', 900, 2700, 900, 600),
    row('3', '2026/9/5', 'A施設', '紙製品', -1, 'ケース', 3000, -3000, -900, 2100),
  ]
  const k = L.buildPeriodReport(rows, masters({ A施設: facility() }), idx(2026, 9), idx(2026, 9)).kpi
  assert.equal(k.sales, 5700)
  assert.equal(k.gross, 1800)
  assert.equal(k.rate, '31.6')
  assert.equal(k.returnAmt, -3000)
  assert.equal(k.returnCount, 1)
})

test('第9節：継続購入率の例（A・B・C → B・C・D は 2/3 ＝ 66.7%）', () => {
  const cust = (names) => names.map(name => ({ name, type: 'facility', sales: 1000, gross: 100 }))
  const b = L.buyerBreakdown(cust(['B', 'C', 'D']), cust(['A', 'B', 'C']), new Map([['D', 20260905]]), 20260901)
  assert.deepEqual(b.both.map(c => c.name), ['B', 'C'])
  assert.deepEqual(b.curOnly.map(c => c.name), ['D'])
  assert.deepEqual(b.prevOnly.map(c => c.name), ['A'])
  assert.equal(b.rate, 66.7)
  // D は取り込んだ明細の中で最初の購入が当期にある（それ以前の履歴が取り込まれていれば新規と判断できる）
  assert.deepEqual(b.firstInData.map(c => c.name), ['D'])  // 個人（facilityBuyer:false や type:person）は比べない
  const withPersons = [...cust(['B', 'C', 'D']), { name: '築上町包括　水ノ江', type: 'facility', facilityBuyer: false, sales: 500 }, { name: '見本 花子', type: 'person', sales: 300 }]
  const b2 = L.buyerBreakdown(withPersons, [...cust(['A', 'B', 'C']), { name: '見本 花子', type: 'person', sales: 300 }], new Map(), 20260901)
  assert.deepEqual([b2.curB.length, b2.prevB.length, b2.curOnly.map(c => c.name).join(), b2.prevOnly.map(c => c.name).join()], [3, 3, 'D', 'A'])
})

test('粗利率は合計粗利÷合計売上（商品別の粗利率を単純平均しない）', () => {
  const rows = [
    row('1', '2026/9/1', 'A施設', '高粗利品', 1, '個', 1000, 1000, 500),
    row('2', '2026/9/1', 'A施設', '低粗利品', 1, '個', 9000, 9000, 900),
  ]
  const k = L.buildPeriodReport(rows, masters({ A施設: facility() }), idx(2026, 9), idx(2026, 9)).kpi
  assert.equal(k.rate, '14.0') // 単純平均なら 30.0%
})

test('月途中は前年の同じ月・同じ日までと比べ、比較日付を両方出す', () => {
  const latest = { y: 2026, mo: 10, d: 27, idx: idx(2026, 10), sort: 20261027 }
  const first = { y: 2025, mo: 4, d: 1, idx: idx(2025, 4), sort: 20250401 }
  const w = L.comparisonWindow(idx(2026, 10), idx(2026, 10), latest, first)
  assert.equal(w.inProgress, true)
  assert.equal(w.curRange, '2026/10/1〜2026/10/27')
  assert.equal(w.prevRange, '2025/10/1〜2025/10/27')
  assert.equal(w.prevCovered, true)
  // 前年10/28以降の明細は前年同期に入らない
  const rows = [
    row('1', '2025/10/20', 'A施設', '見本の品', 1, '個', 1000, 1000, 200),
    row('2', '2025/10/30', 'A施設', '見本の品', 1, '個', 5000, 5000, 1000),
    row('3', '2026/10/27', 'A施設', '見本の品', 1, '個', 1200, 1200, 240),
  ]
  const m = masters({ A施設: facility() })
  const prev = L.buildPeriodReport(rows, m, w.prev.from, w.prev.to, false, w.prev.cutoff).kpi
  assert.equal(prev.sales, 1000)
  // 年度（4月〜翌3月）も、前年度は前年の同じ日まで
  const fy = L.comparisonWindow(idx(2026, 4), idx(2027, 3), latest, first)
  assert.equal(fy.curRange, '2026/4/1〜2026/10/27')
  assert.equal(fy.prevRange, '2025/4/1〜2025/10/27')
})

test('前年に同じ日がない（2/29）ときは前年の月末にそろえ、そのことを示す', () => {
  const W = load(2028, 2, 29)
  const latest = { y: 2028, mo: 2, d: 29, idx: idx(2028, 2), sort: 20280229 }
  const w = W.comparisonWindow(idx(2028, 2), idx(2028, 2), latest, { idx: idx(2026, 1) })
  assert.equal(w.prevRange, '2027/2/1〜2027/2/28')
  assert.equal(w.dayAdjusted, true)
})

test('締め済みの月は月全体で比べる。最終売上日が期間末より4日以上前なら取得不足の可能性を示す', () => {
  const W = load(2026, 11, 5)
  const first = { idx: idx(2025, 1) }
  const full = W.comparisonWindow(idx(2026, 10), idx(2026, 10), { y: 2026, mo: 10, d: 30, idx: idx(2026, 10) }, first)
  assert.equal(full.inProgress, false)
  assert.equal(full.prevRange, '2025/10/1〜2025/10/31')
  assert.equal(full.short, false) // 10/31が休みで10/30までのこともある
  const short = W.comparisonWindow(idx(2026, 10), idx(2026, 10), { y: 2026, mo: 10, d: 15, idx: idx(2026, 10) }, first)
  assert.equal(short.short, true)
})

test('前年データ未取得と、確認済みの0円を区別する', () => {
  const latest = { y: 2026, mo: 10, d: 27, idx: idx(2026, 10) }
  // 取込が2026年4月からなら、前年同月は未取得
  assert.equal(L.comparisonWindow(idx(2026, 10), idx(2026, 10), latest, { idx: idx(2026, 4) }).prevCovered, false)
  // 前年も取り込まれていて（前年10月にほかの施設の売上がある）、A施設の前年同期の売上がない
  // → 確認済みの0円なので差額は出す（当期－0）、増減率は算出対象外
  const rows = [
    row('1', '2025/10/3', 'B施設', '見本の品', 1, '個', 500, 500, 100),
    row('2', '2026/10/5', 'A施設', '見本の品', 1, '個', 3000, 3000, 600),
  ]
  const data = L.buildAnalytics(rows, masters({ A施設: facility(), B施設: facility() }))
  const a = data.facByName.get('A施設')
  assert.equal(a.yoyDiff, 3000)
  assert.equal(a.yoyPct, null)
  // 前年データ自体がない場合は差額も出さない
  const onlyNow = L.buildAnalytics([rows[1]], masters({ A施設: facility() }))
  assert.equal(onlyNow.facByName.get('A施設').yoyDiff, null)
  assert.equal(onlyNow.hasYoy, false)
})

test('取り込み漏れの月（営業所全体で明細が1件もない月）は0円として比べない', () => {
  const rows = []
  // 2025年は7・8月の明細がない（取り込み漏れ）。2026年は毎月ある
  for (const m of [4, 5, 6, 9, 10, 11, 12]) rows.push(row('p' + m, `2025/${m}/10`, 'A施設', '見本の品', 1, '個', 1000, 1000, 200))
  for (let m = 1; m <= 10; m++) rows.push(row('c' + m, `2026/${m}/10`, 'A施設', '見本の品', 1, '個', 1000, 1000, 200))
  const data = L.buildAnalytics(rows, masters({ A施設: facility() }))
  const latest = data.latestDate, first = data.firstDate
  // 8月どうしの比較：前年8月が漏れているので比較しない
  const aug = L.comparisonWindow(idx(2026, 8), idx(2026, 8), latest, first, { months: data.monthsAll })
  assert.equal(aug.prevCovered, false)
  assert.deepEqual(aug.prevMissing, [idx(2025, 8)])
  // 年度の比較：前年度同期に7・8月の漏れがあるので比較しない（担当別の前年度同期差も出さない）
  assert.equal(data.fyCmp.prevCovered, false)
  assert.deepEqual(data.fyCmp.prevMissing, [idx(2025, 7), idx(2025, 8)])
  assert.equal(data.hasFyPrev, false)
  assert.equal(data.reps[0].fyDiff, null)
  // 10月どうしは前年10月があるので比べられる
  assert.equal(data.hasYoy, true)
  assert.equal(data.facByName.get('A施設').yoyDiff, 0)
  // 当期側に漏れがあれば curMissing で知らせる
  const custom = L.comparisonWindow(idx(2025, 6), idx(2025, 9), latest, first, { months: data.monthsAll })
  assert.deepEqual(custom.curMissing, [idx(2025, 7), idx(2025, 8)])
})

test('施設・担当の前年差は月途中なら前年同月も同じ日まで。担当の合計＋施設以外＝ダッシュボードの売上', () => {
  const rows = [
    row('1', '2025/10/10', 'A施設', '見本の品', 1, '個', 100000, 100000, 20000, null, '山田'),
    row('2', '2025/10/29', 'A施設', '見本の品', 1, '個', 50000, 50000, 10000, null, '山田'), // 前年の10/28以降
    row('3', '2026/10/27', 'A施設', '見本の品', 1, '個', 40000, 40000, 8000, null, '佐藤'),
    row('4', '2026/10/12', '見本 太郎', '見本の品', 1, '個', 3000, 3000, 600),
  ]
  const m = masters({ A施設: facility('佐藤'), '見本 太郎': { type: 'person' } })
  const data = L.buildAnalytics(rows, m)
  const a = data.facByName.get('A施設')
  assert.equal(data.cmp.prevRange, '2025/10/1〜2025/10/27')
  assert.equal(a.yoyBase, 100000)
  assert.equal(a.yoyDiff, -60000)
  assert.equal(a.yoyPct, -60)
  // 現在の担当者対応表では佐藤、売上時点の担当者では佐藤（今月）・山田（前年）に分かれる
  assert.equal(data.reps[0].rep, '佐藤')
  assert.equal(data.reps[0].yoyDiff, -60000)
  const sale = Object.fromEntries(data.repsSale.map(r => [r.rep, r]))
  assert.equal(sale['佐藤'].sales, 40000)
  assert.equal(sale['山田'].yoy, 100000)
  const dash = L.buildPeriodReport(rows, m, idx(2026, 10), idx(2026, 10), false, data.cmp.cur.cutoff).kpi.sales
  const facTotal = data.reps.reduce((t, r) => t + r.sales, 0)
  assert.equal(facTotal + data.others.sales, dash)
})

test('原価不明を0円にしない：粗利額も仕入単価もない明細は粗利「未確定」、仕入単価があれば 金額－仕入単価×数量', () => {
  const csvNoCost = '売上番号,売上日,お客様名,商品名,数量,金額\n1,2026/9/1,A施設,見本の品,2,1000\n'
  const r1 = L.analyzeCsv(csvNoCost, 'a.csv')
  assert.equal(r1.rowsParsed[0].arr[8], null)
  assert.equal(r1.rowsParsed[0].arr[10], null)
  assert.equal(r1.grossUnknown, 1)
  const k = L.buildPeriodReport(r1.rowsParsed.map(x => x.arr), masters({ A施設: facility() }), idx(2026, 9), idx(2026, 9)).kpi
  assert.equal(k.grossUnknown, 1)
  assert.equal(k.rateOk, false)

  const csvCost = '売上番号,売上日,お客様名,商品名,数量,金額,仕入単価\n1,2026/9/1,A施設,見本の品,2,1000,350\n'
  const r2 = L.analyzeCsv(csvCost, 'b.csv')
  assert.equal(r2.rowsParsed[0].arr[8], 300)
  assert.equal(r2.grossFromCost, 1)
  // 確認済みの原価0円は「不明」ではない
  const csvZero = '売上番号,売上日,お客様名,商品名,数量,金額,粗利額\n1,2026/9/1,A施設,見本の品,2,1000,0\n'
  assert.equal(L.analyzeCsv(csvZero, 'c.csv').rowsParsed[0].arr[8], 0)
})

test('同じCSVの再取込で売上が増えない。CSVの金額合計＝新規追加＋重複スキップ', () => {
  const csv = '売上番号,売上日,お客様名,商品名,数量,金額,粗利額,営業担当名\n' +
    '1,2026/9/1,A施設,見本の品,2,1000,200,山田\n' +
    '1,2026/9/1,A施設,見本の品,2,1000,200,山田\n' + // 同じ伝票内の正当な同一明細
    '2,2026/9/3,A施設,見本の品,-1,-500,-100,山田\n'
  const parsed = L.analyzeCsv(csv, 'a.csv')
  assert.equal(parsed.fileTotal, 1500)
  const first = L.mergeImportRows([], parsed.rowsParsed)
  assert.equal(first.added.length, 3)
  assert.equal(first.addedTotal + first.skippedTotal, parsed.fileTotal)
  const again = L.mergeImportRows(first.next, parsed.rowsParsed)
  assert.equal(again.added.length, 0)
  assert.equal(again.skipped, 3)
  assert.equal(again.next.length, 3)
  assert.equal(again.addedTotal + again.skippedTotal, parsed.fileTotal)
  // 担当者列のない古い明細に、再取込で担当者だけ補う（金額は変えない）
  const old = first.next.map(r => r.slice(0, 11))
  const filled = L.mergeImportRows(old, parsed.rowsParsed)
  assert.equal(filled.repFilled, 3)
  assert.equal(filled.next[0][11], '山田')
  assert.equal(filled.next[0][7], 1000)
})

test('ケースと袋など単位が違う同じ商品は数量を合計しない', () => {
  const rows = [
    row('1', '2026/9/1', 'A施設', '見本パッド', 2, 'ケース', 6000, 12000, 2400),
    row('2', '2026/9/8', 'A施設', '見本パッド', 5, '袋', 800, 4000, 800),
  ]
  const p = L.buildPeriodReport(rows, masters({ A施設: facility() }), idx(2026, 9), idx(2026, 9)).topProducts[0]
  assert.equal(p.mixedUnit, true)
  assert.deepEqual(p.units.sort(), ['ケース', '袋'])
})

test('売上差の内訳：数量分＋価格分＋新しい商品＋なくなった商品＋返品等＝売上差額', () => {
  const prev = [
    row('1', '2025/9/1', 'A施設', '手袋', 10, '箱', 500, 5000, 1000),
    row('2', '2025/9/1', 'A施設', 'パッド', 4, '袋', 1000, 4000, 800),
    row('3', '2025/9/9', 'A施設', '旧洗剤', 2, '本', 700, 1400, 300),
  ]
  const cur = [
    row('4', '2026/9/1', 'A施設', '手袋', 12, '箱', 550, 6600, 1300),
    row('5', '2026/9/1', 'A施設', 'パッド', 2, 'ケース', 6000, 12000, 2000), // 単位が違う → 別の商品
    row('6', '2026/9/9', 'A施設', '手袋', -1, '箱', 550, -550, -110),
  ]
  const d = L.decomposeSalesChange(cur, prev)
  assert.equal(d.diff, 18050 - 10400)
  // 手袋：数量分 (12-10)×500=1000、価格分 (550-500)×12=600
  assert.equal(d.volume, 1000)
  assert.equal(d.price, 600)
  assert.equal(d.added, 12000) // パッド（ケース）
  assert.equal(d.ended, -4000 - 1400) // パッド（袋）・旧洗剤
  assert.equal(d.adj, -550)
  assert.equal(d.check, true)
})

test('購入得意先数は施設だけ：返品・値引き後の売上がプラスの施設。個人と包括・居宅経由の個人は数えない', () => {
  const rows = [
    row('1', '2026/9/1', 'A施設', '見本の品', 1, '個', 1000, 1000, 200),
    row('2', '2026/9/5', 'A施設', '見本の品', 1, '個', 1000, 1000, 200),
    row('3', '2026/9/2', 'B施設', '見本の品', 1, '個', 1000, 1000, 200),
    row('4', '2026/9/9', 'B施設', '見本の品', -1, '個', 1000, -1000, -200), // 全額返品 → 0円
    row('5', '2026/9/3', '見本 花子', '見本の品', 1, '個', 500, 500, 100),
    // 包括経由の個人：自動判定で施設として保存されていても数えない
    row('6', '2026/9/4', '築上町包括　水ノ江', '見本の品', 1, '個', 800, 800, 100),
    // 包括そのもの（個人名がない）は施設として数える
    row('7', '2026/9/6', '行橋市地域包括支援センター', '見本の品', 1, '個', 300, 300, 50),
  ]
  const m = masters({ A施設: facility(), B施設: facility(), '見本 花子': { type: 'person' },
    '築上町包括　水ノ江': facility(), '行橋市地域包括支援センター': facility() })
  const rep = L.buildPeriodReport(rows, m, idx(2026, 9), idx(2026, 9))
  assert.equal(rep.kpi.buyers, 2)       // A施設・行橋市地域包括支援センター
  assert.equal(rep.kpi.buyersOther, 2)  // 見本 花子・築上町包括　水ノ江
  // 月ごとの取引施設数も施設だけ（合計の行の施設数と同じ数え方。B施設は売上0円でも取引あり）
  assert.equal(rep.monthly[0].count, 4) // A施設・B施設・築上町包括　水ノ江（施設として保存）・行橋市地域包括支援センター
  assert.equal(rep.monthly[0].count, rep.kpi.count)
  // 依頼元の手直しで「依頼元なし」にした名前は、施設/個人判定どおり施設として数える
  const m2 = { ...m, referralOverrides: { '築上町包括　水ノ江': '' } }
  assert.equal(L.buildPeriodReport(rows, m2, idx(2026, 9), idx(2026, 9)).kpi.buyers, 3)
})

test('得意先として数える施設の判定（isFacilityBuyer）', () => {
  assert.equal(L.isFacilityBuyer('ケアハイツぶぜん', 'facility', {}), true)
  assert.equal(L.isFacilityBuyer('行橋市地域包括支援センター', 'facility', {}), true)
  assert.equal(L.isFacilityBuyer('春風ケアプランセンター', 'facility', {}), true)
  assert.equal(L.isFacilityBuyer('築上町包括　水ノ江', 'facility', {}), false)
  assert.equal(L.isFacilityBuyer('春風ケアプランセンター　山田', 'facility', {}), false)
  assert.equal(L.isFacilityBuyer('神奈川地域包括支援センター大場', 'facility', {}), false)
  assert.equal(L.isFacilityBuyer('熊本　千佳', 'person', {}), false)
  // 依頼元を手で付けた名前は個人として扱う
  assert.equal(L.isFacilityBuyer('水ノ江', 'facility', { 水ノ江: '築上町包括' }), false)
})

test('境目：1月は前年の1月と、4月はじめ（年度の切り替わり）は前年4月と比べる', () => {
  const D = (y, m, d) => ({ y, mo: m, d, idx: idx(y, m), sort: y * 10000 + m * 100 + d })
  const jan = load(2027, 1, 10).comparisonWindow(idx(2027, 1), idx(2027, 1), D(2027, 1, 9), D(2025, 4, 1))
  assert.equal(jan.prevRange, '2026/1/1〜2026/1/9')
  const apr = load(2027, 4, 5).comparisonWindow(idx(2027, 4), idx(2028, 3), D(2027, 4, 3), D(2025, 4, 1))
  assert.equal(apr.curRange, '2027/4/1〜2027/4/3')
  assert.equal(apr.prevRange, '2026/4/1〜2026/4/3')
  // 翌月になってから前月末までのデータで年度を見る：年度は途中、比較は前年の同じ日（10/31）まで
  const fy = load(2026, 11, 2).comparisonWindow(idx(2026, 4), idx(2027, 3), D(2026, 10, 31), D(2025, 4, 1))
  assert.equal(fy.inProgress, true)
  assert.equal(fy.prevRange, '2025/4/1〜2025/10/31')
})

test('境目：月途中の前月比は、前月が短い月なら前月末まで（10/31 → 9/30まで）', () => {
  const W = load(2026, 10, 31)
  const rows = [
    row('1', '2025/4/1', 'A施設', '見本の品', 1, '個', 1, 1, 0),
    row('2', '2026/9/30', 'A施設', '見本の品', 1, '個', 900, 900, 180),
    row('3', '2026/10/31', 'A施設', '見本の品', 1, '個', 1000, 1000, 200),
  ]
  assert.equal(W.buildAnalytics(rows, masters({ A施設: facility() })).facByName.get('A施設').mom, 11)
})

test('粗利率の施設別比較：売上0円以下の期間は比べない。前年データがなければ当期だけ並べる', () => {
  const cur = [{ name: 'A', repName: '', sales: 1000, gross: 300, margin: 30, grossUnknown: 0 },
    { name: 'B', repName: '', sales: -500, gross: -500, margin: 100, grossUnknown: 0 }]
  const prev = [{ name: 'A', repName: '', sales: 1000, gross: 200, margin: 20, grossUnknown: 0 },
    { name: 'B', repName: '', sales: 800, gross: 160, margin: 20, grossUnknown: 0 }]
  const rows = L.buildFacilityComparison(cur, prev, 'margin')
  assert.deepEqual(rows.map(r => r.name), ['A'])
  assert.equal(rows[0].diff, 10)
  const noPrev = L.buildFacilityComparison(cur, [], 'margin', false)
  assert.deepEqual(noPrev.map(r => r.name), ['A'])
})

test('売上の施設別比較は減少額の大きい順。片方だけの施設は「新規」「離脱」とせず onlyCur / onlyPrev で示す', () => {
  const cur = [{ name: 'A', sales: 500 }, { name: 'C', sales: 300 }]
  const prev = [{ name: 'A', sales: 1000 }, { name: 'B', sales: 2000 }]
  const rows = L.buildFacilityComparison(cur, prev, 'sales')
  assert.deepEqual(rows.map(r => [r.name, r.diff]), [['B', -2000], ['A', -500], ['C', 300]])
  assert.equal(rows[0].onlyPrev, true)
  assert.equal(rows[2].onlyCur, true)
})

test('古い形式の明細（11列・担当者なし）でも集計でき、売上時点の担当は「担当不明」に入る', () => {
  const old = [
    ['1', '2025/10/3', 'A施設', '見本の品', 1, '個', 500, 500, 100, '見本商事', 400],
    ['2', '2026/10/5', 'A施設', '見本の品', 2, '個', 500, 1000, 200, '見本商事', 400],
  ]
  const data = L.buildAnalytics(old, masters({ A施設: facility('山田') }))
  assert.equal(data.facByName.get('A施設').yoyDiff, 500)
  assert.equal(data.repSaleRows, 0)
  assert.deepEqual(data.repsSale.map(r => r.rep), ['担当不明（明細に担当者なし）'])
  assert.equal(data.reps[0].rep, '山田')
})

test('JSONに書き出して読み戻しても、粗利不明（null）は0円に変わらない', () => {
  const rows = [row('1', '2026/9/1', 'A施設', '見本の品', 1, '個', 900, 900, null, null)]
  const back = JSON.parse(JSON.stringify(rows))
  assert.equal(back[0][8], null)
  assert.equal(L.buildPeriodReport(back, masters({ A施設: facility() }), idx(2026, 9), idx(2026, 9)).kpi.grossUnknown, 1)
})

test('一番新しい月の明細が経過日数に比べて極端に少なければ「明細わずか」とし、基準月を自動で前の月にする', () => {
  const m = masters({ A施設: facility(), B施設: facility() })
  const rows = []
  // 2026年4月〜9月は毎月100行
  for (let mo = 4; mo <= 9; mo++) for (let k = 0; k < 100; k++) rows.push(row(`${mo}-${k}`, `2026/${mo}/${1 + (k % 28)}`, k % 2 ? 'A施設' : 'B施設', '見本の品', 1, '個', 1000, 1000, 200))
  // 10月は10/27の1行だけ（月末にまとめて入力している、先の日付の伝票が1件だけ、など）
  const thin = [...rows, row('10-0', '2026/10/27', 'A施設', '見本の品', 1, '個', 499286, 499286, 34964)]
  const data = L.buildAnalytics(thin, m)
  assert.equal(data.thinLatest.idx, idx(2026, 10))
  assert.equal(data.thinLatest.rows, 1)
  assert.equal(data.thinLatest.customers, 1)
  assert.equal(data.baseIdx, idx(2026, 9))           // 自動では9月を表示
  assert.equal(L.buildAnalytics(thin, m, idx(2026, 10)).baseIdx, idx(2026, 10)) // 自分で選べば10月

  // 月の途中でふつうに取り込んだ場合（10/3までで10行＝目安どおり）は10月のまま
  const early = [...rows]
  for (let k = 0; k < 10; k++) early.push(row('e' + k, `2026/10/${1 + (k % 3)}`, 'A施設', '見本の品', 1, '個', 1000, 1000, 200))
  const d2 = L.buildAnalytics(early, m)
  assert.equal(d2.thinLatest, null)
  assert.equal(d2.baseIdx, idx(2026, 10))

  // データが3か月分しかなければ、ふだんの量がわからないので判定しない
  const short = rows.filter(r => /^2026\/(8|9)\//.test(r[1])).concat([row('x', '2026/10/27', 'A施設', '見本の品', 1, '個', 1000, 1000, 200)])
  assert.equal(L.buildAnalytics(short, m).thinLatest, null)
})

test('特定福祉用具の分類：入浴・排泄の用具は特定福祉用具、ポータブルトイレ用の消耗品はポータブルトイレ用品のまま', () => {
  assert.equal(L.autoCategory('シャワーチェア SC-1'), '特定福祉用具')
  assert.equal(L.autoCategory('浴槽台 ジャスト'), '特定福祉用具')
  assert.equal(L.autoCategory('浴槽用手すり'), '特定福祉用具')
  assert.equal(L.autoCategory('ポータブルトイレ 木製'), '特定福祉用具')
  assert.equal(L.autoCategory('ポータブルトイレ用消臭剤'), 'ポータブルトイレ用品')
  assert.equal(L.autoCategory('ポータブルトイレ用処理袋'), 'ポータブルトイレ用品')
  // 付属品・交換部品は本体ではないので特定福祉用具にしない
  assert.equal(L.autoCategory('ポータブルトイレ用バケツ'), 'ポータブルトイレ用品')
  assert.equal(L.autoCategory('シャワーチェア 交換用キャップ'), 'その他')
  assert.equal(L.autoCategory('洋式トイレ用 補高便座'), '特定福祉用具')
  assert.equal(L.autoCategory('手すり取付工事'), '住宅改修')
  assert.equal(L.autoCategory('バスタオル'), '清拭・入浴')
})

test('依頼元の取り出し：お客様名の「依頼元＋個人名」を分ける。手直しがあれば優先する', () => {
  const p = (n, o) => { const r = L.parseReferral(n, o || {}); return [r.source, r.person] }
  assert.deepEqual(p('築上町包括　水ノ江'), ['築上町包括', '水ノ江'])
  assert.deepEqual(p('春風ケアプランセンター　山田'), ['春風ケアプランセンター', '山田'])
  assert.deepEqual(p('神奈川地域包括支援センター大場'), ['神奈川地域包括支援センター', '大場'])
  assert.deepEqual(p('行橋市居宅介護支援事業所 田中 花子'), ['行橋市居宅介護支援事業所', '田中 花子'])
  assert.deepEqual(p('築上町 包括'), ['築上町 包括', ''])
  assert.deepEqual(p('水ノ江'), ['', '水ノ江'])
  assert.deepEqual(p('特別養護老人ホーム誠松園'), ['', '特別養護老人ホーム誠松園'])
  const o = L.parseReferral('みどり 太郎', { 'みどり 太郎': 'みどりケアプラン' })
  assert.equal(o.source, 'みどりケアプラン')
  assert.equal(o.manual, true)
  assert.equal(L.parseReferral('築上町包括　水ノ江', { '築上町包括　水ノ江': '' }).source, '')
})

test('住宅改修・特定福祉用具の集計：工事と同じ伝票の手すりは住宅改修。件数はお客様の数。個人の範囲から施設を外す', () => {
  const m = masters({ 'A施設': facility(), '水ノ江': { type: 'person' } })
  const rows = [
    // 築上町包括の水ノ江さん：手すり工事（同じ伝票に I型手すり・ブラケット）＋別の月にシャワーチェア
    row('101', '2026/6/10', '築上町包括　水ノ江', '手すり取付工事', 1, '式', 30000, 30000, 12000),
    row('101', '2026/6/10', '築上町包括　水ノ江', 'I型手すり 600mm', 2, '本', 8000, 16000, 5000),
    row('101', '2026/6/10', '築上町包括　水ノ江', 'ブラケット', 4, '個', 1000, 4000, 1500),
    row('102', '2026/7/2', '築上町包括　水ノ江', 'シャワーチェア SC-1', 1, '台', 25000, 25000, 7000),
    // 同じ包括の別の人
    row('103', '2026/7/9', '築上町包括　山本', '浴槽台 ジャスト', 1, '台', 15000, 15000, 4000),
    // 春風ケアプランセンター経由
    row('104', '2026/8/1', '春風ケアプランセンター　佐藤', '段差解消工事', 1, '式', 80000, 80000, 30000),
    // 依頼元の記載がない個人
    row('105', '2026/8/5', '水ノ江', 'ポータブルトイレ 木製', 1, '台', 40000, 40000, 12000),
    // 施設の手すり（工事なし）は住宅改修に入らない／施設の工事は「すべてのお客様」だけで数える
    row('106', '2026/8/9', 'A施設', 'I型手すり 600mm', 1, '本', 8000, 8000, 2000),
    row('107', '2026/8/9', 'A施設', '手すり取付工事', 1, '式', 50000, 50000, 20000),
    // 消耗品は対象外
    row('108', '2026/8/9', '築上町包括　水ノ江', 'ポータブルトイレ用消臭剤', 2, '本', 500, 1000, 300),
  ]
  const rep = L.buildReformReport(rows, m, idx(2026, 4), idx(2027, 3), 'person')
  assert.equal(rep.kpi.reform.sales, 30000 + 16000 + 4000 + 80000)
  assert.equal(rep.kpi.reform.cases, 2)      // 水ノ江さん（包括）・佐藤さん
  assert.equal(rep.kpi.welfare.sales, 25000 + 15000 + 40000)
  assert.equal(rep.kpi.welfare.cases, 3)
  assert.equal(rep.kpi.sources, 2)           // 築上町包括・春風ケアプランセンター
  const src = Object.fromEntries(rep.sources.map(s => [s.source || 'なし', s]))
  assert.equal(src['築上町包括'].sales, 50000 + 25000 + 15000)
  assert.equal(src['築上町包括'].cases, 2)
  assert.equal(src['春風ケアプランセンター'].reform, 80000)
  assert.equal(src['なし'].welfare, 40000)
  assert.equal(rep.kpi.viaReferral, 50000 + 25000 + 15000 + 80000)
  // 月ごとの推移
  const jun = rep.months.find(x => x.idx === idx(2026, 6)), jul = rep.months.find(x => x.idx === idx(2026, 7))
  assert.deepEqual([jun.reform, jun.reformCases, jul.welfare, jul.welfareCases], [50000, 1, 40000, 2])
  // すべてのお客様：施設の工事 50,000円が住宅改修に入る（工事と別の伝票の手すり 8,000円は入らない）
  const all = L.buildReformReport(rows, m, idx(2026, 4), idx(2027, 3), 'all')
  assert.equal(all.kpi.reform.sales, 130000 + 50000)
  // 明細のある月を渡すと、明細のない月は「取込なし」（0円の月と区別する）
  const withMonths = L.buildReformReport(rows, m, idx(2026, 4), idx(2026, 9), 'person', { months: [idx(2026, 6), idx(2026, 7), idx(2026, 8)] })
  assert.deepEqual(withMonths.months.map(x => x.noData), [true, true, false, false, false, true])
  assert.equal(withMonths.kpi.reform.sales, rep.kpi.reform.sales)
  assert.equal(rep.months.some(x => x.noData), false) // 渡さなければ従来どおり
})
