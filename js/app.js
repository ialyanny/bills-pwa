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
  statusOf,
  STATUS_TEXT,
  todayStr,
  ymLabel,
  num,
} from './logic.js';
import * as store from './store.js';
import { initSync, enableSync, disableSync, pushNow, pullNow, generateCode, schedulePush } from './sync.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TODAY = todayStr();
let view = 'month';
let editing = null; // { kind, key }
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
  $('#cardSum').textContent = exists ? `合計 ${fmtMoney(s.cards.total)}` : '';

  if (!exists) {
    list.innerHTML = `
      <li class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">這個月還沒有資料</div>
          <div class="row-sub">從固定卡片建立 ${st.cards.length} 筆，之後再填金額</div>
        </div>
      </li>`;
    $('#fillCardsBtn').hidden = false;
    $('#fillCardsBtn').textContent = '建立本月帳單';
    return;
  }

  $('#fillCardsBtn').hidden = true;

  if (!st.cards.length) {
    list.innerHTML = '<li class="row" style="cursor:default"><div class="row-main"><div class="row-sub">尚未設定信用卡</div></div></li>';
    return;
  }

  list.innerHTML = st.cards
    .map((c) => {
      const item = st.months[ym].cards[c.id];
      if (!item) {
        return `<li class="row" data-kind="card" data-id="${c.id}">
          <button class="tick" data-tick="1" aria-label="標記已繳">✓</button>
          <div class="row-main">
            <div class="row-title"><span class="dot" style="background:${c.color}"></span>${escapeHtml(c.name)}</div>
            <div class="row-sub">尚未建立 · 點一下填寫</div>
          </div>
          <div class="row-right"><span class="row-amount is-null">—</span></div>
        </li>`;
      }
      return `<li class="row ${item.paid ? 'is-paid' : ''}" data-kind="card" data-id="${c.id}">
        <button class="tick ${item.paid ? 'on' : ''}" data-tick="1" aria-label="切換已繳">✓</button>
        <div class="row-main">
          <div class="row-title">
            <span class="dot" style="background:${c.color}"></span>${escapeHtml(c.name)}
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

  if (!exists || !st.months[ym].others.length) {
    list.innerHTML = `<li class="row" style="cursor:default">
      <div class="row-main"><div class="row-sub">還沒有其他帳單，按右上角「＋ 新增」</div></div>
    </li>`;
  } else {
    list.innerHTML = st.months[ym].others
      .map(
        (o) => `<li class="row ${o.paid ? 'is-paid' : ''}" data-kind="other" data-id="${o.id}">
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
  bar.innerHTML = missing
    .slice(0, 12)
    .map((t) => `<button class="tpl-chip" data-tpl="${t.id}">＋ ${escapeHtml(t.name)}</button>`)
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
        <span class="rank-track"><i style="width:${Math.round((c.total / cmax) * 100)}%;background:${c.color}"></i></span>
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
  $('#syncCode').value = st.settings.syncCode || '';
  const bytes = store.storageBytes();
  const monthCount = Object.keys(st.months).length;
  const itemCount = Object.values(st.months).reduce(
    (a, m) => a + Object.keys(m.cards).length + m.others.length,
    0,
  );
  $('#dataInfo').textContent = `${monthCount} 個月 · ${itemCount} 筆紀錄 · 本機約 ${(bytes / 1024).toFixed(1)} KB`;
  updateSyncUI();

  $('#templateList').innerHTML = st.templates
    .map(
      (t) => `<li class="rank-row" style="grid-template-columns:1fr auto auto">
        <span>${escapeHtml(t.name)}</span>
        <span class="rank-val">${t.recurrence === 'yearly' ? `${t.month} 月` : '每月'}${
          t.amount ? ` · ${fmtMoney(t.amount)}` : ''
        }</span>
        <button class="ghost-btn" data-del-tpl="${t.id}" style="padding:2px 8px;font-size:12px">移除</button>
      </li>`,
    )
    .join('');
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
}

/* ------------------------------------------------------------------ *
 * 編輯面板
 * ------------------------------------------------------------------ */
function currentMonth() {
  return state().activeMonth;
}

function ensureCardInMonth(ym, id) {
  const st = state();
  if (st.months[ym]?.cards?.[id]) return;
  const meta = st.cards.find((c) => c.id === id);
  const built = buildCardEntries([meta], ym);
  store.commit((s) => {
    if (!s.months[ym]) s.months[ym] = { cards: buildCardEntries(s.cards, ym), others: [] };
    s.months[ym].cards[id] = built[id];
  }, 'edit');
}

function openEditor(kind, key) {
  const st = state();
  const ym = currentMonth();
  editing = { kind, key, ym };

  let item;
  let title;
  if (kind === 'card') {
    const meta = st.cards.find((c) => c.id === key);
    ensureCardInMonth(ym, key);
    item = state().months[ym].cards[key];
    title = meta ? meta.name : '信用卡';
  } else if (kind === 'other' && key) {
    item = st.months[ym].others.find((o) => o.id === key);
    title = item?.name || '帳單';
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
    name: $('#fName').value.trim() || '未命名',
    amount: amountRaw === '' ? null : Number(amountRaw),
    dueDate: $('#fDue').value || null,
    paidDate: $('#fPaidDate').value || null,
    via: $('#fVia').value.trim(),
    note: $('#fNote').value.trim(),
    paid: $('#fPaid').checked,
  };
  if (payload.paid && !payload.paidDate) payload.paidDate = TODAY;
  if (!payload.paid) payload.paidDate = payload.paidDate || null;

  const instCur = $('#fInstCur').value.trim();
  const instTotal = $('#fInstTotal').value.trim();
  const inst = instCur && instTotal ? { cur: Number(instCur), total: Number(instTotal) } : null;

  if (kind === 'card') {
    store.commit((s) => {
      s.months[ym] = s.months[ym] || { cards: {}, others: [] };
      s.months[ym].cards[key] = { ...(s.months[ym].cards[key] || {}), ...payload };
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
    const item =
      kind === 'card' ? s.months[ym]?.cards?.[key] : s.months[ym]?.others?.find((o) => o.id === key);
    if (!item) return;
    item.paid = !item.paid;
    item.paidDate = item.paid ? item.paidDate || TODAY : null;
  }, 'edit');
}

function addFromTemplate(id) {
  const st = state();
  const ym = currentMonth();
  const tpl = st.templates.find((t) => t.id === id);
  if (!tpl) return;
  const entry = entryFromTemplate(tpl, ym);
  store.commit((s) => {
    s.months[ym] = s.months[ym] || { cards: buildCardEntries(s.cards, ym), others: [] };
    s.months[ym].others.push(entry);
  }, 'edit');
  toast(`已帶入 ${tpl.name}`);
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
    const has = month && (Object.keys(month.cards).length > 0 || month.others.length > 0);
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

  $('#editorForm').addEventListener('submit', saveEditor);
  $('#cancelBtn').addEventListener('click', closeEditor);
  $('#editorClose').addEventListener('click', closeEditor);
  $('#deleteBtn').addEventListener('click', () => {
    if (!editing) return;
    const { kind, key, ym } = editing;
    if (kind === 'card') return;
    if (!confirm('確定刪除這筆帳單？')) return;
    store.commit((s) => {
      s.months[ym].others = s.months[ym].others.filter((o) => o.id !== key);
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
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 8) {
      toast('同步碼至少 8 個字元');
      return;
    }
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
    await pullNow();
    await pushNow();
    renderSettings();
    toast('已同步');
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
    if (!confirm('會覆蓋目前所有資料，回到 1～10 月示範資料。建議先匯出。確定？')) return;
    store.resetToSeed();
    toast('已還原示範資料');
    renderAll();
  });

  $('#templateList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-del-tpl]');
    if (!btn) return;
    if (!confirm('從固定項目移除？已建立的帳單不受影響。')) return;
    store.commit((s) => {
      s.templates = s.templates.filter((t) => t.id !== btn.dataset.delTpl);
    }, 'edit');
    toast('已移除');
  });

  window.addEventListener(
    'scroll',
    () => $('.topbar').classList.toggle('is-scrolled', window.scrollY > 4),
    { passive: true },
  );

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
  renderAll();
  if (['edit', 'month', 'import', 'reset', 'sync-setting'].includes(reason)) schedulePush();
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW 註冊失敗', err));
  });
}
