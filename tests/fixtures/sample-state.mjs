/**
 * 測試用的虛構帳本（不是真實資料）。
 * 數字刻意取整，方便人工驗算：
 *   2026-09：信用卡 3,000 + 2,000；其他 500 + 10,000 + 20,000      → 35,500
 *   2026-10：信用卡 4,000 + 未填；其他 500 + 10,000 + 20,000 + 未填 + 1,500 → 36,000
 */
const card = (amount, extra = {}) => ({
  amount,
  stmtDate: null,
  dueDate: null,
  paid: false,
  paidDate: null,
  via: '',
  note: '',
  ...extra,
});

const other = (id, name, amount, extra = {}) => ({
  id,
  name,
  amount,
  dueDate: null,
  paid: false,
  paidDate: null,
  via: '',
  note: '',
  inst: null,
  ...extra,
});

export const SAMPLE = {
  cards: [
    { id: 'cardA', name: '甲銀行', owner: '本人', stmtDay: 24, dueDay: 9, via: '轉帳', color: '#1f7a5c' },
    { id: 'cardB', name: '乙銀行', owner: '本人', stmtDay: 27, dueDay: 13, via: '自動扣款', color: '#0f766e' },
  ],
  templates: [
    { id: 't1', name: '電話費', amount: 500, dueDay: 28, via: '', recurrence: 'monthly' },
    { id: 't2', name: '信貸', amount: 10000, dueDay: null, via: '銀行', recurrence: 'monthly', inst: { cur: 10, total: 60 } },
    { id: 't3', name: '房屋稅', amount: null, dueDay: 31, via: '', recurrence: 'yearly', month: 5 },
    { id: 't4', name: '房租', amount: 20000, dueDay: 5, via: '', recurrence: 'monthly' },
  ],
  months: {
    '2026-09': {
      cards: {
        cardA: card(3000, { paid: true, paidDate: '2026-09-08' }),
        cardB: card(2000, { paid: true, paidDate: '2026-09-12' }),
      },
      others: [
        other('o0901', '電話費', 500, { paid: true }),
        other('o0902', '信貸', 10000, { paid: true, inst: { cur: 9, total: 60 } }),
        other('o0903', '房租', 20000, { paid: true }),
      ],
    },
    '2026-10': {
      cards: {
        cardA: card(4000, { paid: true, paidDate: '2026-10-08' }),
        cardB: card(null),
      },
      others: [
        other('o1001', '電話費', 500),
        other('o1002', '信貸', 10000, { inst: { cur: 10, total: 60 } }),
        other('o1003', '房租', 20000),
        other('o1004', '水費', null),
        other('o1005', '管理費', 1500, { note: '疑似重複扣款' }),
      ],
    },
  },
};
