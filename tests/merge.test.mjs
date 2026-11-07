import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalMonths,
  mergeMonths,
  monthsEqual,
  mergeCards,
  mergeTemplates,
  listsEqual,
} from '../js/merge.js';

const entry = (id, extra = {}) => ({ id, name: id, amount: 100, paid: false, updatedAt: 1, ...extra });

test('不同筆的編輯兩邊都保留（不會整份覆蓋）', () => {
  const local = { '2026-11': { cards: {}, others: [entry('a', { paid: true, updatedAt: 10 })] } };
  const remote = {
    '2026-11': { cards: {}, others: [entry('a'), entry('b', { paid: true, updatedAt: 20 })] },
  };
  const merged = mergeMonths(local, remote);
  const others = merged['2026-11'].others;
  assert.equal(others.length, 2);
  assert.equal(others.find((o) => o.id === 'a').paid, true, '本機較新的已繳要保留');
  assert.equal(others.find((o) => o.id === 'b').paid, true, '遠端新增的也要保留');
});

test('同一筆取 updatedAt 較新的一邊', () => {
  const local = { '2026-11': { cards: { c1: entry('c1', { amount: 111, updatedAt: 30 }) }, others: [] } };
  const remote = { '2026-11': { cards: { c1: entry('c1', { amount: 222, updatedAt: 20 }) }, others: [] } };
  assert.equal(mergeMonths(local, remote)['2026-11'].cards.c1.amount, 111);

  const local2 = { '2026-11': { cards: { c1: entry('c1', { amount: 111, updatedAt: 10 }) }, others: [] } };
  assert.equal(mergeMonths(local2, remote)['2026-11'].cards.c1.amount, 222);
});

test('刪除墓碑會傳播，較新的復原可以贏過墓碑', () => {
  const tomb = { id: 'x', deleted: true, updatedAt: 50 };
  const live = { id: 'x', deleted: false, amount: 5, updatedAt: 40 };

  const a = mergeMonths(
    { '2026-11': { cards: {}, others: [live] } },
    { '2026-11': { cards: {}, others: [tomb] } },
  );
  assert.equal(a['2026-11'].others[0].deleted, true);

  const b = mergeMonths(
    { '2026-11': { cards: {}, others: [tomb] } },
    { '2026-11': { cards: {}, others: [{ ...live, updatedAt: 60 }] } },
  );
  assert.equal(b['2026-11'].others[0].deleted, false, '較新的編輯可以把項目救回來');
});

test('月份合併會補上只有遠端存在的月份', () => {
  const merged = mergeMonths({ '2026-10': { cards: {}, others: [] } }, {
    '2026-11': { cards: {}, others: [entry('z')] },
  });
  assert.deepEqual(Object.keys(merged), ['2026-10', '2026-11']);
});

