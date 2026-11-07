/**
 * 狀態容器：localStorage 為主，任何變更都會通知 UI 與同步層。
 */
import { SEED } from './seed.js';
import { ymNow } from './logic.js';
import { canonicalMonths, monthsEqual, mergeTemplates, mergeCards, listsEqual } from './merge.js';

const KEY = 'bills-pwa:v1';

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const uid = (prefix = 'x') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * 舊版內建的公開同步碼。它寫在公開的程式碼裡，任何人都能解開這個房間，
 * 所以不再使用；保留常數只為了偵測舊裝置並提醒搬家、清除雲端舊資料。
 */
export const LEGACY_PUBLIC_SYNC_CODE = 'BILLS-DEFAULT-2026';

export const normalizeCode = (code) =>
  String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const isPublicCode = (code) => normalizeCode(code) === normalizeCode(LEGACY_PUBLIC_SYNC_CODE);

function defaultSettings() {
  return {
    deviceId: uid('d'),
    deviceName: '',
    // 同步預設關閉：必須由使用者產生或輸入只有自己知道的同步碼才會上傳
    syncEnabled: false,
    syncCode: '',
    syncDisabledByUser: false,
    legacyPublicRoom: false,
    lastSyncAt: null,
  };
}

export function defaultState() {
  const st = clone(SEED);
  const months = Object.keys(st.months).sort();
  const now = ymNow();
  st.activeMonth = st.months[now] ? now : months[months.length - 1] || now;
  st.settings = defaultSettings();
  st.updatedAt = new Date().toISOString();
  return st;
}

let state = null;
const listeners = new Set();
let saveTimer = null;

export function migrate(stored) {
  const base = defaultState();
  const st = { ...base, ...stored };
  st.settings = { ...base.settings, ...(stored.settings || {}) };
  // 舊版裝置還在用公開同步碼：立刻停止同步，並標記成需要換私人碼、清除公開房間
  if (isPublicCode(st.settings.syncCode)) {
    st.settings.syncEnabled = false;
    st.settings.syncCode = '';
    st.settings.legacyPublicRoom = true;
  }
  // 用 Array.isArray 判斷：使用者若把卡片／範本刪光（空陣列）也要尊重，不要補回種子資料
  st.cards = (Array.isArray(stored.cards) ? stored.cards : base.cards).filter(
    (c) => c && typeof c === 'object' && c.id,
  );
  st.templates = (Array.isArray(stored.templates) ? stored.templates : base.templates).filter(
    (t) => t && typeof t === 'object' && t.id,
  );
  st.months =
    stored.months && typeof stored.months === 'object' && !Array.isArray(stored.months)
      ? stored.months
      : base.months;
  // 匯入舊備份或雲端資料可能缺少 cards／others，補成安全形狀避免渲染時崩潰
  for (const [ym, m] of Object.entries(st.months)) {
    if (!m || typeof m !== 'object') {
      st.months[ym] = { cards: {}, others: [] };
      continue;
    }
    st.months[ym] = {
      ...m,
      cards: m.cards && typeof m.cards === 'object' && !Array.isArray(m.cards) ? m.cards : {},
      others: Array.isArray(m.others) ? m.others : [],
    };
  }

  // 種子資料更新時，補進本機沒有的月份（不覆蓋已編輯內容）
  for (const [ym, month] of Object.entries(base.months)) {
    if (!st.months[ym]) st.months[ym] = month;
  }
  if (!/^\d{4}-\d{2}$/.test(st.activeMonth || '')) {
    const ms = Object.keys(st.months).sort();
    st.activeMonth = ms[ms.length - 1] || ymNow();
  }
  return st;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = migrate(JSON.parse(raw));
      return state;
    }
  } catch (err) {
    console.warn('讀取本機資料失敗，改用種子資料', err);
  }
  state = defaultState();
  persistNow();
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

export function persistNow() {
  if (!state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('寫入本機失敗', err);
    emit('storage-error', { error: err });
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason, detail = {}) {
  for (const fn of listeners) fn(reason, detail);
}

/** 唯一合法的修改入口：commit((state) => { ... }) */
export function commit(mutator, reason = 'edit', { persist = true } = {}) {
  if (!state) load();
  const result = mutator(state);
  state.updatedAt = new Date().toISOString();
  if (persist) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 120);
  }
  emit(reason, { result });
  return result;
}

/** 從雲端覆蓋本機（同步用） */
export function replaceState(next, reason = 'remote') {
  const keep = state?.settings || {};
  state = migrate(next);
  state.settings = { ...state.settings, ...keep };
  persistNow();
  emit(reason, {});
}

/**
 * 合併後的資料寫回本機。只有真的變動才通知 UI。
 * 回傳 true 表示有變動。
 */
export function applyMerged(months, templates, cards) {
  if (!state) load();
  const mergedSource = months && Object.keys(months).length ? months : state.months;
  const nextMonths = canonicalMonths(mergedSource);
  const nextTemplates = templates ? mergeTemplates(state.templates, templates) : state.templates;
  const nextCards = cards ? mergeCards(state.cards, cards) : state.cards;
  const monthsChanged = !monthsEqual(state.months, nextMonths);
  const templatesChanged = !listsEqual(state.templates, nextTemplates);
  const cardsChanged = !listsEqual(state.cards, nextCards);
  if (!monthsChanged && !templatesChanged && !cardsChanged) return false;
  if (monthsChanged) state.months = nextMonths;
  if (templatesChanged) state.templates = nextTemplates;
  if (cardsChanged) state.cards = nextCards;
  persistNow();
  emit('remote', {});
  return true;
}

export function setActiveMonth(ym) {
  commit((s) => {
    s.activeMonth = ym;
  }, 'month');
}

export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.months || Array.isArray(data.months)) {
    throw new Error('格式不正確：找不到 months 資料');
  }
  replaceState({ ...data, version: SEED.version }, 'import');
}

export function resetToSeed() {
  const st = defaultState();
  replaceState(st, 'reset');
}

export function storageBytes() {
  try {
    return new Blob([localStorage.getItem(KEY) || '']).size;
  } catch {
    return 0;
  }
}
