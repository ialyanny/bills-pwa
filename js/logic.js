/**
 * 純邏輯：日期、統計、範本帶入。
 * 這支檔案不碰 DOM、不碰網路，方便用 node 直接測。
 */

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function ymNow() {
  return todayStr().slice(0, 7);
}

export function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function ymLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

export function ymShort(ym) {
  const [, m] = ym.split('-').map(Number);
  return `${m} 月`;
}

/** 兩個 YYYY-MM-DD 相差幾天（b - a） */
export function daysBetween(a, b) {
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const t1 = Date.UTC(ay, am - 1, ad);
  const t2 = Date.UTC(by, bm - 1, bd);
  return Math.round((t2 - t1) / 86400000);
}

export function mdLabel(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/** 已繳 / 逾期 / 快到期 / 待繳 / 未填金額 */
export function statusOf(item, today = todayStr()) {
  if (item.paid) return 'paid';
  const unknownAmount = item.amount === null || item.amount === undefined;
  // 金額還沒填的，一律視為「待確認」，不謊報逾期
  if (unknownAmount) return 'unknown';
  if (item.dueDate) {
    const d = daysBetween(today, item.dueDate);
    if (d < 0) return 'overdue';
    if (d <= 7) return 'soon';
  }
  return 'pending';
}

export const STATUS_TEXT = {
  paid: '已繳',
  overdue: '逾期',
  soon: '快到期',
  pending: '待繳',
  unknown: '待確認',
};

export function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function fmtMoney(v, { sign = false } = {}) {
  if (v === null || v === undefined) return '—';
  const n = num(v);
  const s = n.toLocaleString('en-US');
  return sign && n > 0 ? `+${s}` : s;
}

/* ------------------------------------------------------------------ *
 * 月份內容
 * ------------------------------------------------------------------ */

export function cardMeta(state, id) {
  return state.cards.find((c) => c.id === id);
}

export function cardEntries(state, ym) {
  const month = state.months[ym];
  if (!month) return [];
  return state.cards
    .filter((c) => month.cards[c.id])
    .map((c) => ({ kind: 'card', key: c.id, meta: c, item: month.cards[c.id] }));
}

export function otherEntries(state, ym) {
  const month = state.months[ym];
  if (!month) return [];
  return month.others.map((o) => ({ kind: 'other', key: o.id, meta: null, item: o }));
}

/** 建立某月的空白卡片資料（依卡片主檔的結帳日／截止日推算） */
export function buildCardEntries(cards, ym) {
  const [y, m] = ym.split('-').map(Number);
  const prev = addMonths(ym, -1).split('-').map(Number);
  const out = {};
  for (const c of cards) {
    out[c.id] = {
      amount: null,
      stmtDate: `${prev[0]}-${pad2(prev[1])}-${pad2(Math.min(c.stmtDay || 1, 28))}`,
      dueDate: c.dueDay ? `${y}-${pad2(m)}-${pad2(Math.min(c.dueDay, 28))}` : null,
      paid: false,
      paidDate: null,
      via: c.via || '',
      note: '',
    };
  }
  return out;
}

export function ensureMonth(state, ym) {
  if (!state.months[ym]) {
    state.months[ym] = { cards: buildCardEntries(state.cards, ym), others: [] };
    return true;
  }
  let changed = false;
  for (const id of Object.keys(state.months[ym].cards)) {
    if (!state.cards.find((c) => c.id === id)) {
      delete state.months[ym].cards[id];
      changed = true;
    }
  }
  return changed;
}

/** 這段期間還沒被帶入的固定項目 */
export function missingTemplates(state, ym) {
  const month = state.months[ym];
  if (!month) return state.templates.filter((t) => appliesTo(t, ym));
  const names = new Set(month.others.map((o) => o.name));
  return state.templates.filter((t) => appliesTo(t, ym) && !names.has(t.name));
}

export function appliesTo(tpl, ym) {
  const [, m] = ym.split('-').map(Number);
  if (tpl.recurrence === 'monthly') return true;
  if (tpl.recurrence === 'yearly') return Number(tpl.month) === m;
  return false;
}

export function entryFromTemplate(tpl, ym, state = null) {
  const [y, m] = ym.split('-').map(Number);
  let inst = tpl.inst ? { ...tpl.inst } : null;
  if (inst && state?.months) {
    let latestYm = null;
    let latestCur = null;
    for (const [k, mv] of Object.entries(state.months)) {
      if (k < ym) {
        const found = mv.others?.find((o) => o.name === tpl.name && o.inst?.cur);
        if (found && (!latestYm || k > latestYm)) {
          latestYm = k;
          latestCur = found.inst.cur;
        }
      }
    }
    if (latestYm && latestCur != null) {
      const [ly, lm] = latestYm.split('-').map(Number);
      const diff = (y - ly) * 12 + (m - lm);
      inst = { cur: Math.min(inst.total, latestCur + Math.max(1, diff)), total: inst.total };
    }
  }
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: tpl.name,
    amount: tpl.amount ?? null,
    dueDate: tpl.dueDay ? `${y}-${pad2(m)}-${pad2(Math.min(tpl.dueDay, 28))}` : null,
    paid: false,
    paidDate: null,
    via: tpl.via || '',
    note: '',
    inst,
  };
}

