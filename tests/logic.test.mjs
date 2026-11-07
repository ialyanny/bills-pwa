import test from 'node:test';
import assert from 'node:assert/strict';

import { SAMPLE } from './fixtures/sample-state.mjs';
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
  entryFromTemplate,
  filterAndSortEntries,
  pendingIssues,
  buildCardEntries,
  cardEntries,
} from '../js/logic.js';

const state = SAMPLE;

const TODAY = '2026-10-27';

test('公開的初始資料不含任何帳務紀錄', () => {
  assert.deepEqual(SEED.cards, []);
  assert.deepEqual(SEED.templates, []);
  assert.deepEqual(SEED.months, {});
});

test('月份總額與信用卡／其他帳單小計（未填金額以 0 計）', () => {
  const s = monthSummary(state, '2026-10', TODAY);
  assert.equal(s.cards.total, 4000);
  assert.equal(s.others.total, 32000);
  assert.equal(s.total, 36000);
  assert.equal(s.count, 7);
});

test('年度合計等於各月相加', () => {
  const y = yearSummary(state, 2026, TODAY);
  const summed = y.months.reduce((a, m) => a + m.total, 0);
  assert.equal(y.total, summed);
  assert.equal(y.total, 35500 + 36000);
});

test('分期進度取最新月份的期數', () => {
  const items = installmentSummary(state);
  const loan = items.find((i) => i.name === '信貸');
  assert.equal(loan.cur, 10);
  assert.equal(loan.left, 50);
  assert.equal(loan.remaining, 50 * 10000);
  assert.equal(loan.ym, '2026-10');
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
  assert.equal(oct.some((t) => t.name === '房租'), false, '十月已有房租');
  assert.equal(oct.some((t) => t.name === '房屋稅'), false, '房屋稅是 5 月');

  const nov = missingTemplates({ ...state, months: { ...state.months, '2026-11': { cards: {}, others: [] } } }, '2026-11');
  assert.equal(nov.some((t) => t.name === '房租'), true);
  assert.equal(nov.some((t) => t.name === '房屋稅'), false);
  const may = missingTemplates({ ...state, months: { '2027-05': { cards: {}, others: [] } } }, '2027-05');
  assert.equal(may.some((t) => t.name === '房屋稅'), true, '年繳只在指定月份出現');
});

test('新月份空白卡片會依主檔推算結帳日與截止日', () => {
  const built = buildCardEntries(SAMPLE.cards, '2026-11');
  assert.equal(built.cardA.dueDate, '2026-11-09');
  assert.equal(built.cardA.stmtDate, '2026-10-24');
  assert.equal(built.cardB.dueDate, '2026-11-13');
  assert.equal(built.cardB.stmtDate, '2026-10-27');
  assert.equal(built.cardA.paid, false);
});

test('搜尋、篩選與排序功能', () => {
  const entries = [
    { kind: 'other', key: '1', meta: null, item: { name: '房貸', amount: 40000, paid: false, dueDate: '2026-10-29', via: '轉帳' } },
    { kind: 'other', key: '2', meta: null, item: { name: '電費', amount: 2590, paid: true, dueDate: '2026-10-27', via: '聯邦' } },
    { kind: 'other', key: '3', meta: null, item: { name: '水費', amount: null, paid: false, dueDate: '2026-10-01', via: '街口' } },
  ];
  assert.equal(filterAndSortEntries(entries, { filter: 'unpaid', today: TODAY }).length, 2);
  assert.equal(filterAndSortEntries(entries, { filter: 'paid', today: TODAY }).length, 1);
  assert.equal(filterAndSortEntries(entries, { filter: 'unknown', today: TODAY }).length, 1);
  assert.equal(filterAndSortEntries(entries, { query: '聯邦', today: TODAY }).length, 1);
  const byAmt = filterAndSortEntries(entries, { sort: 'amount-desc', today: TODAY });
  assert.equal(byAmt[0].item.name, '房貸');
});

test('分期範本帶入未來月份時自動遞增期數', () => {
  const tpl = SAMPLE.templates.find((t) => t.name === '信貸');
  const decEntry = entryFromTemplate(tpl, '2026-12', state);
  assert.equal(decEntry.inst.cur, 12, '10 月第 10 期，隔兩個月是第 12 期');
  assert.equal(decEntry.inst.total, 60);
});

test('待確認與疑點掃描可抓出空白金額與備註疑點', () => {
  const issues = pendingIssues(state);
  assert.equal(issues.length, 3);
  assert.equal(issues.some((i) => i.ym === '2026-10' && i.name === '水費'), true);
  assert.equal(issues.some((i) => i.ym === '2026-10' && i.name === '乙銀行'), true, '信用卡金額未填');
  assert.equal(issues.some((i) => i.name === '管理費'), true, '備註標記疑似');
});

test('已刪除的卡片月份紀錄不列入清單、統計與待確認', () => {
  const st = {
    cards: [{ id: 'c1', name: '測試卡', color: '#000' }],
    templates: [],
    months: {
      '2026-11': {
        cards: { c1: { amount: 500, paid: true, deleted: true, updatedAt: 1 } },
        others: [],
      },
    },
  };
  assert.equal(cardEntries(st, '2026-11').length, 0);
  const s = monthSummary(st, '2026-11', TODAY);
  assert.equal(s.total, 0);
  assert.equal(s.count, 0);
  assert.equal(pendingIssues(st).length, 0);
  assert.equal(yearSummary(st, 2026, TODAY).cardTotals[0].total, 0);
});
