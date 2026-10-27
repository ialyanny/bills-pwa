/**
 * 跨裝置同步：Supabase + 端對端加密
 *
 * 設計理由：
 *   1. 錢的資料不該用「任何人拿到 anon key 就能讀」的方式放雲端，
 *      所以整份 JSON 先用同步碼（passphrase）加密再上傳，Supabase 只存密文。
 *   2. 同步碼同時決定「房間」：同一組碼 = 同一份帳本。
 *   3. 離線時照常使用，回到線上自動補傳。
 */
import { getState, replaceState, commit, persistNow, DEFAULT_SYNC_CODE } from './store.js';

const SUPABASE_URL = 'https://nutkocotbncqxgvjkfxi.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dGtvY290Ym5jcXhndmprZnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTcwMjcsImV4cCI6MjEwMTQzMzAyN30.yfvXV2dvYhS8cTLgyir-ddaVb5oqbYIDyjngINVccfE';
const TABLE = 'bills_state';

let client = null;
let channel = null;
let keyCache = null;
let statusCb = () => {};
let pushTimer = null;
let applying = false;
let loaded = false;
let lastError = '';

const enc = new TextEncoder();
const dec = new TextDecoder();

function setStatus(state, detail) {
  statusCb(state, detail || '');
}

/* ---------------------------------------------------------------- *
 * 同步碼 -> 房間 + 金鑰
 * ---------------------------------------------------------------- */
function normalizeCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

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
 * 上傳 / 下載
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

export async function pushNow({ silent = false } = {}) {
  const { syncEnabled, syncCode } = getState().settings;
  if (!syncEnabled || !normalizeCode(syncCode)) return false;
  if (applying) return false;
  try {
    if (!silent) setStatus('syncing');
    const { room, key } = keyCache || (keyCache = await deriveKey(syncCode));
    const payload = await encryptJSON(snapshotForCloud(), key);
    await writeRemote(room, payload);
    const st = getState();
    st.settings.lastSyncAt = new Date().toISOString();
    persistNow();
    lastError = '';
    setStatus('ok');
    return true;
  } catch (err) {
    console.error('同步上傳失敗', err);
    lastError = /Could not find the table|does not exist|schema cache/i.test(err.message || '')
      ? '雲端資料表還沒建立，請先執行 supabase-bills.sql'
      : err.message || String(err);
    setStatus('error', lastError);
    return false;
  }
}

export async function pullNow({ silent = false } = {}) {
  const { syncEnabled, syncCode } = getState().settings;
  if (!syncEnabled || !normalizeCode(syncCode)) return false;
  try {
    if (!silent) setStatus('syncing');
    const { room, key } = keyCache || (keyCache = await deriveKey(syncCode));
    const row = await readRemote(room);
    if (!row) {
      setStatus('empty');
      return false;
    }
    const remote = await decryptJSON(row.payload, key);
    const local = getState();
    if (new Date(remote.updatedAt || 0) > new Date(local.updatedAt || 0)) {
      applying = true;
      replaceState({ ...local, ...remote, settings: local.settings }, 'remote');
      local.settings.lastSyncAt = new Date().toISOString();
      persistNow();
      applying = false;
      lastError = '';
      setStatus('ok', '已從雲端更新');
      return true;
    }
    lastError = '';
    setStatus('ok');
    return false;
  } catch (err) {
    console.error('同步下載失敗', err);
    lastError = /does not exist|relation|Could not find the table|schema cache/i.test(err.message || '')
      ? '雲端資料表還沒建立，請先執行 supabase-bills.sql'
      : err.message || String(err);
    setStatus('error', lastError);
    return false;
  }
}

export function schedulePush() {
  const { syncEnabled } = getState().settings;
  if (!syncEnabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow({ silent: true }), 1200);
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
      async (payload) => {
        try {
          const row = payload.new;
          if (!row?.payload) return;
          if (row.device && row.device === getState().settings.deviceId) return;
          const remote = await decryptJSON(row.payload, key);
          if (new Date(remote.updatedAt || 0) > new Date(getState().updatedAt || 0)) {
            applying = true;
            replaceState({ ...getState(), ...remote, settings: getState().settings }, 'remote');
            applying = false;
            setStatus('ok', '已同步其他裝置的變更');
          }
        } catch (err) {
          console.warn('即時同步解析失敗', err);
        }
      },
    )
    .subscribe();
}

/* ---------------------------------------------------------------- *
 * 對外 API
 * ---------------------------------------------------------------- */
export async function enableSync(code) {
  const clean = normalizeCode(code || DEFAULT_SYNC_CODE);
  if (clean.length < 4) throw new Error('同步碼至少 4 個字元');
  commit((s) => {
    s.settings.syncEnabled = true;
    s.settings.syncDisabledByUser = false;
    s.settings.syncCode = clean;
  }, 'sync-setting');
  keyCache = await deriveKey(clean);
  loaded = false;
  await start();
}

export function disableSync() {
  commit((s) => {
    s.settings.syncEnabled = false;
    s.settings.syncDisabledByUser = true;
  }, 'sync-setting');
  keyCache = null;
  loaded = false;
  if (channel && client) client.removeChannel(channel);
  channel = null;
  setStatus('disabled');
}

export async function start() {
  const { syncEnabled, syncCode } = getState().settings;
  if (!syncEnabled) {
    setStatus('disabled');
    return;
  }
  try {
    setStatus('syncing');
    lastError = '';
    await getClient();
    keyCache = await deriveKey(syncCode);
    await pullNow({ silent: true });
    await pushNow({ silent: true });
    subscribeRealtime(keyCache.room, keyCache.key);
    loaded = true;
    if (lastError) setStatus('error', lastError);
    else setStatus('ok');
  } catch (err) {
    console.error('啟動同步失敗', err);
    lastError = err.message || String(err);
    setStatus('error', lastError);
  }
}

export function initSync(cb) {
  statusCb = cb;
  window.addEventListener('online', () => {
    if (getState().settings.syncEnabled) {
      setStatus('online');
      pushNow({ silent: true });
    }
  });
  window.addEventListener('offline', () => setStatus('offline'));
  start();
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

