import {
  addMonths,
  fmtMoney,
  mdLabel,
  monthSummary,
  yearSummary,
  availableYears,
  installmentSummary,
  missingTemplates,
  entryFromTemplate,
  buildCardEntries,
  cardEntries,
  otherEntries,
  filterAndSortEntries,
  pendingIssues,
  statusOf,
  STATUS_TEXT,
  todayStr,
  ymLabel,
  num,
} from './logic.js';
import * as store from './store.js';
import {
  initSync,
  enableSync,
  disableSync,
  syncNow,
  scheduleSync,
  generateCode,
  clearPublicRoom,
} from './sync.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let TODAY = todayStr();

function refreshToday() {
  const t = todayStr();
  if (t === TODAY) return;
  TODAY = t;
  renderAll();
}
let view = 'month';
let editing = null; // { kind, key }
let editingCardId = null;
let editingTplId = null;
let searchQuery = '';
let activeFilter = 'all';
let activeSort = 'default';
let installPrompt = null;
let syncMsg = '';

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */
function toast(msg, ms = 2000) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/** 只接受 #RGB / #RRGGBB 這類色碼，避免匯入資料把 HTML 注入 style */
function safeColor(c) {
  return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#2563eb';
}

const state = () => store.getState();

function chipFor(item) {
  const st = statusOf(item, TODAY);
  return `<span class="chip ${st}">${STATUS_TEXT[st]}</span>`;
}