test('範本與信用卡主檔逐筆合併、含墓碑', () => {
  const cardsLocal = [{ id: 'c1', name: '本機', updatedAt: 10 }];
  const cardsRemote = [
    { id: 'c1', name: '遠端', updatedAt: 5 },
    { id: 'c2', name: '新卡', updatedAt: 6 },
    { id: 'c3', name: '刪掉', deleted: true, updatedAt: 7 },
  ];
  const cards = mergeCards(cardsLocal, cardsRemote);
  assert.deepEqual(cards.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.equal(cards.find((c) => c.id === 'c1').name, '本機');
  assert.equal(cards.find((c) => c.id === 'c3').deleted, true);

  const tpls = mergeTemplates(
    [{ id: 't1', name: 'A', updatedAt: 1 }],
    [{ id: 't1', name: 'A2', updatedAt: 2 }, { id: 't2', name: 'B', updatedAt: 2 }],
  );
  assert.equal(tpls.find((t) => t.id === 't1').name, 'A2');
  assert.equal(tpls.length, 2);
});

test('canonicalMonths 排序固定，monthsEqual 不受鍵順序影響', () => {
  const a = { '2026-11': { cards: { b: { x: 1 }, a: { x: 2 } }, others: [entry('b'), entry('a')] } };
  const b = { '2026-11': { cards: { a: { x: 2 }, b: { x: 1 } }, others: [entry('a'), entry('b')] } };
  assert.equal(monthsEqual(a, b), true);
  assert.deepEqual(Object.keys(canonicalMonths(a)['2026-11'].cards), ['a', 'b']);
  assert.deepEqual(canonicalMonths(a)['2026-11'].others.map((o) => o.id), ['a', 'b']);
});

test('listsEqual 忽略排序與物件鍵順序，但抓得到內容差異', () => {
  const a = [{ id: 'c1', name: 'A', inst: { cur: 1, total: 2 } }];
  const b = [{ inst: { total: 2, cur: 1 }, name: 'A', id: 'c1' }];
  assert.equal(listsEqual(a, b), true);
  assert.equal(listsEqual(a, [{ id: 'c1', name: 'A', inst: { cur: 2, total: 2 } }]), false);
});

/* ---------------- 同時同步：被覆蓋的改動要能補傳 ---------------- */
import { remoteIsBehind } from '../js/merge.js';

const snap = (others) => ({
  cards: [],
  templates: [],
  months: { '2026-11': { cards: {}, others } },
});

test('雲端與本機內容相同時不需上傳', () => {
  const local = snap([entry('a', { paid: true, updatedAt: 10 })]);
  const remote = JSON.parse(JSON.stringify(local));
  assert.equal(remoteIsBehind(local, remote), false);
});

test('鍵順序或排序不同不算落後（避免同步乒乓）', () => {
  const local = snap([entry('a'), entry('b')]);
  const remote = snap([entry('b'), { updatedAt: 1, paid: false, amount: 100, name: 'a', id: 'a' }]);
  assert.equal(remoteIsBehind(local, remote), false);
});

test('雲端沒有資料時要上傳', () => {
  assert.equal(remoteIsBehind(snap([]), null), true);
});

test('兩台同時同步、手機的已繳被電腦覆蓋後，手機下一輪會補傳', () => {
  // 模擬雲端與兩台裝置；sync() 照 runSync 的流程：讀 → 合併 → 判斷 → 上傳
  let cloud = snap([entry('a')]);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const device = () => ({ state: clone(cloud), dirty: false });
  const phone = device();
  const pc = device();

  const merge = (d, remote) => {
    d.state.months = mergeMonths(d.state.months, remote.months);
  };
  const finish = (d, remote) => {
    if (d.dirty || remoteIsBehind(d.state, remote)) {
      cloud = clone(d.state);
      d.dirty = false;
    }
  };

  // 手機勾已繳
  phone.state.months['2026-11'].others[0] = entry('a', { paid: true, updatedAt: 50 });
  phone.dirty = true;
  pc.dirty = true; // 電腦也有別的改動，兩邊同時開始同步

  // 兩台都先讀到同一份舊雲端
  const seenByPhone = clone(cloud);
  const seenByPc = clone(cloud);
  merge(phone, seenByPhone);
  merge(pc, seenByPc);
  finish(phone, seenByPhone); // 手機先上傳
  finish(pc, seenByPc); // 電腦用舊資料覆蓋
  assert.equal(cloud.months['2026-11'].others[0].paid, false, '前提：雲端的已繳被蓋掉了');
  assert.equal(phone.dirty, false, '前提：手機以為已經送出');

  // 下一輪輪詢：手機要發現雲端落後並補傳
  const next = clone(cloud);
  merge(phone, next);
  finish(phone, next);
  assert.equal(cloud.months['2026-11'].others[0].paid, true, '已繳要補回雲端');

  // 電腦再同步就能拿到
  merge(pc, clone(cloud));
  assert.equal(pc.state.months['2026-11'].others[0].paid, true);
});
