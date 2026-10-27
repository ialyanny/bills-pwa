/**
 * 由「精簡手寫資料」產生 js/seed.js
 * 用法：node scripts/build-seed.mjs
 *
 * 為什麼要有這支腳本：
 *   原始備忘錄裡的日期只寫「10/9」「9/24」，沒有年份。這裡統一換算成 ISO 日期，
 *   避免前端每次都要猜年份而出錯。手改資料請改本檔的 DATA，再重新執行。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ------------------------------------------------------------------ *
 * 1. 卡片主檔（結帳日 / 截止日 / 扣款方式在各月份幾乎固定）
 * ------------------------------------------------------------------ */
const CARDS = [
  { id: 'fubon',      name: '富邦',     owner: '本人', stmtDay: 24, dueDay: 9,  via: '台銀',      color: '#1f7a5c' },
  { id: 'yushan',     name: '玉山',     owner: '本人', stmtDay: 27, dueDay: 13, via: '玉山帳戶',  color: '#0f766e' },
  { id: 'ctc',        name: '中信',     owner: '本人', stmtDay: 17, dueDay: 5,  via: '台銀',      color: '#b45309' },
  { id: 'yongfeng',   name: '永豐',     owner: '本人', stmtDay: 18, dueDay: 3,  via: 'DAWHO',     color: '#7c3aed' },
  { id: 'taishin',    name: '台新',     owner: '本人', stmtDay: 15, dueDay: 27, via: 'Richart',   color: '#be123c' },
  { id: 'union',      name: '聯邦',     owner: '本人', stmtDay: 6,  dueDay: 21, via: 'NEWNEW',    color: '#1d4ed8' },
  { id: 'dbs',        name: '星展',     owner: '本人', stmtDay: 7,  dueDay: 27, via: '台銀',      color: '#334155' },
  { id: 'scb',        name: '渣打',     owner: '本人', stmtDay: 16, dueDay: 6,  via: 'LineBank',  color: '#0369a1' },
  { id: 'wife_ctc',   name: '老婆中信', owner: '老婆', stmtDay: 14, dueDay: null, via: '曉君國泰', color: '#a16207' },
  { id: 'wife_yushan',name: '老婆玉山', owner: '老婆', stmtDay: 27, dueDay: null, via: '玉山帳戶',  color: '#15803d' },
];

/* ------------------------------------------------------------------ *
 * 2. 每月資料
 *    c = 信用卡：金額、繳款日（null = 未記錄日期）、扣款方式、備註
 *    o = 其他帳單：[名稱, 金額, { d:截止, p:繳款日, v:方式, n:備註, inst:[已繳期,總期] }]
 * ------------------------------------------------------------------ */