/** 篩選與排序清單項目 */
export function filterAndSortEntries(entries, { query = '', filter = 'all', sort = 'default', today = todayStr() } = {}) {
  const q = query.trim().toLowerCase();
  const statusWeight = { overdue: 0, soon: 1, pending: 2, unknown: 3, paid: 4 };
  const filtered = entries.filter((e) => {
    const it = e.item;
    if (!it) return filter === 'all' && !q;
    const st = statusOf(it, today);
    if (filter === 'unpaid' && it.paid) return false;
    if (filter === 'paid' && !it.paid) return false;
    if (filter === 'unknown' && st !== 'unknown') return false;
    if (filter === 'overdue' && st !== 'overdue' && st !== 'soon') return false;
    if (q) {
      const name = (e.meta?.name || it.name || '').toLowerCase();
      const via = (it.via || '').toLowerCase();
      const note = (it.note || '').toLowerCase();
      const amt = it.amount != null ? String(it.amount) : '';
      if (!name.includes(q) && !via.includes(q) && !note.includes(q) && !amt.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'default') return filtered;
  return [...filtered].sort((a, b) => {
    const ia = a.item || {};
    const ib = b.item || {};
    if (sort === 'due') {
      const swA = statusWeight[statusOf(ia, today)] ?? 9;
      const swB = statusWeight[statusOf(ib, today)] ?? 9;
      if (swA !== swB) return swA - swB;
      return String(ia.dueDate || '9999-99-99').localeCompare(String(ib.dueDate || '9999-99-99'));
    }
    if (sort === 'amount-desc') {
      return num(ib.amount) - num(ia.amount);
    }
    if (sort === 'amount-asc') {
      return num(ia.amount) - num(ib.amount);
    }
    return 0;
  });
}

/** 掃描所有月份中金額空白（待確認）或有疑點的項目 */
export function pendingIssues(state) {
  const list = [];
  for (const ym of Object.keys(state.months).sort().reverse()) {
    const m = state.months[ym];
    for (const c of state.cards) {
      const item = m.cards[c.id];
      if (!item) continue;
      if (item.amount == null || /疑似|疑問|殘缺|原文/.test(item.note || '')) {
        list.push({
          ym,
          kind: 'card',
          key: c.id,
          name: c.name,
          amount: item.amount,
          note: item.note || (item.amount == null ? '金額未填' : ''),
        });
      }
    }
    for (const o of m.others) {
      if (o.amount == null || /疑似|疑問|殘缺|原文/.test(o.note || '')) {
        list.push({
          ym,
          kind: 'other',
          key: o.id,
          name: o.name,
          amount: o.amount,
          note: o.note || (o.amount == null ? '金額未填' : ''),
        });
      }
    }
  }
  return list;
}

/* ------------------------------------------------------------------ *
 * 統計
 * ------------------------------------------------------------------ */

export function summarize(items, today = todayStr()) {
  const s = {
    total: 0,
    paid: 0,
    unpaid: 0,
    count: 0,
    paidCount: 0,
    unknownCount: 0,
    overdueCount: 0,
    soonCount: 0,
  };
  for (const it of items) {
    s.count += 1;
    if (it.amount === null || it.amount === undefined) s.unknownCount += 1;
    else s.total += it.amount;
    if (it.paid) {
      s.paidCount += 1;
      s.paid += num(it.amount);
    } else {
      s.unpaid += num(it.amount);
      const st = statusOf(it, today);
      if (st === 'overdue') s.overdueCount += 1;
      if (st === 'soon') s.soonCount += 1;
    }
  }
  return s;
}

export function monthSummary(state, ym, today = todayStr()) {
  const cards = cardEntries(state, ym).map((e) => e.item);
  const others = otherEntries(state, ym).map((e) => e.item);
  const all = [...cards, ...others];
  return {
    ...summarize(all, today),
    cards: summarize(cards, today),
    others: summarize(others, today),
    cardCount: cards.length,
    otherCount: others.length,
  };
}

export function yearSummary(state, year, today = todayStr()) {
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const ym = `${year}-${pad2(m)}`;
    const exists = !!state.months[ym];
    const s = exists
      ? monthSummary(state, ym, today)
      : { total: 0, paid: 0, unpaid: 0, count: 0 };
    months.push({ ym, exists, ...s });
  }
  const total = months.reduce((a, b) => a + b.total, 0);
  const paid = months.reduce((a, b) => a + b.paid, 0);

  const cardTotals = state.cards
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      total: months.reduce((acc, mm) => {
        const e = state.months[mm.ym]?.cards?.[c.id];
        return acc + num(e?.amount);
      }, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const byName = new Map();
  for (const ym of Object.keys(state.months).filter((k) => k.startsWith(`${year}-`))) {
    for (const o of state.months[ym].others) {
      const cur = byName.get(o.name) || { name: o.name, total: 0 };
      cur.total += num(o.amount);
      byName.set(o.name, cur);
    }
  }
  const otherTotals = [...byName.values()].sort((a, b) => b.total - a.total);

  return { year, months, total, paid, cardTotals, otherTotals };
}

/** 各分期方案目前進度（取最新一筆有 inst 的紀錄） */
export function installmentSummary(state) {
  const latest = new Map();
  for (const ym of Object.keys(state.months).sort()) {
    for (const o of state.months[ym].others) {
      if (o.inst && (!latest.has(o.name) || latest.get(o.name).ym < ym)) {
        latest.set(o.name, { ...o, ym });
      }
    }
  }
  return [...latest.values()].map((o) => {
    const left = Math.max(o.inst.total - o.inst.cur, 0);
    return {
      name: o.name,
      amount: o.amount,
      cur: o.inst.cur,
      total: o.inst.total,
      left,
      remaining: left * num(o.amount),
      pct: o.inst.total ? Math.round((o.inst.cur / o.inst.total) * 100) : 0,
      ym: o.ym,
    };
  });
}

export function availableYears(state) {
  const years = new Set(Object.keys(state.months).map((k) => k.slice(0, 4)));
  years.add(String(new Date().getFullYear()));
  return [...years].sort().reverse();
}