function subLine(item) {
  const parts = [];
  if (item.dueDate) parts.push(`截止 ${mdLabel(item.dueDate)}`);
  if (item.via) parts.push(escapeHtml(item.via));
  if (item.paid && item.paidDate) parts.push(`${mdLabel(item.paidDate)} 繳`);
  if (item.note) parts.push(escapeHtml(item.note));
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * 本月
 * ------------------------------------------------------------------ */
function renderMonth() {
  const st = state();
  const ym = st.activeMonth;
  $('#monthLabel').textContent = ymLabel(ym);

  const exists = !!st.months[ym];
  const s = monthSummary(st, ym, TODAY);

  $('#totalAmount').textContent = fmtMoney(s.total);
  $('#paidAmount').textContent = fmtMoney(s.paid);
  $('#unpaidAmount').textContent = fmtMoney(s.unpaid);
  $('#itemCount').textContent = String(s.count);
  $('#progressBar').style.width = `${s.total ? Math.min(100, Math.round((s.paid / s.total) * 100)) : 0}%`;

  const badge = $('#heroBadge');
  if (!exists || s.count === 0) {
    badge.className = 'badge';
    badge.textContent = '尚無資料';
  } else if (s.overdueCount > 0) {
    badge.className = 'badge overdue';
    badge.textContent = `逾期 ${s.overdueCount} 筆`;
  } else if (s.count > 0 && s.paidCount === s.count) {
    badge.className = 'badge done';
    badge.textContent = '全部繳清';
  } else if (s.soonCount > 0) {
    badge.className = 'badge soon';
    badge.textContent = `7 天內 ${s.soonCount} 筆`;
  } else {
    badge.className = 'badge';
    badge.textContent = `待繳 ${s.count - s.paidCount} 筆`;
  }

  const warn = $('#heroWarn');
  const notes = [];
  if (s.overdueCount > 0) notes.push(`${s.overdueCount} 筆已逾期`);
  if (s.unknownCount > 0) notes.push(`${s.unknownCount} 筆金額空白（原始紀錄未填）`);
  if (notes.length) {
    warn.hidden = false;
    warn.textContent = notes.join('，');
  } else {
    warn.hidden = true;
  }

  renderCards(st, ym, exists, s);
  renderOthers(st, ym, exists, s);
  renderInstallments(st);
}

function renderCards(st, ym, exists, s) {
  const list = $('#cardList');
  const cards = st.cards.filter((c) => !c.deleted);
  $('#cardSum').textContent = exists ? `合計 ${fmtMoney(s.cards.total)}` : '';

  if (!exists) {
    list.innerHTML = `
      <li class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">這個月還沒有資料</div>
          <div class="row-sub">從固定卡片建立 ${cards.length} 筆，之後再填金額</div>
        </div>
      </li>`;
    $('#fillCardsBtn').hidden = false;
    $('#fillCardsBtn').textContent = '建立本月帳單';
    return;
  }

  $('#fillCardsBtn').hidden = true;

  if (!cards.length) {
    list.innerHTML = '<li class="row" style="cursor:default"><div class="row-main"><div class="row-sub">尚未設定信用卡</div></div></li>';
    return;
  }

  const rawEntries = cards.map((c) => {
    const it = st.months[ym].cards[c.id];
    return {
      kind: 'card',
      key: c.id,
      meta: c,
      item: it && !it.deleted ? it : null,
    };
  });
  const entries = filterAndSortEntries(rawEntries, {
    query: searchQuery,
    filter: activeFilter,
    sort: activeSort,
    today: TODAY,
  });

  if (!entries.length) {
    list.innerHTML = '<li class="row" style="cursor:default"><div class="row-main"><div class="row-sub">沒有符合篩選條件的信用卡</div></div></li>';
    return;
  }

  list.innerHTML = entries
    .map(({ meta: c, item }) => {
      if (!item) {
        return `<li class="row" data-kind="card" data-id="${c.id}">
          <button class="tick" data-tick="1" aria-label="標記已繳">✓</button>
          <div class="row-main">
            <div class="row-title"><span class="dot" style="background:${safeColor(c.color)}"></span>${escapeHtml(c.name)}</div>
            <div class="row-sub">尚未建立 · 點一下填寫</div>
          </div>
          <div class="row-right"><span class="row-amount is-null">—</span></div>
        </li>`;
      }
      return `<li class="row ${item.paid ? 'is-paid' : ''}" data-kind="card" data-id="${c.id}">
        <button class="tick ${item.paid ? 'on' : ''}" data-tick="1" aria-label="切換已繳">✓</button>
        <div class="row-main">
          <div class="row-title">
            <span class="dot" style="background:${safeColor(c.color)}"></span>${escapeHtml(c.name)}
            ${chipFor(item)}
          </div>
          <div class="row-sub">${subLine(item)}</div>
        </div>
        <div class="row-right">
          <span class="row-amount ${item.amount == null ? 'is-null' : ''}">${fmtMoney(item.amount)}</span>
        </div>
      </li>`;
    })
    .join('');
}

function renderOthers(st, ym, exists, s) {
  const list = $('#otherList');
  $('#otherSum').textContent = exists ? `合計 ${fmtMoney(s.others.total)}` : '';

  const others = (st.months[ym]?.others || []).filter((o) => !o.deleted);
  if (!exists || !others.length) {
    list.innerHTML = `<li class="row" style="cursor:default">
      <div class="row-main"><div class="row-sub">還沒有其他帳單，按右上角「＋ 新增」或下方固定項目帶入</div></div>
    </li>`;
  } else {
    const rawEntries = others.map((o) => ({ kind: 'other', key: o.id, meta: null, item: o }));
    const entries = filterAndSortEntries(rawEntries, {
      query: searchQuery,
      filter: activeFilter,
      sort: activeSort,
      today: TODAY,
    });
    if (!entries.length) {
      list.innerHTML = `<li class="row" style="cursor:default">
        <div class="row-main"><div class="row-sub">沒有符合篩選條件的帳單</div></div>
      </li>`;
    } else {
      list.innerHTML = entries
        .map(
          ({ item: o }) => `<li class="row ${o.paid ? 'is-paid' : ''}" data-kind="other" data-id="${o.id}">
          <button class="tick ${o.paid ? 'on' : ''}" data-tick="1" aria-label="切換已繳">✓</button>
          <div class="row-main">
            <div class="row-title">${escapeHtml(o.name)} ${chipFor(o)}</div>
            <div class="row-sub">${subLine(o)}</div>
          </div>
          <div class="row-right">
            <span class="row-amount ${o.amount == null ? 'is-null' : ''}">${fmtMoney(o.amount)}</span>
          </div>
        </li>`,
        )
        .join('');
    }
  }

  renderTemplates(st, ym);
}

function renderTemplates(st, ym) {
  const bar = $('#templateBar');
  const missing = missingTemplates(st, ym);
  if (!missing.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  const allBtn =
    missing.length > 1
      ? `<button class="tpl-chip is-all" data-tpl="__all__" type="button">＋ 全部帶入 (${missing.length})</button>`
      : '';
  bar.innerHTML =
    allBtn +
    missing
      .slice(0, 15)
      .map((t) => `<button class="tpl-chip" data-tpl="${t.id}" type="button">＋ ${escapeHtml(t.name)}</button>`)
      .join('');
}

function renderInstallments(st) {
  const block = $('#instBlock');
  const items = installmentSummary(st);
  if (!items.length) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  $('#instList').innerHTML = items
    .map(
      (it) => `<li>
      <div class="inst-head">
        <span>${escapeHtml(it.name)}</span>
        <b>${it.cur}/${it.total} 期</b>
      </div>
      <div class="inst-track"><i style="width:${it.pct}%"></i></div>
      <div class="inst-meta">
        <span>每月 ${fmtMoney(it.amount)}</span>
        <span>剩 ${it.left} 期 · ${fmtMoney(it.remaining)} 元</span>
      </div>
    </li>`,
    )
    .join('');
}

/* ------------------------------------------------------------------ *
 * 年度
 * ------------------------------------------------------------------ */
function renderYear() {
  const st = state();
  const sel = $('#yearSelect');
  const years = availableYears(st);
  const current = sel.value || String(new Date().getFullYear());
  sel.innerHTML = years.map((y) => `<option value="${y}">${y} 年</option>`).join('');
  sel.value = years.includes(current) ? current : years[0];

  const ys = yearSummary(st, Number(sel.value), TODAY);
  const activeMonths = ys.months.filter((m) => m.exists && m.count > 0);
  const avg = activeMonths.length ? Math.round(ys.total / activeMonths.length) : 0;

  $('#yearStats').innerHTML = `
    <div><span class="k">年度合計</span><b>${fmtMoney(ys.total)}</b></div>
    <div><span class="k">已繳</span><b>${fmtMoney(ys.paid)}</b></div>
    <div><span class="k">平均月支出</span><b>${fmtMoney(avg)}</b></div>`;

  const max = Math.max(...ys.months.map((m) => m.total), 1);
  $('#yearChart').innerHTML = ys.months
    .map((m) => {
      const h = m.total ? Math.max(4, Math.round((m.total / max) * 120)) : 2;
      const active = m.ym === st.activeMonth ? ' is-active' : '';
      const empty = m.count ? '' : ' is-empty';
      return `<div class="bar-wrap${active}${empty}" data-ym="${m.ym}" title="${ymLabel(m.ym)} ${fmtMoney(m.total)}">
        <div class="bar" style="height:${h}px"></div>
        <span class="bar-label">${Number(m.ym.slice(5))}</span>
      </div>`;
    })
    .join('');

  const cmax = Math.max(...ys.cardTotals.map((c) => c.total), 1);
  $('#cardRank').innerHTML = ys.cardTotals
    .map(
      (c) => `<li class="rank-row">
        <span>${escapeHtml(c.name)}</span>
        <span class="rank-track"><i style="width:${Math.round((c.total / cmax) * 100)}%;background:${safeColor(c.color)}"></i></span>
        <span class="rank-val">${fmtMoney(c.total)}</span>
      </li>`,
    )
    .join('');

  const omax = Math.max(...ys.otherTotals.map((c) => c.total), 1);
  $('#otherRank').innerHTML = ys.otherTotals.length
    ? ys.otherTotals
        .map(
          (c) => `<li class="rank-row">
        <span>${escapeHtml(c.name)}</span>
        <span class="rank-track"><i style="width:${Math.round((c.total / omax) * 100)}%;background:#8b5cf6"></i></span>
        <span class="rank-val">${fmtMoney(c.total)}</span>
      </li>`,
        )
        .join('')
    : '<li class="hint">這一年還沒有其他帳單</li>';
}

/* ------------------------------------------------------------------ *
 * 設定
 * ------------------------------------------------------------------ */
function renderSettings() {
  const st = state();
  // 使用者正在輸入同步碼時不要被自動重繪蓋掉
  if (document.activeElement !== $('#syncCode')) {
    $('#syncCode').value = st.settings.syncCode || '';
  }
  const bytes = store.storageBytes();
  const monthCount = Object.keys(st.months).length;
  const itemCount = Object.values(st.months).reduce(
    (a, m) =>
      a +
      Object.entries(m.cards).filter(
        ([id, e]) =>
          e && !e.deleted && st.cards.some((c) => c.id === id && !c.deleted),
      ).length +
      m.others.filter((o) => !o.deleted).length,
    0,
  );
  $('#dataInfo').textContent = `${monthCount} 個月 · ${itemCount} 筆紀錄 · 本機約 ${(bytes / 1024).toFixed(1)} KB`;
  updateSyncUI();

  $('#cardMetaList').innerHTML = st.cards
    .filter((c) => !c.deleted)
    .map(
      (c) => `<li class="rank-row" style="grid-template-columns:1fr auto auto">
        <span style="display:flex;align-items:center;gap:6px"><i class="dot" style="background:${safeColor(c.color)}"></i>${escapeHtml(c.name)} <small style="color:var(--muted)">(${escapeHtml(c.owner || '本人')})</small></span>
        <span class="rank-val">${c.stmtDay ? `${c.stmtDay} 結` : ''}${c.dueDay ? ` / ${c.dueDay} 止` : ''}${c.via ? ` · ${escapeHtml(c.via)}` : ''}</span>
        <button class="ghost-btn" data-edit-card="${c.id}" style="padding:2px 8px;font-size:12px" type="button">編輯</button>
      </li>`,
    )
    .join('');

  $('#templateList').innerHTML = st.templates
    .filter((t) => !t.deleted)
    .map(
      (t) => `<li class="rank-row" style="grid-template-columns:1fr auto auto">
        <span>${escapeHtml(t.name)}</span>
        <span class="rank-val">${t.recurrence === 'yearly' ? `${t.month} 月` : '每月'}${
          t.amount ? ` · ${fmtMoney(t.amount)}` : ''
        }</span>
        <button class="ghost-btn" data-edit-tpl="${t.id}" style="padding:2px 8px;font-size:12px" type="button">編輯</button>
      </li>`,
    )
    .join('');

  const issues = pendingIssues(st);
  $('#issueCount').textContent = issues.length ? `共 ${issues.length} 筆` : '已全部確認';
  $('#issueList').innerHTML = issues.length
    ? issues
        .map(
          (it) => `<li class="row" data-issue-ym="${it.ym}" data-issue-kind="${it.kind}" data-issue-key="${it.key}">
          <div class="row-main">
            <div class="row-title"><span class="chip ${it.amount == null ? 'unknown' : 'soon'}">${escapeHtml(it.ym)}</span> ${escapeHtml(it.name)}</div>
            <div class="row-sub">${escapeHtml(it.note)}</div>
          </div>
          <div class="row-right">
            <span class="row-amount ${it.amount == null ? 'is-null' : ''}">${fmtMoney(it.amount)}</span>
          </div>
        </li>`,
        )
        .join('')
    : '<li class="row" style="cursor:default"><div class="row-main"><div class="row-sub">沒有待確認或標記疑點的項目</div></div></li>';
}

const SYNC_TEXT = {
  disabled: '本機',
  syncing: '同步中',
  ok: '已同步',
  error: '同步失敗',
  offline: '離線',
  empty: '待上傳',
  online: '已連線',
};

function updateSyncUI(extra = '') {
  const st = state();
  const enabled = st.settings.syncEnabled;
  const el = $('#syncPill');
  const lastAt = st.settings.lastSyncAt;
  let label = enabled ? SYNC_TEXT[el.dataset.state] || '已同步' : '本機';
  if (!enabled) el.dataset.state = 'disabled';
  $('#syncText').textContent = label;
  const keepError = el.dataset.state === 'error' && syncMsg;
  $('#syncStatus').textContent = keepError
    ? syncMsg
    : extra
      ? extra
      : enabled
        ? `已開啟${lastAt ? ` · 上次同步 ${new Date(lastAt).toLocaleString('zh-TW', { hour12: false })}` : ''}`
        : '目前只存在這台裝置。輸入同步碼並開啟，就能跨裝置使用。';
  $('#enableSyncBtn').textContent = enabled ? '重新連線' : '開啟同步';
  $('#syncCode').readOnly = false;

  // 舊版公開房間：提醒搬家；新房間同步成功後才能清除
  const legacy = !!st.settings.legacyPublicRoom;
  $('#legacyRoomBox').hidden = !legacy;
  if (legacy) {
    const ready = enabled && !!lastAt;
    $('#clearPublicRoomBtn').disabled = !ready;
    $('#legacyRoomHint').textContent = ready
      ? '新同步碼已同步成功。請確認其他裝置也換好新碼後，再刪除公開房間裡的舊資料。'
      : '新同步碼同步成功後，再按下方按鈕刪除公開房間裡的舊資料。';
  }
}

/* ------------------------------------------------------------------ *
 * 編輯面板
 * ------------------------------------------------------------------ */
function currentMonth() {
  return state().activeMonth;
}

function openEditor(kind, key) {
  const st = state();
  const ym = currentMonth();
  editing = { kind, key, ym };

  let item;
  let title;
  if (kind === 'card') {
    const meta = st.cards.find((c) => c.id === key && !c.deleted);
    const saved = st.months[ym]?.cards?.[key];
    item = saved && !saved.deleted ? saved : {
      name: '',
      amount: null,
      dueDate: null,
      paid: false,
      paidDate: null,
      via: meta?.via || '',
      note: '',
      inst: null,
    };
    title = meta ? meta.name : '信用卡';
  } else if (kind === 'other' && key) {
    const saved = st.months[ym]?.others?.find((o) => o.id === key);
    item = saved && !saved.deleted ? saved : {
      name: '',
      amount: null,
      dueDate: null,
      paid: false,
      paidDate: null,
      via: '',
      note: '',
      inst: null,
    };
    title = item.name || '帳單';
  } else {
    item = {
      name: '',
      amount: null,
      dueDate: `${ym}-01`,
      paid: false,
      paidDate: null,
      via: '',
      note: '',
      inst: null,
    };
    title = '新增帳單';
    editing.key = null;
  }

  $('#editorTitle').textContent = title;
  $('#nameField').hidden = kind === 'card';
  $('#fName').value = item.name || '';
  $('#fAmount').value = item.amount ?? '';
  $('#fDue').value = item.dueDate || '';
  $('#fPaidDate').value = item.paidDate || '';
  $('#fVia').value = item.via || '';
  $('#fNote').value = item.note || '';
  $('#fPaid').checked = !!item.paid;
  $('#instFields').hidden = kind === 'card';
  $('#fInstCur').value = item.inst?.cur ?? '';
  $('#fInstTotal').value = item.inst?.total ?? '';
  $('#deleteBtn').hidden = kind === 'card';

  $('#editor').showModal();
  if (kind !== 'card') setTimeout(() => $('#fName').focus(), 60);
}

function closeEditor() {
  $('#editor').close();
  editing = null;
}

function saveEditor(ev) {
  ev.preventDefault();
  if (!editing) return;
  const { kind, key, ym } = editing;
  const amountRaw = $('#fAmount').value.trim();
  const payload = {
    amount: amountRaw === '' ? null : Number(amountRaw),
    dueDate: $('#fDue').value || null,
    paidDate: $('#fPaidDate').value || null,
    via: $('#fVia').value.trim(),
    note: $('#fNote').value.trim(),
    paid: $('#fPaid').checked,
    updatedAt: Date.now(),
  };
  // 信用卡的名稱放在主檔，不要把「未命名」寫進每月紀錄
  if (kind !== 'card') {
    payload.name = $('#fName').value.trim() || '未命名';
    payload.deleted = false;
  }
  if (payload.paid && !payload.paidDate) payload.paidDate = TODAY;
  if (!payload.paid) payload.paidDate = null;

  const instCur = $('#fInstCur').value.trim();
  const instTotal = $('#fInstTotal').value.trim();
  const inst = instCur && instTotal ? { cur: Number(instCur), total: Number(instTotal) } : null;

  if (kind === 'card') {
    store.commit((s) => {
      if (!s.months[ym]) s.months[ym] = { cards: {}, others: [] };
      const prev = s.months[ym].cards[key];
      if (prev && !prev.deleted) {
        s.months[ym].cards[key] = { ...prev, ...payload };
      } else {
        const meta = s.cards.find((c) => c.id === key && !c.deleted);
        const built = meta ? buildCardEntries([meta], ym)[key] : {};
        s.months[ym].cards[key] = { ...built, ...payload };
      }
    }, 'edit');
  } else if (key) {
    store.commit((s) => {
      const i = s.months[ym].others.findIndex((o) => o.id === key);
      if (i >= 0) s.months[ym].others[i] = { ...s.months[ym].others[i], ...payload, inst };
    }, 'edit');
  } else {
    store.commit((s) => {
      s.months[ym] = s.months[ym] || { cards: {}, others: [] };
      s.months[ym].others.push({ id: store.uid('o'), ...payload, inst });
    }, 'edit');
  }
  closeEditor();
  toast('已儲存');
}

/* ------------------------------------------------------------------ *
 * 動作
 * ------------------------------------------------------------------ */
function togglePaid(kind, key) {
  const ym = currentMonth();
  store.commit((s) => {
    if (kind === 'card') {
      // 尚未建立的卡片：勾選時直接建立該月紀錄，不要讓點擊沒反應
      if (!s.months[ym]) s.months[ym] = { cards: {}, others: [] };
      if (!s.months[ym].cards[key] || s.months[ym].cards[key].deleted) {
        const meta = s.cards.find((c) => c.id === key && !c.deleted);
        const built = meta ? buildCardEntries([meta], ym)[key] : null;
        if (!built) return;
        s.months[ym].cards[key] = built;
      }
      const item = s.months[ym].cards[key];
      item.paid = !item.paid;
      item.paidDate = item.paid ? item.paidDate || TODAY : null;
      item.updatedAt = Date.now();
      return;
    }
    const item = s.months[ym]?.others?.find((o) => o.id === key && !o.deleted);
    if (!item) return;
    item.paid = !item.paid;
    item.paidDate = item.paid ? item.paidDate || TODAY : null;
    item.updatedAt = Date.now();
  }, 'edit');
}

function addFromTemplate(id) {
  const st = state();
  const ym = currentMonth();
  if (id === '__all__') {
    const missing = missingTemplates(st, ym);
    if (!missing.length) return;
    store.commit((s) => {
      s.months[ym] = s.months[ym] || { cards: buildCardEntries(s.cards, ym), others: [] };
      for (const tpl of missing) {
        s.months[ym].others.push(entryFromTemplate(tpl, ym, s));
      }
    }, 'edit');
    toast(`已帶入 ${missing.length} 筆固定項目`);
    return;
  }
  const tpl = st.templates.find((t) => t.id === id);
  if (!tpl) return;
  const entry = entryFromTemplate(tpl, ym, st);
  store.commit((s) => {
    s.months[ym] = s.months[ym] || { cards: buildCardEntries(s.cards, ym), others: [] };
    s.months[ym].others.push(entry);
  }, 'edit');
  toast(`已帶入 ${tpl.name}`);
}

/* 信用卡主檔與固定範本編輯 */
function openCardMetaEditor(id = null) {
  const st = state();
  editingCardId = id;
  const card = id ? st.cards.find((c) => c.id === id) : null;
  $('#cardEditorTitle').textContent = card ? `編輯信用卡：${card.name}` : '新增信用卡';
  $('#cName').value = card?.name || '';
  $('#cOwner').value = card?.owner || '本人';
  $('#cStmtDay').value = card?.stmtDay ?? '';
  $('#cDueDay').value = card?.dueDay ?? '';
  $('#cVia').value = card?.via || '';
  $('#cColor').value = card?.color || '#2563eb';
  $('#cardDeleteBtn').hidden = !card;
  $('#cardEditor').showModal();
}

function saveCardMetaEditor(ev) {
  ev.preventDefault();
  const name = $('#cName').value.trim();
  if (!name) return;
  const stmtRaw = $('#cStmtDay').value.trim();
  const dueRaw = $('#cDueDay').value.trim();
  const payload = {
    name,
    owner: $('#cOwner').value.trim() || '本人',
    stmtDay: stmtRaw ? Number(stmtRaw) : null,
    dueDay: dueRaw ? Number(dueRaw) : null,
    via: $('#cVia').value.trim(),
    color: $('#cColor').value || '#2563eb',
    updatedAt: Date.now(),
  };
  store.commit((s) => {
    if (editingCardId) {
      const idx = s.cards.findIndex((c) => c.id === editingCardId);
      if (idx >= 0) s.cards[idx] = { ...s.cards[idx], ...payload, deleted: false };
    } else {
      const newCard = { id: store.uid('c'), ...payload };
      s.cards.push(newCard);
      const ym = s.activeMonth;
      if (s.months[ym]) {
        const built = buildCardEntries([newCard], ym);
        s.months[ym].cards[newCard.id] = built[newCard.id];
      }
    }
  }, 'edit');
  $('#cardEditor').close();
  editingCardId = null;
  toast('已儲存信用卡設定');
}

function openTplEditor(id = null) {
  const st = state();
  editingTplId = id;
  const tpl = id ? st.templates.find((t) => t.id === id) : null;
  $('#tplEditorTitle').textContent = tpl ? `編輯固定項目：${tpl.name}` : '新增固定項目';
  $('#tName').value = tpl?.name || '';
  $('#tAmount').value = tpl?.amount ?? '';
  $('#tDueDay').value = tpl?.dueDay ?? '';
  $('#tRecurrence').value = tpl?.recurrence || 'monthly';
  $('#tMonthField').hidden = $('#tRecurrence').value !== 'yearly';
  $('#tMonth').value = tpl?.month ?? 6;
  $('#tVia').value = tpl?.via || '';
  const instCur = Array.isArray(tpl?.inst) ? tpl.inst[0] : tpl?.inst?.cur;
  const instTotal = Array.isArray(tpl?.inst) ? tpl.inst[1] : tpl?.inst?.total;
  $('#tInstCur').value = instCur ?? '';
  $('#tInstTotal').value = instTotal ?? '';
  $('#tplDeleteBtn').hidden = !tpl;
  $('#tplEditor').showModal();
}

function saveTplEditor(ev) {
  ev.preventDefault();
  const name = $('#tName').value.trim();
  if (!name) return;
  const amtRaw = $('#tAmount').value.trim();
  const dueRaw = $('#tDueDay').value.trim();
  const recurrence = $('#tRecurrence').value;
  const monthRaw = $('#tMonth').value.trim();
  const instCur = $('#tInstCur').value.trim();
  const instTotal = $('#tInstTotal').value.trim();
  const payload = {
    name,
    amount: amtRaw === '' ? null : Number(amtRaw),
    dueDay: dueRaw === '' ? null : Number(dueRaw),
    recurrence,
    ...(recurrence === 'yearly' ? { month: Number(monthRaw || 1) } : {}),
    via: $('#tVia').value.trim(),
    ...(instCur && instTotal ? { inst: { cur: Number(instCur), total: Number(instTotal) } } : { inst: null }),
    updatedAt: Date.now(),
  };
  store.commit((s) => {
    if (editingTplId) {
      const idx = s.templates.findIndex((t) => t.id === editingTplId);
      if (idx >= 0) s.templates[idx] = { ...s.templates[idx], ...payload, deleted: false };
    } else {
      s.templates.push({ id: store.uid('t'), ...payload });
    }
  }, 'edit');
  $('#tplEditor').close();
  editingTplId = null;
  toast('已儲存固定項目');
}

function createMonthCards() {
  const st = state();
  const ym = currentMonth();
  store.commit((s) => {
    s.months[ym] = { cards: buildCardEntries(s.cards, ym), others: s.months[ym]?.others || [] };
  }, 'edit');
  toast('已建立本月卡片');
}

function selectMonth(ym) {
  store.setActiveMonth(ym);
  view = 'month';
  renderAll();
}

/* 月份快速跳轉面板 */
let mpYear = new Date().getFullYear();

function renderMonthPanel() {
  const st = state();
  $('#mpYear').textContent = `${mpYear} 年`;
  $('#mpGrid').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const ym = `${mpYear}-${String(m).padStart(2, '0')}`;
    const month = st.months[ym];
    const hasCards =
      month &&
      Object.keys(month.cards).some((id) => {
        const c = st.cards.find((x) => x.id === id);
        const entry = month.cards[id];
        return c && !c.deleted && entry && !entry.deleted;
      });
    const hasOthers = month && month.others.some((o) => !o.deleted);
    const has = hasCards || hasOthers;
    const cls = `mp-cell${has ? ' has-data' : ''}${ym === st.activeMonth ? ' is-current' : ''}`;
    return `<button class="${cls}" type="button" data-ym="${ym}">${m} 月</button>`;
  }).join('');
}