const DATA = {
  '2026-11': {
    c: {
      fubon:       [null, null],
      yushan:      [null, null],
      ctc:         [null, null],
      yongfeng:    [null, null],
      taishin:     [null, null],
      union:       [null, null],
      dbs:         [null, null],
      scb:         [null, null],
      wife_ctc:    [null, null],
      wife_yushan: [null, null],
    },
    o: [
      ['遠傳電話費', 1258, { d: '11-28' }],
      ['宸麟電話費', 376,  { d: '11-22' }],
      ['9733聯邦信貸', 9733, { v: '聯邦', inst: [45, 72] }],
      ['24213台新信貸', 24213, { v: '台新', inst: [12, 84] }],
      ['房貸', 40000, { v: '轉帳' }],
      ['妹妹數學', null, {}],
      ['妹妹威林', null, {}],
      ['宸麟數學', 5600, {}],
      ['宸麟威林', 5100, {}],
      ['宸麟家教', 5600, {}],
      ['電費', null, { v: '街口帳戶' }],
      ['水費', null, { d: '11-01', v: '街口帳戶' }],
    ],
  },

  '2026-10': {
    c: {
      fubon:       [14903, '10-01'],
      yushan:      [18665, '10-13'],
      ctc:         [5849,  '10-01'],
      yongfeng:    [0,     '10-03'],
      taishin:     [18103, '10-27'],
      union:       [1088,  '10-21'],
      dbs:         [0,     null, '台銀', '原文「/29 台銀已繳」'],
      scb:         [12297, '10-07'],
      wife_ctc:    [0,     null, '曉君國泰', '9/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '9/27 結帳，玉山帳戶扣款'],
    },
    o: [
      ['遠傳電話費', 1258, { d: '10-28', p: '10-16', v: '萊爾富聯邦' }],
      ['宸麟電話費', 376,  { d: '10-22', p: '10-16', v: '萊爾富聯邦' }],
      ['9733聯邦信貸', 9733, { p: '10-26', v: '聯邦', inst: [44, 72] }],
      ['24213台新信貸', 24213, { p: '10-10', v: '台新', inst: [11, 84] }],
      ['妹妹數學', 3000, { p: '10-13' }],
      ['妹妹威林', 4000, { p: '10-27' }],
      ['宸麟威林', 5100, { p: '10-07' }],
      ['宸麟數學', 5600, { p: '10-07' }],
      ['宸麟學雜', null, { d: '10-14', n: '原文「/14 元」，金額空白' }],
      ['電費', 2590, { p: '10-27', v: '聯邦' }],
      ['電費', 2157, { p: '10-27', v: '聯邦' }],
      ['水費', null, { d: '10-01', v: '街口帳戶', n: '金額空白' }],
      ['漁會', 13000, { p: '06-05', n: '年繳' }],
      ['房貸', 40000, { p: '09-29' }],
      ['燃料稅', null, { v: 'ipassmoney', n: '原文「/16 轉 ipassmoney」，金額空白' }],
      ['宸麟保費', null, { v: '曉君國泰', n: '原文「/20 元 曉君國泰已繳」，金額空白' }],
    ],
  },

  '2026-09': {
    c: {
      fubon:       [7056,  '09-01'],
      yushan:      [18474, '09-13'],
      ctc:         [2712,  '09-01'],
      yongfeng:    [0,     '09-03'],
      taishin:     [8744,  '09-29'],
      union:       [1088,  '09-21'],
      dbs:         [2110,  '09-29'],
      scb:         [0,     '09-06'],
      wife_ctc:    [0,     null, '曉君國泰', '8/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '8/27 結帳，玉山帳戶扣款'],
    },
    o: [
      ['遠傳電話費', null, { d: '09-28', p: '09-16', v: 'Line渣打', n: '原文期限寫 8/28，金額空白' }],
      ['宸麟電話費', null, { d: '09-22', p: '09-16', v: 'Line渣打', n: '原文「10/22」疑為 9/22' }],
      ['9733聯邦信貸', 9733, { p: '09-22', v: '聯邦', inst: [42, 72] }],
      ['24213台新信貸', 24213, { p: '09-10', v: '台新', inst: [10, 84] }],
      ['妹妹數學', 3750, { p: '09-01' }],
      ['妹妹威林', 4000, { p: '09-14' }],
      ['宸麟家教', 0, { paid: true, n: '0 元' }],
      ['宸麟數學', 5600, { p: '09-09' }],
      ['宸麟學雜', 10567, { p: '09-14', v: '渣打' }],
      ['電費', 3017, { p: '09-01', v: '玉山' }],
      ['電費', 2934, { p: '09-01', v: '街口帳戶' }],
      ['水費', 566, { p: '09-01', v: '街口帳戶' }],
      ['漁會', 13000, { p: '06-05', n: '年繳' }],
      ['房貸', 40000, { p: '09-29' }],
      ['燃料稅', null, { p: '09-16', v: 'ipassmoney', n: '金額空白' }],
      ['宸麟保費', null, { p: '09-20', v: '曉君國泰', n: '金額空白' }],
    ],
  },

  '2026-08': {
    c: {
      fubon:       [4959,  '08-01'],
      yushan:      [103192, '08-13'],
      ctc:         [5754,  '08-01'],
      yongfeng:    [0,     '08-03'],
      taishin:     [0,     '08-27'],
      union:       [18253, '08-21'],
      dbs:         [0,     null, '台銀', '原文「/13 台銀已繳」'],
      scb:         [0,     '08-06'],
      wife_ctc:    [0,     null, '曉君國泰', '8/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '8/27 結帳，玉山帳戶扣款'],
    },
    o: [
      ['遠傳電話費', 1288, { d: '08-28', p: '08-16', v: 'Line渣打' }],
      ['遠傳電話費', 66, { p: '08-16', v: 'Line渣打', n: '原文 33+33' }],
      ['宸麟電話費', 366, { d: '08-22', p: '08-16', v: 'Line渣打' }],
      ['9733聯邦信貸', 9733, { p: '08-29', v: '聯邦', inst: [41, 72] }],
      ['24213台新信貸', 24213, { p: '08-10', v: '台新', inst: [9, 84] }],
      ['妹妹數學', 3000, { p: '08-04' }],
      ['妹妹威林', null, { p: '07-16', n: '金額空白' }],
      ['宸麟數學', 6300, { p: '08-18' }],
      ['電費', null, { p: '08-28', v: '街口帳戶', n: '已繳，止 8/28，金額空白' }],
      ['水費', null, { d: '08-19', v: 'ipassmoney', n: '金額空白' }],
      ['漁會', 13000, { p: '06-05', n: '年繳' }],
      ['房貸', 40000, { p: '08-01' }],
      ['燃料稅', 4158, { p: '07-16', v: 'ipassmoney' }],
      ['宸麟保費', 18344, { p: '07-20', v: '曉君國泰' }],
    ],
  },

  '2026-07': {
    c: {
      fubon:       [9030,   '07-07'],
      yushan:      [102068, '07-13'],
      ctc:         [53050,  '06-29', '中信'],
      yongfeng:    [620,    '07-03'],
      taishin:     [0,      '07-27'],
      union:       [90551,  '07-21'],
      dbs:         [0,      null, '台銀', '原文「/13 台銀已繳」'],
      scb:         [null,   '07-06', 'LineBank', '金額空白'],
      wife_ctc:    [0,      null, '曉君國泰', '7/14 結帳，曉君國泰扣款'],
      wife_yushan: [466,    '07-27'],
    },
    o: [
      ['遠傳電話費', null, { d: '08-28', p: '07-18', v: '中信', n: '期限寫 8/28，金額空白' }],
      ['宸麟電話費', 366, { p: '07-05', v: 'ipass' }],
      ['9733聯邦信貸', 9733, { p: '06-25', v: '聯邦', inst: [40, 72] }],
      ['24213台新信貸', 24213, { p: '07-10', v: '台新', inst: [8, 84] }],
      ['妹妹數學', 4800, { p: '07-07' }],
      ['妹妹威林', 5600, { p: '07-16' }],
      ['宸麟家教', 5600, { paid: true, n: '原文殘缺：6/21、7/12、7/19，另有 4200' }],
      ['宸麟數學', 4700, { p: '07-23' }],
      ['電費', 2524, { v: '街口帳戶', n: '已繳，止 6/28' }],
      ['電費', 1519, { v: '街口帳戶', n: '已繳，止 6/28' }],
      ['水費', 676, { p: '07-19', v: 'ipassmoney' }],
      ['漁會', 13000, { p: '06-05', n: '年繳' }],
      ['房貸', 40000, { p: '06-05' }],
      ['燃料稅', 4158, { p: '07-16', v: 'ipassmoney' }],
      ['宸麟保費', 18344, { p: '07-20', v: '曉君國泰' }],
    ],
  },

  '2026-06': {
    c: {
      fubon:       [11902, '06-02'],
      yushan:      [31956, '06-12'],
      ctc:         [10256, '06-02', '中信'],
      yongfeng:    [0,     '05-03', 'DAWHO', '原文 4/18 結 5/3 扣'],
      taishin:     [334,   '06-29'],
      union:       [1088,  '06-21'],
      dbs:         [44,    '06-13'],
      scb:         [1560,  '06-06'],
      wife_ctc:    [0,     null, '曉君國泰', '6/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '6/4 結帳，Richart 轉'],
    },
    o: [
      ['遠傳電話費', 1341, { d: '06-28', p: '06-18', v: '中信鼎極卡' }],
      ['宸麟電話費', null, { p: '06-05', v: 'ipass', n: '金額空白' }],
      ['9733聯邦信貸', 9733, { p: '05-27', v: '聯邦', inst: [39, 72] }],
      ['24213台新信貸', 24213, { p: '06-10', v: '台新', inst: [7, 84] }],
      ['妹妹數學', 3000, { p: '06-02' }],
      ['妹妹威林', null, { n: '已繳，金額空白' }],
      ['宸麟數學', 4900, { p: '06-10' }],
      ['電費', null, { n: '已繳，金額空白' }],
      ['水費', null, { v: '帳戶', n: '已繳，金額空白' }],
      ['漁會', 13000, { p: '06-05', n: '年繳' }],
      ['房貸', 40000, { p: '06-05' }],
    ],
  },

  '2026-05': {
    c: {
      fubon:       [11628, '05-04'],
      yushan:      [22902, '05-13'],
      ctc:         [17017, '05-01', '中信'],
      yongfeng:    [0,     '05-03'],
      taishin:     [10630, '05-27'],
      union:       [61088, '05-21'],
      dbs:         [0,     null, '台銀', '台銀已繳'],
      scb:         [1960,  '06-06'],
      wife_ctc:    [0,     null, '曉君國泰', '5/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '5/4 結帳，Richart 轉'],
    },
    o: [
      ['遠傳電話費', null, { d: '06-28', v: '中信鼎極卡', n: '已繳，金額空白' }],
      ['宸麟電話費', null, { p: '06-05', v: 'ipass', n: '金額空白' }],
      ['9733聯邦信貸', 9733, { v: '聯邦', inst: [39, 72], n: '已繳款' }],
      ['24213台新信貸', 24213, { p: '05-10', v: '台新', inst: [6, 84] }],
      ['妹妹數學', 3000, { p: '05-05' }],
      ['妹妹威林', null, { n: '已繳，金額空白' }],
      ['宸麟家教', 5600, { paid: true }],
      ['宸麟數學', 3500, { p: '05-13' }],
      ['電費', 1648, { p: '04-26', v: '街口餘額', n: '止 5/16' }],
      ['電費', 779, { p: '04-26', v: '街口餘額', n: '止 5/16' }],
      ['水費', 771, { p: '05-11', v: '街口帳戶' }],
      ['房屋稅', 6114, { p: '05-01', v: '中信' }],
      ['妹妹午餐', 1960, { p: '05-13', v: '渣打' }],
    ],
  },

  '2026-04': {
    c: {
      fubon:       [2539,  '04-02'],
      yushan:      [20456, '04-13'],
      ctc:         [7441,  '04-02', '中信'],
      yongfeng:    [0,     '04-03'],
      taishin:     [180,   '04-27'],
      union:       [1160,  '04-21'],
      dbs:         [4886,  '04-18'],
      scb:         [9527,  '04-06'],
      wife_ctc:    [0,     null, '曉君國泰', '4/14 結帳，曉君國泰扣款'],
      wife_yushan: [0,     null, '玉山帳戶', '4/4 結帳，Richart 轉'],
    },
    o: [
      ['遠傳電話費', 1342, { d: '04-28', p: '04-25', v: '中信鼎極卡' }],
      ['宸麟電話費', 376, { p: '04-05', v: 'ipass' }],
      ['9733聯邦信貸', 9733, { p: '04-23', v: '聯邦', inst: [38, 72] }],
      ['24213台新信貸', 24213, { p: '04-10', v: '台新', inst: [5, 84] }],
      ['妹妹數學', 2800, { p: '04-08' }],
      ['妹妹威林', null, { n: '已繳，金額空白' }],
      ['宸麟金牌', null, { v: '台銀', n: '台銀轉，金額空白' }],
      ['宸麟數學', 3500, { p: '04-07' }],
      ['電費', 1648, { p: '04-26', v: '街口餘額', n: '止 5/16' }],
      ['電費', 779, { p: '04-26', v: '街口餘額', n: '止 5/16' }],
    ],
  },

  '2026-03': {
    c: {
      fubon:       [18100, '03-02'],
      yushan:      [37531, '03-12'],
      ctc:         [4240,  '03-02', '中信'],
      yongfeng:    [188,   '03-03'],
      taishin:     [128,   '03-27'],
      union:       [1481,  '03-26'],
      dbs:         [0,     null, '台銀', '台銀已繳'],
      scb:         [0,     '04-06'],
      wife_ctc:    [1036,  '03-14', '曉君國泰'],
      wife_yushan: [464,   '03-04'],
    },
    o: [
      ['遠傳電話費', null, { d: '12-28', n: '已繳，金額空白' }],
      ['宸麟電話費', 188, { p: '02-06', v: 'Line Pay' }],
      ['9733聯邦信貸', 9733, { p: '03-25', v: '聯邦', inst: [36, 72] }],
      ['24213台新信貸', 24213, { p: '03-10', v: '台新', inst: [4, 84] }],
      ['妹妹數學', 3750, { p: '03-10' }],
      ['妹妹威林', 5600, { p: '03-12' }],
      ['宸麟金牌', null, { v: '台銀', n: '台銀轉，金額空白' }],
      ['宸麟數學', 2800, { paid: true }],
      ['電費', 1156, { v: '中信', n: '已繳，止 3/16' }],
      ['電費', 1057, { v: '街口餘額', n: '已繳，止 3/16' }],
      ['南科學雜', 9487, { p: '03-02', v: '渣打Line' }],
      ['妹妹學雜', 5186, { p: '03-17', v: '星展', n: '原文 4431+755' }],
    ],
  },

  '2026-02': {
    c: {
      fubon:       [18100, '03-02', '台銀', '與 3 月完全相同，疑似複製未更新'],
      yushan:      [37531, '03-12', '玉山帳戶', '與 3 月完全相同，疑似複製未更新'],
      ctc:         [4240,  '03-02', '中信', '與 3 月完全相同，疑似複製未更新'],
      yongfeng:    [188,   '03-03', 'DAWHO', '與 3 月完全相同，疑似複製未更新'],
      taishin:     [26459, '03-09'],
      union:       [1505,  '02-26'],
      dbs:         [0,     null, '台銀', '台銀已繳'],
      scb:         [0,     '03-06'],
      wife_ctc:    [1624,  null, 'Richart', '2/14 結帳，Richart 扣款'],
      wife_yushan: [464,   '03-04', '玉山帳戶', 'Richart 轉'],
    },
    o: [
      ['遠傳電話費', null, { d: '12-28', n: '已繳，金額空白' }],
      ['宸麟電話費', 188, { p: '02-06', v: 'Line Pay' }],
      ['9733聯邦信貸', 9733, { p: '02-25', v: '聯邦', inst: [36, 72] }],
      ['24213台新信貸', 24213, { p: '02-10', v: '台新', inst: [3, 84] }],
      ['妹妹數學', null, { d: '02-14', n: '已繳，金額空白' }],
      ['妹妹威林', null, { d: '02-14', n: '已繳，金額空白' }],
      ['宸麟金牌', null, { v: '台銀', n: '台銀轉，金額空白' }],
      ['宸麟數學', 4700, { p: '02-09' }],
    ],
  },

  '2026-01': {
    c: {
      fubon:    [6952,  '02-02'],
      yushan:   [null,  '02-12'],
      ctc:      [2479,  '02-02', '中信'],
      yongfeng: [5605,  '02-03'],
      taishin:  [6207,  '01-27'],
      union:    [1088,  '01-21'],
      dbs:      [17169, '01-24'],
      scb:      [null,  '02-06', 'LineBank', '金額空白'],
    },
    o: [],
  },
};

/* ------------------------------------------------------------------ *
 * 3. 固定項目範本（給未來月份自動帶入）
 * ------------------------------------------------------------------ */
const TEMPLATES = [
  { name: '遠傳電話費', amount: 1258,  dueDay: 28, via: '',            recurrence: 'monthly' },
  { name: '宸麟電話費', amount: 376,   dueDay: 22, via: '',            recurrence: 'monthly' },
  { name: '9733聯邦信貸', amount: 9733,  dueDay: null, via: '聯邦',    recurrence: 'monthly', inst: [45, 72] },
  { name: '24213台新信貸', amount: 24213, dueDay: null, via: '台新',   recurrence: 'monthly', inst: [12, 84] },
  { name: '房貸',       amount: 40000, dueDay: null, via: '轉帳',      recurrence: 'monthly' },
  { name: '電費',       amount: null,  dueDay: null, via: '街口帳戶',  recurrence: 'monthly' },
  { name: '水費',       amount: null,  dueDay: 1,    via: '街口帳戶',  recurrence: 'monthly' },
  { name: '妹妹數學',   amount: null,  dueDay: null, via: '',          recurrence: 'monthly' },
  { name: '妹妹威林',   amount: null,  dueDay: null, via: '',          recurrence: 'monthly' },
  { name: '宸麟數學',   amount: 5600,  dueDay: null, via: '',          recurrence: 'monthly' },
  { name: '宸麟威林',   amount: 5100,  dueDay: null, via: '',          recurrence: 'monthly' },
  { name: '宸麟家教',   amount: 5600,  dueDay: null, via: '',          recurrence: 'monthly' },
  { name: '宸麟學雜',   amount: null,  dueDay: 14,   via: '',          recurrence: 'yearly', month: 9 },
  { name: '燃料稅',     amount: 4158,  dueDay: 16,   via: 'ipassmoney', recurrence: 'yearly', month: 7 },
  { name: '宸麟保費',   amount: 18344, dueDay: 20,   via: '曉君國泰',  recurrence: 'yearly', month: 7 },
  { name: '漁會',       amount: 13000, dueDay: 5,    via: '轉帳',      recurrence: 'yearly', month: 6 },
  { name: '房屋稅',     amount: 6114,  dueDay: 1,    via: '中信',      recurrence: 'yearly', month: 5 },
  { name: '妹妹午餐',   amount: 1960,  dueDay: 13,   via: '渣打',      recurrence: 'yearly', month: 5 },
  { name: '南科學雜',   amount: 9487,  dueDay: 2,    via: '渣打Line',  recurrence: 'yearly', month: 3 },
  { name: '妹妹學雜',   amount: 5186,  dueDay: 17,   via: '星展',      recurrence: 'yearly', month: 3 },
];

/* ------------------------------------------------------------------ *
 * 4. 日期換算：把 MM-DD 對到「最接近帳單月份」的年份
 * ------------------------------------------------------------------ */
function isoDate(labelMonth, md) {
  if (!md) return null;
  const [ly, lm] = labelMonth.split('-').map(Number);
  const [mm, dd] = md.split('-').map(Number);
  let year = ly;
  if (mm - lm > 6) year -= 1;
  else if (lm - mm > 6) year += 1;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

/* ------------------------------------------------------------------ *
 * 5. 產生 seed
 * ------------------------------------------------------------------ */
const cardById = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const months = {};

for (const [label, payload] of Object.entries(DATA)) {
  const cards = {};
  for (const [id, row] of Object.entries(payload.c)) {
    const meta = cardById[id];
    const [amount, paidDate, via, note] = row;
    const [ly, lm] = label.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    // 結帳日固定落在繳款月的前一個月，例如 10 月帳單 = 9/24 結帳
    const stmtMonthIndex = lm - 1 === 0 ? 12 : lm - 1;
    const stmtYear = stmtMonthIndex === 12 ? ly - 1 : ly;
    cards[id] = {
      amount: amount ?? null,
      stmtDate: `${stmtYear}-${pad(stmtMonthIndex)}-${pad(meta.stmtDay)}`,
      dueDate: meta.dueDay ? `${ly}-${pad(lm)}-${pad(meta.dueDay)}` : null,
      paid: paidDate !== null || /已繳|已轉|扣款|扣|轉/.test(note || ''),
      paidDate: isoDate(label, paidDate),
      via: via || meta.via,
      note: note || '',
    };
  }

  const others = (payload.o || []).map((row, i) => {
    const [name, amount, opt = {}] = row;
    return {
      id: `o${label.replace('-', '')}${String(i + 1).padStart(2, '0')}`,
      name,
      amount: amount ?? null,
      dueDate: isoDate(label, opt.d),
      paid: opt.paid ?? (!!opt.p || /已繳|已轉|扣款|扣|轉/.test(opt.n || '')),
      paidDate: isoDate(label, opt.p),
      via: opt.v || '',
      note: opt.n || '',
      inst: opt.inst ? { cur: opt.inst[0], total: opt.inst[1] } : null,
    };
  });

  months[label] = { cards, others };
}

const seed = {
  app: '帳單備忘錄',
  version: 2,
  currency: 'TWD',
  cards: CARDS,
  templates: TEMPLATES.map((t, i) => ({
    id: `t${String(i + 1).padStart(2, '0')}`,
    ...t,
    ...(Array.isArray(t.inst) ? { inst: { cur: t.inst[0], total: t.inst[1] } } : {}),
  })),
  months,
  sourceNote: '原始資料：使用者 1～10 月手寫備忘錄（2026 年）。金額空白者以 null 表示，不推測。',
};

const out = `/* 由 scripts/build-seed.mjs 自動產生，請勿直接手改。 */
export const SEED = ${JSON.stringify(seed, null, 2)};
`;

writeFileSync(join(ROOT, 'js', 'seed.js'), out, 'utf8');

/* 摘要，方便人工核對 */
const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
console.log('月份    信用卡小計   其他小計   合計');
for (const [label, m] of Object.entries(months)) {
  const c = Object.values(m.cards).reduce((s, x) => s + (x.amount || 0), 0);
  const o = m.others.reduce((s, x) => s + (x.amount || 0), 0);
  console.log(`${label}  ${String(fmt(c)).padStart(10)}  ${String(fmt(o)).padStart(9)}  ${String(fmt(c + o)).padStart(9)}`);
}
console.log('\n已寫入 js/seed.js');
