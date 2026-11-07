/**
 * 跨裝置合併
 *
 * 為什麼需要：兩台裝置各自可能離線編輯。如果只用「整份誰新誰贏」，
 * 電腦一編輯就會把手機剛勾的「已繳」蓋掉。所以改成「每一筆各自比時間」：
 * 同一筆取 updatedAt 較新的，不同筆則兩邊都保留。
 *
 * 刪除用 tombstone（deleted: true + updatedAt），否則刪掉的項目會被另一台救回來。
 */

export const ts = (x) => (x && typeof x.updatedAt === 'number' ? x.updatedAt : 0);

function byId(a, b) {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

const sortById = (list) => [...(list || [])].sort(byId);

/** 固定排序，讓兩台裝置算出的 JSON 完全一樣，避免同步乒乓 */
export function canonicalMonths(months) {
  const out = {};
  for (const ym of Object.keys(months || {}).sort()) {
    const m = months[ym] || {};
    const cards = {};
    for (const id of Object.keys(m.cards || {}).sort()) cards[id] = m.cards[id];
    out[ym] = { cards, others: sortById(m.others) };
  }
  return out;
}

export function mergeMonths(local, remote) {
  if (!remote || typeof remote !== 'object') return canonicalMonths(local);
  const months = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote)]);
  for (const ym of keys) {
    const lm = local?.[ym];
    const rm = remote[ym];
    if (!lm) {
      months[ym] = rm;
      continue;
    }
    if (!rm) {
      months[ym] = lm;
      continue;
    }

    const cards = { ...lm.cards };
    for (const [id, rc] of Object.entries(rm.cards || {})) {
      const lc = cards[id];
      if (!lc || ts(rc) > ts(lc)) cards[id] = rc;
    }

    const map = new Map();
    for (const o of lm.others || []) map.set(o.id, o);
    for (const ro of rm.others || []) {
      const lo = map.get(ro.id);
      if (!lo || ts(ro) > ts(lo)) map.set(ro.id, ro);
    }

    months[ym] = { cards, others: [...map.values()] };
  }
  return canonicalMonths(months);
}

export function monthsEqual(a, b) {
  return stable(canonicalMonths(a)) === stable(canonicalMonths(b));
}

/** 陣列形式的主檔（信用卡、固定範本）：逐筆比 updatedAt，含刪除墓碑 */
function mergeById(local, remote) {
  const map = new Map((local || []).map((x) => [x.id, x]));
  for (const r of remote || []) {
    const l = map.get(r.id);
    if (!l || ts(r) > ts(l)) map.set(r.id, r);
  }
  return sortById([...map.values()]);
}

export function mergeCards(local, remote) {
  return mergeById(local, remote);
}

export function mergeTemplates(local, remote) {
  return mergeById(local, remote);
}

/** 鍵排序後的 JSON，避免同一份資料因鍵順序不同被誤判為有變動 */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** 兩個主檔陣列是否等價（忽略排序、忽略物件鍵順序差異造成的偽變動） */
export function listsEqual(a, b) {
  return stable(sortById(a)) === stable(sortById(b));
}

/**
 * 合併完成後，雲端那份是否比本機少了東西（需要上傳）。
 *
 * 為什麼不能只看「本機有沒有未送出的改動」：兩台裝置同時同步時，
 * 後上傳的一方會用舊資料蓋掉先上傳的一方。先上傳的那台已經清掉 dirty，
 * 下次同步合併出來又跟本機一樣，就會以為沒事而不再上傳，那筆改動便永遠到不了雲端。
 * 直接比較「合併後的本機」與「雲端內容」，只要不同就上傳，最終一定收斂。
 */
export function remoteIsBehind(local, remote) {
  if (!remote || typeof remote !== 'object') return true;
  return (
    !monthsEqual(local?.months, remote.months) ||
    !listsEqual(local?.templates, remote.templates) ||
    !listsEqual(local?.cards, remote.cards)
  );
}