function toggleMonthPanel(force) {
  const panel = $('#monthPanel');
  const open = force ?? panel.hidden;
  if (open) {
    mpYear = Number(state().activeMonth.slice(0, 4));
    renderMonthPanel();
  }
  panel.hidden = !open;
}

/* ------------------------------------------------------------------ *
 * 事件綁定
 * ------------------------------------------------------------------ */
function bind() {
  $('#prevMonth').addEventListener('click', () => selectMonth(addMonths(state().activeMonth, -1)));
  $('#nextMonth').addEventListener('click', () => selectMonth(addMonths(state().activeMonth, 1)));
  $('#monthBtn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleMonthPanel();
  });
  $('#mpPrev').addEventListener('click', (ev) => {
    ev.stopPropagation();
    mpYear -= 1;
    renderMonthPanel();
  });
  $('#mpNext').addEventListener('click', (ev) => {
    ev.stopPropagation();
    mpYear += 1;
    renderMonthPanel();
  });
  $('#mpGrid').addEventListener('click', (ev) => {
    const cell = ev.target.closest('[data-ym]');
    if (!cell) return;
    selectMonth(cell.dataset.ym);
    toggleMonthPanel(false);
  });
  document.addEventListener('click', (ev) => {
    if (!$('#monthPanel').hidden && !ev.target.closest('#monthPanel') && !ev.target.closest('#monthBtn')) {
      toggleMonthPanel(false);
    }
  });

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      view = tab.dataset.view;
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      renderAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  $('#cardList').addEventListener('click', (ev) => {
    const li = ev.target.closest('.row');
    if (!li) return;
    const kind = li.dataset.kind;
    const id = li.dataset.id;
    if (ev.target.closest('[data-tick]')) {
      togglePaid(kind, id);
      return;
    }
    openEditor(kind, id);
  });

  $('#otherList').addEventListener('click', (ev) => {
    const li = ev.target.closest('.row');
    if (!li || !li.dataset.id) return;
    if (ev.target.closest('[data-tick]')) {
      togglePaid('other', li.dataset.id);
      return;
    }
    openEditor('other', li.dataset.id);
  });

  $('#templateBar').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-tpl]');
    if (chip) addFromTemplate(chip.dataset.tpl);
  });

  $('#addOtherBtn').addEventListener('click', () => openEditor('other', null));
  $('#fillCardsBtn').addEventListener('click', createMonthCards);

  $('#searchInput').addEventListener('input', (ev) => {
    searchQuery = ev.target.value;
    renderMonth();
  });
  $('#filterChips').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    $$('#filterChips .filter-chip').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderMonth();
  });
  $('#sortSelect').addEventListener('change', (ev) => {
    activeSort = ev.target.value;
    renderMonth();
  });

  $('#editorForm').addEventListener('submit', saveEditor);
  $('#cancelBtn').addEventListener('click', closeEditor);
  $('#editorClose').addEventListener('click', closeEditor);
  $('#deleteBtn').addEventListener('click', () => {
    if (!editing) return;
    const { kind, key, ym } = editing;
    if (kind === 'card') return;
    if (!confirm('確定刪除這筆帳單？')) return;
    store.commit((s) => {
      const target = s.months[ym]?.others?.find((o) => o.id === key);
      if (target) {
        target.deleted = true;
        target.updatedAt = Date.now();
      }
    }, 'edit');
    closeEditor();
    toast('已刪除');
  });

  $('#yearSelect').addEventListener('change', renderYear);
  $('#yearChart').addEventListener('click', (ev) => {
    const bar = ev.target.closest('[data-ym]');
    if (bar) selectMonth(bar.dataset.ym);
  });

  $('#syncPill').addEventListener('click', () => {
    view = 'settings';
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === 'settings'));
    renderAll();
  });

  $('#genCodeBtn').addEventListener('click', () => {
    $('#syncCode').value = generateCode();
    toast('已產生同步碼，請記下來');
  });

  $('#enableSyncBtn').addEventListener('click', async () => {
    const code = $('#syncCode').value.trim();
    try {
      await enableSync(code);
      toast('同步已開啟');
      renderSettings();
    } catch (err) {
      toast(err.message || '開啟失敗');
    }
  });

  $('#syncNowBtn').addEventListener('click', async () => {
    if (!state().settings.syncEnabled) {
      toast('請先開啟同步');
      return;
    }
    const ok = await syncNow({ silent: false });
    renderSettings();
    toast(ok ? '已同步' : '同步失敗，請確認網路後再試');
  });

  $('#clearPublicRoomBtn').addEventListener('click', async () => {
    if (
      !confirm(
        '會永久刪除舊版公開房間（BILLS-DEFAULT-2026）在雲端的資料，無法復原。\n' +
          '這台裝置與新同步碼房間的資料不受影響。\n\n' +
          '請先確認其他裝置都已換成新同步碼，否則還沒更新的裝置可能再把資料寫回公開房間。確定？',
      )
    )
      return;
    try {
      await clearPublicRoom();
      toast('已清除公開房間的雲端資料');
      renderSettings();
    } catch (err) {
      toast(err.message || '清除失敗', 4000);
    }
  });

  $('#disableSyncBtn').addEventListener('click', () => {
    if (!confirm('關閉後這台裝置不再上傳，本機資料仍保留。確定？')) return;
    disableSync();
    renderSettings();
    toast('已關閉同步');
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `帳單備忘錄-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已匯出');
  });

  $('#importFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      toast('匯入完成');
      renderAll();
    } catch (err) {
      toast(`匯入失敗：${err.message}`);
    }
    ev.target.value = '';
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('會清空這台裝置上所有卡片、範本與帳單紀錄，建議先匯出。\n若已開啟同步，雲端的資料會再同步回來。確定？')) return;
    store.resetToSeed();
    toast('已清空所有資料');
    renderAll();
  });

  $('#addCardMetaBtn').addEventListener('click', () => openCardMetaEditor(null));
  $('#cardMetaList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-edit-card]');
    if (btn) openCardMetaEditor(btn.dataset.editCard);
  });
  $('#cardEditorForm').addEventListener('submit', saveCardMetaEditor);
  $('#cardCancelBtn').addEventListener('click', () => $('#cardEditor').close());
  $('#cardEditorClose').addEventListener('click', () => $('#cardEditor').close());
  $('#cardDeleteBtn').addEventListener('click', () => {
    if (!editingCardId) return;
    if (!confirm('確定從主檔移除這張信用卡？各月已記錄的帳單仍會保留。')) return;
    store.commit((s) => {
      const target = s.cards.find((c) => c.id === editingCardId);
      if (target) {
        target.deleted = true;
        target.updatedAt = Date.now();
      }
    }, 'edit');
    $('#cardEditor').close();
    editingCardId = null;
    toast('已移除信用卡');
  });

  $('#addTemplateBtn').addEventListener('click', () => openTplEditor(null));
  $('#templateList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-edit-tpl]');
    if (btn) openTplEditor(btn.dataset.editTpl);
  });
  $('#tRecurrence').addEventListener('change', (ev) => {
    $('#tMonthField').hidden = ev.target.value !== 'yearly';
  });
  $('#tplEditorForm').addEventListener('submit', saveTplEditor);
  $('#tplCancelBtn').addEventListener('click', () => $('#tplEditor').close());
  $('#tplEditorClose').addEventListener('click', () => $('#tplEditor').close());
  $('#tplDeleteBtn').addEventListener('click', () => {
    if (!editingTplId) return;
    if (!confirm('從固定項目移除？已建立的帳單不受影響。')) return;
    store.commit((s) => {
      const target = s.templates.find((t) => t.id === editingTplId);
      if (target) {
        target.deleted = true;
        target.updatedAt = Date.now();
      }
    }, 'edit');
    $('#tplEditor').close();
    editingTplId = null;
    toast('已移除固定項目');
  });

  $('#issueList').addEventListener('click', (ev) => {
    const li = ev.target.closest('[data-issue-ym]');
    if (!li) return;
    const { issueYm, issueKind, issueKey } = li.dataset;
    store.setActiveMonth(issueYm);
    view = 'month';
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === 'month'));
    renderAll();
    openEditor(issueKind, issueKey);
  });

  window.addEventListener(
    'scroll',
    () => $('.topbar').classList.toggle('is-scrolled', window.scrollY > 4),
    { passive: true },
  );

  // 跨午夜或從背景回來時，重新計算「今天」讓逾期／快到期狀態保持正確
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshToday();
    else store.persistNow(); // 切到背景前先把 120ms 的待寫入內容落地
  });
  setInterval(refreshToday, 60 * 1000);
  // 關閉／重整頁面時，確保最後一次修改已寫進 localStorage
  window.addEventListener('pagehide', () => store.persistNow());

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installPrompt = ev;
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = '安裝到桌面';
    btn.id = 'installBtn';
    btn.addEventListener('click', async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      btn.remove();
    });
    $('.btn-row').appendChild(btn);
  });
}

/* ------------------------------------------------------------------ *
 * 啟動
 * ------------------------------------------------------------------ */
function renderAll() {
  $('#view-month').hidden = view !== 'month';
  $('#view-year').hidden = view !== 'year';
  $('#view-settings').hidden = view !== 'settings';
  if (view === 'month') renderMonth();
  if (view === 'year') renderYear();
  if (view === 'settings') renderSettings();
}

store.load();
bind();
renderAll();

store.subscribe((reason) => {
  if (reason === 'remote') {
    renderAll();
    toast('已同步其他裝置的變更');
    return;
  }
  if (reason === 'storage-error') {
    toast('本機儲存失敗，可能是空間不足或瀏覽器限制', 4000);
    return;
  }
  renderAll();
  // activeMonth 只存在本機，不需要為了換月份而觸發雲端寫入
  if (['edit', 'import', 'reset'].includes(reason)) scheduleSync();
});

initSync((status, detail) => {
  const pill = $('#syncPill');
  pill.dataset.state = status;
  const st = state();
  if (!st.settings.syncEnabled) {
    $('#syncText').textContent = '本機';
  } else {
    $('#syncText').textContent = SYNC_TEXT[status] || '同步';
  }
  if (view === 'settings') {
    const line =
      detail ||
      (status === 'error'
        ? '同步失敗，請確認網路或資料表已建立'
        : status === 'ok'
          ? `上次同步 ${new Date().toLocaleString('zh-TW', { hour12: false })}`
          : '');
    if (line) {
      syncMsg = line;
      $('#syncStatus').textContent = line;
    }
  }
});

// 舊版裝置用的是公開同步碼：同步已自動暫停，開啟時提醒一次
if (state().settings.legacyPublicRoom && !state().settings.syncEnabled) {
  setTimeout(() => toast('同步已暫停：請到「設定」改用新的私人同步碼', 6000), 600);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW 註冊失敗', err));
  });
}
