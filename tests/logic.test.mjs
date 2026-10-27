import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED } from '../js/seed.js';
import {
  addMonths,
  daysBetween,
  monthSummary,
  yearSummary,
  installmentSummary,
  statusOf,
  fmtMoney,
  missingTemplates,
  buildCardEntries,
} from '../js/logic.js';

const state = {
  cards: SEED.cards,
  templates: SEED.templates,
  months: SEED.months,
};

const TODAY = '2026-10-27';

test('種子資料有 1～10 月', () => {
  const months = Object.keys(SEED.months).sort();
  assert.deepEqual(months, [
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
    '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
  ]);
});

test('2026-10 總額與信用卡／其他帳單小計', () => {
  const s = monthSummary(state, '2026-10', TODAY);
  assert.equal(s.cards.total, 70905);
  assert.equal(s.others.total, 111027);
  assert.equal(s.total, 181932);
  assert.equal(s.count, 26);
});

test('年度合計等於各月相加', () => {
  const y = yearSummary(state, 2026, TODAY);
  const summed = y.months.reduce((a, m) => a + m.total, 0);
  assert.equal(y.total, summed);
  assert.equal(y.total, 1704373);
});

test('分期進度：9733 剩 28 期、24213 剩 73 期', () => {
  const items = installmentSummary(state);
  const a = items.find((i) => i.name === '9733聯邦信貸');
  const b = items.find((i) => i.name === '24213台新信貸');
  assert.equal(a.cur, 44);
  assert.equal(a.left, 28);
  assert.equal(a.remaining, 28 * 9733);
  assert.equal(b.cur, 11);
  assert.equal(b.left, 73);
  assert.equal(b.remaining, 73 * 24213);
});

test('日期與月份加減', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(daysBetween('2026-10-27', '2026-10-28'), 1);
  assert.equal(daysBetween('2026-10-27', '2026-10-01'), -26);
});

test('狀態判斷：已繳、逾期、快到期', () => {
  assert.equal(statusOf({ paid: true, dueDate: '2026-01-01', amount: 1 }, TODAY), 'paid');
  assert.equal(statusOf({ paid: false, dueDate: '2026-10-01', amount: 1 }, TODAY), 'overdue');
  assert.equal(statusOf({ paid: false, dueDate: '2026-10-30', amount: 1 }, TODAY), 'soon');
  assert.equal(statusOf({ paid: false, dueDate: '2026-12-01', amount: 1 }, TODAY), 'pending');
  assert.equal(statusOf({ paid: false, dueDate: null, amount: null }, TODAY), 'unknown');
  assert.equal(statusOf({ paid: false, dueDate: '2026-10-01', amount: null }, TODAY), 'unknown', '金額未知不謊報逾期');
});

test('金額格式：null 顯示破折號', () => {
  assert.equal(fmtMoney(null), '—');
  assert.equal(fmtMoney(0), '0');
  assert.equal(fmtMoney(181932), '181,932');
});

test('固定項目只帶入尚未存在的，且年繳只在指定月份出現', () => {
  const oct = missingTemplates(state, '2026-10');
  assert.equal(oct.some((t) => t.name === '房貸'), false, '十月已有房貸');
  assert.equal(oct.some((t) => t.name === '房屋稅'), false, '房屋稅是 5 月');

  const nov = missingTemplates({ ...state, months: { ...state.months, '2026-11': { cards: {}, others: [] } } }, '2026-11');
  assert.equal(nov.some((t) => t.name === '房貸'), true);
  assert.equal(nov.some((t) => t.name === '房屋稅'), false);
  assert.equal(nov.some((t) => t.name === '漁會'), false);
});

test('新月份空白卡片會依主檔推算結帳日與截止日', () => {
  const built = buildCardEntries(SEED.cards, '2026-11');
  assert.equal(built.fubon.dueDate, '2026-11-09');
  assert.equal(built.fubon.stmtDate, '2026-10-24');
  assert.equal(built.yushan.dueDate, '2026-11-13');
  assert.equal(built.yushan.stmtDate, '2026-10-27');
  assert.equal(built.fubon.paid, false);
});
