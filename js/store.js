/**
 * 狀態容器：localStorage 為主，任何變更都會通知 UI 與同步層。
 */
import { SEED } from './seed.js';
import { ensureMonth, ymNow } from './logic.js';

const KEY = 'bills-pwa:v1';

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const uid = (prefix = 'x') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function defaultSettings() {
  return {
    deviceId: uid('d'),
    deviceName: '',
    syncEnabled: false,
    syncCode: '',
    lastSyncAt: null,
  };
}

export function defaultState() {
  const st = clone(SEED);
  const months = Object.keys(st.months).sort();
  st.activeMonth = months[months.length - 1] || ymNow();
  st.settings = defaultSettings();
  st.updatedAt = new Date().toISOString();
  return st;
}

let state = null;
const listeners = new Set();
let saveTimer = null;

function migrate(stored) {
  const base = defaultState();
  const st = { ...base, ...stored };
  st.settings = { ...base.settings, ...(stored.settings || {}) };
  st.cards = stored.cards?.length ? stored.cards : base.cards;
  st.templates = stored.templates?.length ? stored.templates : base.templates;
  st.months = stored.months && typeof stored.months === 'object' ? stored.months : base.months;

  // 種子資料更新時，補進本機沒有的月份（不覆蓋已編輯內容）
  for (const [ym, month] of Object.entries(base.months)) {
    if (!st.months[ym]) st.months[ym] = month;
  }
  if (!st.activeMonth) {
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
  if (!data || typeof data !== 'object' || !data.months) {
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
