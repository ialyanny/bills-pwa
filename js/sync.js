/**
 * 跨裝置同步：Supabase + 端對端加密
 *
 * 設計理由：
 *   1. 錢的資料不該用「任何人拿到 anon key 就能讀」的方式放雲端，
 *      所以整份 JSON 先用同步碼（passphrase）加密再上傳，Supabase 只存密文。
 *   2. 同步碼同時決定「房間」：同一組碼 = 同一份帳本。
 *   3. 離線時照常使用，回到線上自動補傳。
 *   4. 每次同步都是「先抓遠端 → 逐筆合併 → 需要才上傳」，
 *      避免電腦用舊資料覆蓋手機剛勾的已繳。
 */
import {
  getState,
  applyMerged,
  persistNow,
  commit,
  normalizeCode,
  isPublicCode,
  LEGACY_PUBLIC_SYNC_CODE,
} from './store.js';
import { mergeMonths, remoteIsBehind } from './merge.js';

const SUPABASE_URL = 'https://nutkocotbncqxgvjkfxi.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dGtvY290Ym5jcXhndmprZnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTcwMjcsImV4cCI6MjEwMTQzMzAyN30.yfvXV2dvYhS8cTLgyir-ddaVb5oqbYIDyjngINVccfE';
const TABLE = 'bills_state';
const POLL_MS = 12000;

let client = null;
let channel = null;
let keyCache = null;
let statusCb = () => {};
let lastError = '';
let dirty = true;
let changeSeq = 0; // 每次本機改動 +1，用來判斷同步途中是否又有新改動
let running = null;
let rerun = false;
let debounce = null;
let pollTimer = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

function setStatus(state, detail) {
  statusCb(state, detail || '');
}

/* ---------------------------------------------------------------- *
 * 同步碼 -> 房間 + 金鑰
 * ---------------------------------------------------------------- */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(code) {
  const room = (await sha256Hex(`bills-room:v1:${normalizeCode(code)}`)).slice(0, 32);
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizeCode(code)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(`bills-key:v1:${room}`), iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { room, key };
}

function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function encryptJSON(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const merged = new Uint8Array(iv.length + ct.length);
  merged.set(iv, 0);
  merged.set(ct, iv.length);
  return toB64(merged);
}

async function decryptJSON(b64, key) {
  const raw = fromB64(b64);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(plain));
}

/* ---------------------------------------------------------------- *
 * Supabase
 * ---------------------------------------------------------------- */
async function getClient() {
  if (client) return client;
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  client = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

async function readRemote(room) {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select('room,payload,updated_at,device')
    .eq('room', room)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function writeRemote(room, payload) {
  const sb = await getClient();
  const row = {
    room,
    payload,
    updated_at: new Date().toISOString(),
    device: getState().settings.deviceId,
  };
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: 'room' });
  if (error) throw error;
}

/* ---------------------------------------------------------------- *
 * 同步循環
 * ---------------------------------------------------------------- */
function snapshotForCloud() {
  const st = getState();
  return {
    version: st.version,
    cards: st.cards,
    templates: st.templates,
    months: st.months,
    updatedAt: st.updatedAt,
  };
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/Could not find the table|does not exist|schema cache/i.test(msg)) {
    return '雲端資料表還沒建立，請先執行 supabase-bills.sql';
  }
  if (/Failed to fetch|NetworkError|offline/i.test(msg)) return '連不到網路，稍後自動重試';
  return msg;
}

async function runSync(silent) {
  const { syncEnabled, syncCode } = getState().settings;
  // 公開同步碼任何人都能解開，絕不往那個房間寫
  if (!syncEnabled || !normalizeCode(syncCode) || isPublicCode(syncCode)) return false;
  const seqAtStart = changeSeq;
  try {
    if (!silent) setStatus('syncing');
    const { room, key } = keyCache || (keyCache = await deriveKey(syncCode));

    const row = await readRemote(room);
    let changed = false;
    let behind = !row?.payload;
    if (row?.payload) {
      const remote = await decryptJSON(row.payload, key);
      const merged = mergeMonths(getState().months, remote.months || {});
      changed = applyMerged(merged, remote.templates, remote.cards);
      // 雲端可能被另一台用舊資料覆蓋過：合併後本機若有雲端沒有的內容，就要補傳
      behind = remoteIsBehind(getState(), remote);
    }

    // 同步途中若使用者關閉同步或換了同步碼，就不要把資料寫進舊房間
    if (
      !getState().settings.syncEnabled ||
      normalizeCode(getState().settings.syncCode) !== normalizeCode(syncCode)
    ) {
      return false;
    }

    if (dirty || behind) {
      await writeRemote(room, await encryptJSON(snapshotForCloud(), key));
      // 若上傳期間又有本機改動，保留 dirty 讓下一次同步補送
      if (changeSeq === seqAtStart) dirty = false;
    }

    // 若啟動時曾因離線而沒訂閱 realtime，第一次成功同步後補訂閱
    if (!channel && client) subscribeRealtime(room, key);

    const st = getState();
    st.settings.lastSyncAt = new Date().toISOString();
    persistNow();
    lastError = '';
    setStatus('ok', changed ? '已接收其他裝置的更新' : '');
    return true;
  } catch (err) {
    console.error('同步失敗', err);
    lastError = friendlyError(err);
    setStatus('error', lastError);
    return false;
  }
}

/** 立即同步（同一時間只會跑一個；若途中被呼叫，結束後會再補一次） */
export function syncNow({ silent = true } = {}) {
  if (running) {
    rerun = true;
    return running;
  }
  running = runSync(silent).finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      syncNow({ silent: true });
    }
  });
  return running;
}

/** 本機改動後排隊同步：離線也會留著 dirty，回線後補傳 */
export function scheduleSync(delay = 400) {
  dirty = true;
  changeSeq += 1;
  clearTimeout(debounce);
  debounce = setTimeout(() => syncNow({ silent: true }), delay);
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && getState().settings.syncEnabled && !running) {
      syncNow({ silent: true });
    }
  }, POLL_MS);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function subscribeRealtime(room, key) {
  if (!client) return;
  if (channel) {
    client.removeChannel(channel);
    channel = null;
  }
  channel = client
    .channel(`bills:${room}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `room=eq.${room}` },
      (payload) => {
        const row = payload?.new;
        if (row?.device && row.device === getState().settings.deviceId) return;
        // 不在這裡直接解，交給 syncNow 走同一套合併邏輯
        setTimeout(() => syncNow({ silent: true }), 250);
      },
    )
    .subscribe();
}

/* ---------------------------------------------------------------- *
 * 對外 API
 * ---------------------------------------------------------------- */
export async function enableSync(code) {
  // 沒填同步碼時沿用這台裝置上次的碼；沒有就要求使用者產生或輸入，不再退回公開碼
  const clean = normalizeCode(code || getState().settings.syncCode);
  if (!clean) throw new Error('請先按「產生」建立同步碼，或輸入另一台裝置的同步碼');
  if (isPublicCode(clean)) throw new Error('這是舊版公開的同步碼，任何人都能解開，請改用新的同步碼');
  if (clean.length < 8) throw new Error('同步碼至少 8 個英數字元');
  commit((s) => {
    s.settings.syncEnabled = true;
    // 換了同步碼就重新計算「最後同步時間」，清除公開房間前要確認新房間真的同步成功過
    if (normalizeCode(s.settings.syncCode) !== clean) s.settings.lastSyncAt = null;
    s.settings.syncCode = clean;
    s.settings.syncDisabledByUser = false;
  }, 'sync-setting');
  keyCache = null;
  dirty = true;
  await start();
}

export function disableSync() {
  commit((s) => {
    s.settings.syncEnabled = false;
    // 保留原本的同步碼，重新開啟時不必再輸入一次
    s.settings.syncDisabledByUser = true;
  }, 'sync-setting');
  keyCache = null;
  dirty = false;
  clearTimeout(debounce);
  stopPolling();
  if (channel && client) client.removeChannel(channel);
  channel = null;
  setStatus('disabled');
}

export async function start() {
  const { syncEnabled, syncCode } = getState().settings;
  if (!syncEnabled || !normalizeCode(syncCode) || isPublicCode(syncCode)) {
    setStatus('disabled');
    return;
  }
  // 先啟動輪詢，確保就算第一次連線失敗，之後也會自動重試
  startPolling();
  try {
    setStatus('syncing');
    lastError = '';
    await getClient();
    keyCache = await deriveKey(syncCode);
    subscribeRealtime(keyCache.room, keyCache.key);
    await syncNow({ silent: true });
    if (lastError) setStatus('error', lastError);
  } catch (err) {
    lastError = friendlyError(err);
    setStatus('error', lastError);
  }
}

export function initSync(cb) {
  statusCb = cb;

  const kick = (why) => {
    if (!getState().settings.syncEnabled) return;
    if (dirty) syncNow({ silent: true });
    else if (why !== 'poll') syncNow({ silent: true });
  };

  window.addEventListener('online', () => {
    setStatus('online');
    syncNow({ silent: true });
  });
  window.addEventListener('offline', () => setStatus('offline'));

  // 回到前景、切回分頁、視窗取得焦點 → 立刻補一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick('visible');
    else if (dirty) syncNow({ silent: true }); // 收起前把未送的送出去
  });
  window.addEventListener('focus', () => kick('focus'));

  // 關閉頁面前把 dirty 的資料送出（能送就送）
  window.addEventListener('pagehide', () => {
    if (dirty) syncNow({ silent: true });
  });

  start();
}

/**
 * 刪除舊版公開房間（BILLS-DEFAULT-2026）在雲端的那一列。
 * 只有在這台裝置已經用私人同步碼成功同步過之後才允許，確保資料已經搬到新房間。
 */
export async function clearPublicRoom() {
  const { syncEnabled, syncCode, lastSyncAt } = getState().settings;
  if (!syncEnabled || !normalizeCode(syncCode) || isPublicCode(syncCode) || !lastSyncAt) {
    throw new Error('請先用新的同步碼完成一次同步，再清除公開房間');
  }
  const { room } = await deriveKey(LEGACY_PUBLIC_SYNC_CODE);
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq('room', room);
  if (error) throw error;
  commit((s) => {
    s.settings.legacyPublicRoom = false;
  }, 'sync-setting');
}

export function isConfigured() {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

/** 產生好念的同步碼：XXXX-XXXX-XXXX */
export function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => {
    const buf = crypto.getRandomValues(new Uint8Array(4));
    return [...buf].map((b) => alphabet[b % alphabet.length]).join('');
  };
  return `${pick()}-${pick()}-${pick()}`;
}

// 供測試使用
export const __crypto = { deriveKey, encryptJSON, decryptJSON, normalizeCode };
