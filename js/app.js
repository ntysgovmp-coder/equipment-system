// ================= 共用小工具 =================
function $(sel, root) { return (root || document).querySelector(sel); }
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(d) { if (!d) return '-'; const dt = new Date(d); if (isNaN(dt)) return String(d); return dt.toLocaleString('zh-TW', { hour12: false }); }

function toast(msg, type) {
  const el = h(`<div class="toast ${type || ''}">${esc(msg)}</div>`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(innerHtml) {
  closeModal();
  const backdrop = h(`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${innerHtml}</div></div>`);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  return backdrop;
}
function closeModal() { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); }

async function guard(promise) {
  try { return await promise; }
  catch (e) {
    toast(e.message, 'error');
    if (String(e.message).includes('登入')) { Api.clearToken(); location.hash = '#/login'; }
    throw e;
  }
}

// ================= 可搜尋選單元件（打字即可篩選，桌機/手機通用） =================
function searchableSelectHtml(id, placeholder) {
  return `<div class="ssel" id="wrap_${id}">
    <input type="text" id="${id}_input" placeholder="${esc(placeholder || '點選或輸入搜尋...')}" autocomplete="off"/>
    <input type="hidden" id="${id}_value"/>
    <div class="ssel-list" id="${id}_list"></div>
  </div>`;
}

// options：字串陣列，或 {value,label} 物件陣列
function initSearchableSelect(id, options, onChange) {
  let norm = (options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  const input = document.getElementById(id + '_input');
  const hidden = document.getElementById(id + '_value');
  const list = document.getElementById(id + '_list');
  if (!input) return null;

  function render(filter) {
    const f = (filter || '').trim().toLowerCase();
    const matches = f ? norm.filter(o => o.label.toLowerCase().includes(f)) : norm;
    list.innerHTML = matches.length
      ? matches.map(o => `<div class="ssel-item" data-v="${esc(o.value)}">${esc(o.label)}</div>`).join('')
      : `<div class="ssel-empty">找不到符合的項目</div>`;
    list.classList.add('show');
    list.querySelectorAll('.ssel-item').forEach(el => el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const v = el.dataset.v;
      const opt = norm.find(o => o.value === v);
      input.value = opt ? opt.label : v;
      hidden.value = v;
      list.classList.remove('show');
      if (onChange) onChange(v);
    }));
  }
  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => { hidden.value = ''; render(input.value); if (onChange) onChange(''); });
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 150));

  return {
    setOptions(newOptions) { norm = (newOptions || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o)); },
    getValue() { return hidden.value; },
    getText() { return input.value.trim(); },
    setValue(v) {
      const opt = norm.find(o => o.value === v);
      hidden.value = v || '';
      input.value = opt ? opt.label : (v || '');
    },
    clear() { hidden.value = ''; input.value = ''; },
  };
}

// ================= 人員資料快取（給經辦人選單使用） =================
let _staffListCache = null;
async function getStaffList() {
  if (_staffListCache) return _staffListCache;
  try { const res = await Api.listStaff(); _staffListCache = res.data || []; }
  catch (e) { _staffListCache = []; }
  return _staffListCache;
}
function resetStaffCache() { _staffListCache = null; }
function activeUnitsOf(staffList) {
  return Array.from(new Set(staffList.filter(s => s['狀態'] === '在職' && s['單位']).map(s => s['單位'])));
}
function activeNamesOf(staffList, unit) {
  return staffList.filter(s => s['狀態'] === '在職' && (!unit || s['單位'] === unit)).map(s => s['員工姓名']);
}

// 單位／經辦人 兩層可搜尋選單（先選單位，再從該單位在職人員中挑選姓名；也可直接打字搜尋姓名）
function unitPersonFieldsHtml(prefix, unitLabel, personLabel) {
  return `
    <div class="field"><label>${unitLabel || '單位'}</label>${searchableSelectHtml(prefix + '_unit', '輸入或點選單位')}</div>
    <div class="field"><label>${personLabel || '經辦人'}</label>${searchableSelectHtml(prefix + '_person', '先選單位，或直接搜尋姓名')}</div>`;
}
function _wireCascade(prefix, units, namesForUnit) {
  const personCtrl = initSearchableSelect(prefix + '_person', namesForUnit(''));
  const unitCtrl = initSearchableSelect(prefix + '_unit', units, (u) => {
    personCtrl.setOptions(namesForUnit(u));
    personCtrl.clear();
  });
  return { unitCtrl, personCtrl };
}
// 後台已登入頁面使用：從伺服器取得完整在職人員清單
async function wireUnitPersonFields(prefix) {
  const staffList = await getStaffList();
  return _wireCascade(prefix, activeUnitsOf(staffList), (u) => activeNamesOf(staffList, u));
}
// QR 免登入流程使用：staffSimpleList 為 [{unit,name}]，來自 qrInit（伺服器已過濾在職人員）
function wireUnitPersonFieldsQR(prefix, staffSimpleList) {
  const units = Array.from(new Set(staffSimpleList.map(s => s.unit).filter(Boolean)));
  return _wireCascade(prefix, units, (u) => staffSimpleList.filter(s => !u || s.unit === u).map(s => s.name));
}

// ================= 分類選單（給固定/銷耗資產新增編輯使用，可選既有分類或新增分類） =================
async function fetchCategories(itemType) {
  try { const res = await Api.listCategories(itemType); return res.data || []; }
  catch (e) { return []; }
}
function categoryFieldHtml(id, categories, currentValue) {
  const isKnown = !currentValue || categories.includes(currentValue);
  return `
    <div class="field"><label>分類</label>
      <select id="${id}">
        <option value="">-- 請選擇分類 --</option>
        ${categories.map(c => `<option ${c === currentValue ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        <option value="__new__" ${!isKnown ? 'selected' : ''}>+ 新增分類...</option>
      </select>
    </div>
    <div class="field ${isKnown ? 'hidden' : ''}" id="${id}_newField"><label>新分類名稱</label><input id="${id}_new" value="${esc(!isKnown ? currentValue : '')}"/></div>`;
}
function wireCategoryField(id) {
  $('#' + id).addEventListener('change', () => $('#' + id + '_newField').classList.toggle('hidden', $('#' + id).value !== '__new__'));
}
function categoryFieldValue(id) {
  const sel = $('#' + id).value;
  return sel === '__new__' ? $('#' + id + '_new').value.trim() : sel;
}

// ================= 品項專屬 QR Code（掃了直接登記該品項，不需要先選項目） =================
function itemQrUrl(type, id) {
  return location.origin + location.pathname + '#/qi/' + type + '/' + encodeURIComponent(id);
}
function itemQrImgSrc(type, id, size) {
  const s = size || 150;
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + s + 'x' + s + '&data=' + encodeURIComponent(itemQrUrl(type, id));
}

// 尺寸選擇（給列印/下載使用，最小 1 公分）
const QR_SIZE_PRESETS = [1, 1.5, 2, 3, 4, 5];
function qrSizeControlsHtml(prefix) {
  return `
    <div class="field" style="margin-top:12px;max-width:220px">
      <label>列印／下載尺寸</label>
      <select id="${prefix}_size">
        ${QR_SIZE_PRESETS.map(cm => `<option value="${cm}" ${cm === 2 ? 'selected' : ''}>${cm} x ${cm} 公分</option>`).join('')}
        <option value="custom">自訂...</option>
      </select>
    </div>
    <div class="field hidden" id="${prefix}_customField" style="max-width:220px"><label>自訂邊長（公分，最小 1）</label><input id="${prefix}_custom" type="number" min="1" step="0.1" value="2"/></div>`;
}
function qrSizeControlsValue(prefix) {
  const sel = $('#' + prefix + '_size').value;
  const cm = sel === 'custom' ? Number($('#' + prefix + '_custom').value || 1) : Number(sel);
  return Math.max(1, cm);
}

// 品項詳情頁用：本機產生 QR 圖（不受網路服務影響），並綁定「依所選尺寸下載」「開新分頁看大圖（可另存）」「開新視窗依尺寸列印」
async function wireItemQrDownload(imgId, dlId, printId, sizePrefix, type, id, filenamePrefix, openId) {
  let previewDataUrl = null;
  try {
    previewDataUrl = await QRCode.toDataURL(itemQrUrl(type, id), { width: 300, margin: 1 });
    const img = document.getElementById(imgId);
    if (img) img.src = previewDataUrl;
  } catch (e) { /* 本機產生失敗就維持線上服務顯示的圖 */ }

  const sizeSel = document.getElementById(sizePrefix + '_size');
  if (sizeSel) sizeSel.addEventListener('change', () => {
    document.getElementById(sizePrefix + '_customField').classList.toggle('hidden', sizeSel.value !== 'custom');
  });

  async function genAtSelectedSize() {
    const cm = qrSizeControlsValue(sizePrefix);
    const px = Math.max(80, Math.min(2000, Math.round(cm / 2.54 * 300))); // 以 300 dpi 估算，並限制上限避免尺寸過大產生失敗
    const dataUrl = await QRCode.toDataURL(itemQrUrl(type, id), { width: px, margin: 1 });
    return { cm, dataUrl };
  }

  const dl = document.getElementById(dlId);
  if (dl) dl.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const { cm, dataUrl } = await genAtSelectedSize();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filenamePrefix + '_QRCode_' + cm + 'cm.png';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) { toast('QR Code 產生失敗：' + err.message, 'error'); }
  });

  // 部分手機瀏覽器（尤其 iOS Safari）不支援 <a download>，改用開新分頁顯示大圖，讓使用者長按/右鍵另存
  const op = document.getElementById(openId);
  if (op) op.addEventListener('click', async () => {
    try {
      const { cm, dataUrl } = await genAtSelectedSize();
      const w = window.open('');
      if (!w) { toast('瀏覽器阻擋了開新分頁，請允許彈出視窗後再試一次', 'error'); return; }
      w.document.write(`<html><head><title>${filenamePrefix} QR Code</title></head>
        <body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#111;color:#fff;font-family:sans-serif">
          <img src="${dataUrl}" style="max-width:90vw;max-height:70vh"/>
          <p style="margin-top:16px;font-size:14px">長按（手機）或右鍵（電腦）圖片，選「儲存圖片」即可下載　｜　實際列印尺寸：${cm} x ${cm} 公分</p>
        </body></html>`);
      w.document.close();
    } catch (err) { toast('QR Code 產生失敗：' + err.message, 'error'); }
  });

  const pr = document.getElementById(printId);
  if (pr) pr.addEventListener('click', async () => {
    try {
      const { cm, dataUrl } = await genAtSelectedSize();
      const w = window.open('');
      if (!w) { toast('瀏覽器阻擋了開新視窗，請允許彈出視窗後再試一次', 'error'); return; }
      w.document.write(`<html><head><title>列印 QR Code</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh">
        <img src="${dataUrl}" style="width:${cm}cm;height:${cm}cm"/>
      </body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 300);
    } catch (err) { toast('QR Code 產生失敗：' + err.message, 'error'); }
  });
}

// ================= App Shell =================
const NAV = [
  { href: '#/dashboard', label: '主頁面', icon: '🏠' },
  { href: '#/fixed', label: '固定資產', icon: '📦' },
  { href: '#/cons', label: '銷耗資產', icon: '🧯' },
  { href: '#/staff', label: '人員設定', icon: '👥' },
  { href: '#/reports', label: '報表下載', icon: '📊' },
  { href: '#/settings', label: '系統通知設定', icon: '⚙️' },
];

function renderShell() {
  const session = getSession();
  document.body.innerHTML = `
    <div class="app">
      <div class="sidebar">
        <div class="brand"><div class="mark">EM</div><div class="name">設備管理系統</div></div>
        <div class="nav" id="navList"></div>
        <div class="userbox"><b>${esc(session.name || session.account)}</b>權限：${esc(session.role || '一般')}
          <div style="margin-top:10px"><button class="btn btn-ghost btn-sm btn-block" id="logoutBtn">登出</button></div>
        </div>
      </div>
      <div class="main">
        <div class="topbar">
          <div><h2 id="pageTitle">-</h2><div class="sub" id="pageSub"></div></div>
          <a href="#/qr" class="btn btn-primary btn-sm" style="text-decoration:none">📷 QR 掃碼登記</a>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>`;
  const navList = $('#navList');
  NAV.forEach(n => navList.appendChild(h(`<a href="${n.href}">${n.icon} ${n.label}</a>`)));
  navList.appendChild(h(`<div class="qr-link"><a href="#/qr">📷 QR 掃碼登記</a></div>`));
  $('#logoutBtn').addEventListener('click', async () => { await guard(Api.logout()); Api.clearToken(); clearSession(); location.hash = '#/login'; });
}

function setTitle(title, sub) { $('#pageTitle').textContent = title; $('#pageSub').textContent = sub || ''; document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === location.hash.split('/').slice(0, 2).join('/'))); }

// ================= Session (顯示用，非驗證用) =================
function getSession() { try { return JSON.parse(localStorage.getItem('ems_session') || '{}'); } catch (e) { return {}; } }
function setSession(s) { localStorage.setItem('ems_session', JSON.stringify(s)); }
function clearSession() { localStorage.removeItem('ems_session'); }

// ================= 登入頁 =================
function renderLogin() {
  document.body.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-mark">EM</div>
        <h1>設備管理系統</h1>
        <p class="sub">請輸入帳號密碼登入後台</p>
        <div class="field"><label>帳號</label><input id="account" autocomplete="username"/></div>
        <div class="field"><label>密碼</label><input id="password" type="password" autocomplete="current-password"/></div>
        <button class="btn btn-primary btn-block" id="loginBtn">登入</button>
        <div class="error-msg" id="loginError"></div>
        <div class="hint">手機掃碼借還／領用請直接使用 QR Code 連結，無需登入</div>
      </div>
    </div>`;
  $('#loginBtn').addEventListener('click', doLogin);
  $('#password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const account = $('#account').value.trim();
  const password = $('#password').value;
  $('#loginError').textContent = '';
  if (!account || !password) { $('#loginError').textContent = '請輸入帳號與密碼'; return; }
  try {
    const res = await Api.login(account, password);
    Api.setToken(res.token);
    setSession({ account: res.account, role: res.role, name: res.name });
    location.hash = '#/dashboard';
  } catch (e) { $('#loginError').textContent = e.message; }
}

// ================= 主頁面 =================
async function viewDashboard() {
  setTitle('主頁面', '系統整體狀態總覽');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.dashboard());
  const d = res.data;
  $('#content').innerHTML = `
    <div class="grid-stats">
      <div class="stat-card"><div class="label">固定資產總項目</div><div class="value">${d.fixedTotal}</div></div>
      <div class="stat-card warn"><div class="label">目前借出中項目</div><div class="value">${d.borrowedCount}</div></div>
      <div class="stat-card"><div class="label">銷耗資產總項目</div><div class="value">${d.consTotal}</div></div>
      <div class="stat-card danger"><div class="label">低於安全庫存</div><div class="value">${d.lowStockCount}</div></div>
    </div>
    <div class="panel">
      <h3>⚠️ 銷耗資產庫存警告</h3>
      ${d.lowStockList.length ? tbl(['品項名稱', '目前剩餘', '安全值', '位置'], d.lowStockList.map(c => [c['品項名稱'], c['目前剩餘數量'], c['警告安全數量'], c['位置備註']])) : `<div class="empty">目前沒有低於安全庫存的品項</div>`}
    </div>
    <div class="panel">
      <h3>🔧 固定資產狀態警告（損壞/異常）</h3>
      ${d.warningFixedList.length ? tbl(['品項名稱', '狀態', '位置'], d.warningFixedList.map(f => [f['品項名稱'], f['目前狀態'], f['位置備註']])) : `<div class="empty">目前沒有異常設備</div>`}
    </div>`;
}

function tbl(headers, rows) {
  return `<table><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ================= 固定資產 =================
function statusBadge(status) {
  if (status === '正常') return `<span class="badge ok">正常</span>`;
  if (status === '借出中') return `<span class="badge warn">借出中</span>`;
  if (status === '損壞待修') return `<span class="badge danger">損壞待修</span>`;
  return `<span class="badge neutral">${esc(status || '-')}</span>`;
}

async function viewFixedList() {
  setTitle('固定資產', '所有固定資產、借用狀態與設備警告');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.listFixedAssets());
  const data = res.data;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input type="search" id="q" placeholder="搜尋品項名稱、編號、位置..."/>
        <button class="btn btn-primary" id="addBtn">+ 新增固定資產</button>
      </div>
      <div id="tableWrap"></div>
    </div>`;
  function draw(list) {
    $('#tableWrap').innerHTML = list.length ? tblRows(list) : `<div class="empty">尚無資料，點選右上角新增</div>`;
    $('#tableWrap').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { location.hash = '#/fixed/' + encodeURIComponent(tr.dataset.id); }));
  }
  function tblRows(list) {
    return `<table><thead><tr><th>編號</th><th>分類</th><th>品項名稱</th><th>總數量</th><th>可借數量</th><th>位置</th><th>狀態</th></tr></thead>
      <tbody>${list.map(f => `<tr data-id="${esc(f['資產編號'])}">
        <td>${esc(f['資產編號'])}</td><td>${esc(f['分類'] || '-')}</td><td>${esc(f['品項名稱'])}</td><td>${esc(f['總數量'])}</td>
        <td>${esc(f['目前可借數量'])}</td><td>${esc(f['位置備註'])}</td><td>${statusBadge(f['目前狀態'])}</td></tr>`).join('')}</tbody></table>`;
  }
  draw(data);
  $('#q').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    draw(data.filter(f => Object.values(f).join(' ').toLowerCase().includes(q)));
  });
  $('#addBtn').addEventListener('click', () => openFixedForm());
}

async function openFixedForm(existing) {
  const isEdit = !!existing;
  const categories = await fetchCategories('FIXED');
  openModal(`
    <h3>${isEdit ? '編輯固定資產' : '新增固定資產'}</h3>
    ${isEdit ? `<p style="color:var(--muted);font-size:12.5px;margin-top:-8px">編號：${esc(existing['資產編號'])}（編號一經建立不會變動）</p>` : `<p style="color:var(--muted);font-size:12.5px;margin-top:-8px">選好分類後，編號會自動產生，不用手動輸入</p>`}
    ${categoryFieldHtml('f_category', categories, existing ? existing['分類'] : '')}
    <div class="field"><label>品項名稱</label><input id="f_name" value="${esc(existing ? existing['品項名稱'] : '')}"/></div>
    <div class="two-col">
      <div class="field"><label>總數量</label><input id="f_total" type="number" min="0" value="${existing ? existing['總數量'] : 1}"/></div>
      <div class="field"><label>目前可借數量</label><input id="f_avail" type="number" min="0" value="${existing ? existing['目前可借數量'] : 1}"/></div>
    </div>
    <div class="field"><label>位置備註</label><input id="f_loc" value="${esc(existing ? existing['位置備註'] : '倉庫')}"/></div>
    <div class="field"><label>目前狀態</label>
      <select id="f_status">
        ${['正常', '借出中', '損壞待修'].map(s => `<option ${existing && existing['目前狀態'] === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">取消</button>
      <button class="btn btn-primary" id="saveBtn">儲存</button>
    </div>`);
  wireCategoryField('f_category');
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const category = categoryFieldValue('f_category');
    const payload = { name: $('#f_name').value.trim(), category, total: Number($('#f_total').value), available: Number($('#f_avail').value), location: $('#f_loc').value.trim(), status: $('#f_status').value };
    if (!payload.name) { toast('請輸入品項名稱', 'error'); return; }
    if (!category) { toast('請選擇或輸入分類', 'error'); return; }
    $('#saveBtn').disabled = true;
    try {
      let id;
      if (isEdit) { payload.id = existing['資產編號']; await Api.updateFixedAsset(payload); id = payload.id; }
      else { const r = await Api.addFixedAsset(payload); id = r.id; }
      closeModal(); toast(isEdit ? '已儲存' : `已新增，編號：${id}`, 'success');
      viewFixedDetail(id);
    } catch (e) { toast(e.message, 'error'); $('#saveBtn').disabled = false; }
  });
}

async function viewFixedDetail(id) {
  setTitle('固定資產詳情', id);
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.fixedAssetDetail(id));
  const a = res.data.asset, logs = res.data.logs;
  $('#content').innerHTML = `
    <a class="back-link" href="#/fixed">← 返回固定資產列表</a>
    <div class="panel">
      <div class="toolbar">
        <h3 style="margin:0">${esc(a['品項名稱'])} <span style="color:var(--muted);font-weight:400;font-size:13px">（${esc(a['資產編號'])} · ${esc(a['分類'] || '未分類')}）</span></h3>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" id="editBtn">編輯</button>
          <button class="btn btn-danger btn-sm" id="delBtn">刪除</button>
        </div>
      </div>
      <div class="grid-stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card"><div class="label">總數量</div><div class="value">${a['總數量']}</div></div>
        <div class="stat-card"><div class="label">目前可借</div><div class="value">${a['目前可借數量']}</div></div>
        <div class="stat-card"><div class="label">位置</div><div class="value" style="font-size:16px">${esc(a['位置備註'])}</div></div>
        <div class="stat-card"><div class="label">狀態</div><div class="value" style="font-size:16px">${statusBadge(a['目前狀態'])}</div></div>
      </div>
      <div class="toolbar" style="margin-top:10px">
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" data-act="借出">登記借出</button>
          <button class="btn btn-ghost btn-sm" data-act="歸還">登記歸還</button>
          <button class="btn btn-ghost btn-sm" data-act="採購">登記採購(增加數量)</button>
          <button class="btn btn-danger btn-sm" data-act="損壞">回報損壞</button>
          <button class="btn btn-ghost btn-sm" data-act="維修完成">維修完成</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>📷 此設備專屬 QR Code</h3>
      <p style="color:var(--muted);font-size:12.5px">貼在設備本體上，同仁掃描後可直接登記這項設備的借出／歸還，不用先選項目。</p>
      <div class="qrcode-box"><img id="fqr_img" src="${itemQrImgSrc('fixed', a['資產編號'], 200)}" width="200" height="200"/></div>
      ${qrSizeControlsHtml('fqr')}
      <div class="row-actions" style="margin-top:10px">
        <a id="fqr_dl" class="btn btn-primary btn-sm" href="#" style="text-decoration:none">下載 QR Code 圖片</a>
        <button class="btn btn-ghost btn-sm" id="fqr_open">開新分頁看大圖（可另存）</button>
        <button class="btn btn-ghost btn-sm" id="fqr_print">開新視窗列印</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">如果「下載」按鈕沒反應（常見於手機瀏覽器），改用「開新分頁看大圖」，長按（手機）或右鍵（電腦）圖片選「儲存圖片」即可。</p>
    </div>
    <div class="panel">
      <h3>租借歸還／採購／損壞紀錄</h3>
      ${logs.length ? logs.map(l => `<div class="log-item"><div>
          <b>${esc(l['動作'])}</b>　${esc(l['經辦人'])}　數量：${esc(l['數量'])}　${esc(l['備註'] || '')}
          <div class="meta">${fmtDate(l['時間戳記'])} ${l['預計歸還時間'] ? '｜預計歸還：' + esc(l['預計歸還時間']) : ''} ${l['實際歸還時間'] ? '｜實際歸還：' + esc(l['實際歸還時間']) : ''}</div>
        </div></div>`).join('') : `<div class="empty">尚無紀錄</div>`}
    </div>`;
  $('#editBtn').addEventListener('click', () => openFixedForm(a));
  $('#delBtn').addEventListener('click', async () => {
    if (!confirm('確定要刪除此固定資產嗎？')) return;
    await guard(Api.deleteFixedAsset(a['資產編號'])); toast('已刪除', 'success'); location.hash = '#/fixed';
  });
  $('#content').querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => openFixedActionForm(a, btn.dataset.act)));
  wireItemQrDownload('fqr_img', 'fqr_dl', 'fqr_print', 'fqr', 'fixed', a['資產編號'], a['資產編號'], 'fqr_open');
}

async function openFixedActionForm(asset, action) {
  const needsQty = action === '採購';
  const needsDate = action === '借出' || action === '歸還';
  openModal(`
    <h3>${action}：${esc(asset['品項名稱'])}</h3>
    ${unitPersonFieldsHtml('a', '單位', '經辦人 / 借用人')}
    ${needsQty ? `<div class="field"><label>數量</label><input id="a_qty" type="number" min="1" value="1"/></div>` : ''}
    ${needsDate ? `<div class="field"><label>${action === '借出' ? '預計歸還日期' : '實際歸還日期'}</label><input id="a_date" type="date"/></div>` : ''}
    <div class="field"><label>備註</label><input id="a_note" placeholder="租借原因等"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">取消</button>
      <button class="btn btn-primary" id="okBtn">確認</button>
    </div>`);
  const { personCtrl } = await wireUnitPersonFields('a');
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#okBtn').addEventListener('click', async () => {
    const person = personCtrl.getValue();
    if (!person) { toast('請先選單位，再從清單點選經辦人姓名', 'error'); return; }
    const payload = { id: asset['資產編號'], action, qty: needsQty ? Number($('#a_qty').value) : 1, person, note: $('#a_note').value.trim() };
    if (needsDate) { const v = $('#a_date').value; if (action === '借出') payload.expectedReturn = v; else payload.actualReturn = v; }
    try { await Api.fixedAssetAction(payload); closeModal(); toast('已登記', 'success'); viewFixedDetail(asset['資產編號']); }
    catch (e) { toast(e.message, 'error'); }
  });
}

// ================= 銷耗資產 =================
async function viewConsList() {
  setTitle('銷耗資產', '所有銷耗品剩餘數量與低庫存警告');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.listConsumables());
  const data = res.data;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input type="search" id="q" placeholder="搜尋品項名稱、編號、位置..."/>
        <button class="btn btn-primary" id="addBtn">+ 新增銷耗資產</button>
      </div>
      <div id="tableWrap"></div>
    </div>`;
  function draw(list) {
    $('#tableWrap').innerHTML = list.length ? `<table><thead><tr><th>編號</th><th>分類</th><th>品項名稱</th><th>剩餘數量</th><th>安全值</th><th>位置</th><th>狀態</th></tr></thead>
      <tbody>${list.map(c => {
        const low = Number(c['目前剩餘數量']) <= Number(c['警告安全數量']);
        return `<tr data-id="${esc(c['資產編號'])}"><td>${esc(c['資產編號'])}</td><td>${esc(c['分類'] || '-')}</td><td>${esc(c['品項名稱'])}</td><td>${esc(c['目前剩餘數量'])}</td><td>${esc(c['警告安全數量'])}</td><td>${esc(c['位置備註'])}</td><td>${low ? '<span class="badge danger">庫存不足</span>' : '<span class="badge ok">正常</span>'}</td></tr>`;
      }).join('')}</tbody></table>` : `<div class="empty">尚無資料，點選右上角新增</div>`;
    $('#tableWrap').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { location.hash = '#/cons/' + encodeURIComponent(tr.dataset.id); }));
  }
  draw(data);
  $('#q').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); draw(data.filter(c => Object.values(c).join(' ').toLowerCase().includes(q))); });
  $('#addBtn').addEventListener('click', () => openConsForm());
}

async function openConsForm(existing) {
  const isEdit = !!existing;
  const categories = await fetchCategories('CONS');
  openModal(`
    <h3>${isEdit ? '編輯銷耗資產' : '新增銷耗資產'}</h3>
    ${isEdit ? `<p style="color:var(--muted);font-size:12.5px;margin-top:-8px">編號：${esc(existing['資產編號'])}（編號一經建立不會變動）</p>` : `<p style="color:var(--muted);font-size:12.5px;margin-top:-8px">選好分類後，編號會自動產生，不用手動輸入</p>`}
    ${categoryFieldHtml('c_category', categories, existing ? existing['分類'] : '')}
    <div class="field"><label>品項名稱</label><input id="c_name" value="${esc(existing ? existing['品項名稱'] : '')}"/></div>
    <div class="two-col">
      <div class="field"><label>目前剩餘數量</label><input id="c_qty" type="number" min="0" value="${existing ? existing['目前剩餘數量'] : 0}"/></div>
      <div class="field"><label>警告安全數量</label><input id="c_warn" type="number" min="0" value="${existing ? existing['警告安全數量'] : 5}"/></div>
    </div>
    <div class="field"><label>位置備註</label><input id="c_loc" value="${esc(existing ? existing['位置備註'] : '倉庫')}"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">取消</button>
      <button class="btn btn-primary" id="saveBtn">儲存</button>
    </div>`);
  wireCategoryField('c_category');
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const category = categoryFieldValue('c_category');
    const payload = { name: $('#c_name').value.trim(), category, qty: Number($('#c_qty').value), warnQty: Number($('#c_warn').value), location: $('#c_loc').value.trim() };
    if (!payload.name) { toast('請輸入品項名稱', 'error'); return; }
    if (!category) { toast('請選擇或輸入分類', 'error'); return; }
    $('#saveBtn').disabled = true;
    try {
      let id;
      if (isEdit) { payload.id = existing['資產編號']; await Api.updateConsumable(payload); id = payload.id; }
      else { const r = await Api.addConsumable(payload); id = r.id; }
      closeModal(); toast(isEdit ? '已儲存' : `已新增，編號：${id}`, 'success');
      viewConsDetail(id);
    } catch (e) { toast(e.message, 'error'); $('#saveBtn').disabled = false; }
  });
}

async function viewConsDetail(id) {
  setTitle('銷耗資產詳情', id);
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.consumableDetail(id));
  const item = res.data.item, logs = res.data.logs;
  const low = Number(item['目前剩餘數量']) <= Number(item['警告安全數量']);
  $('#content').innerHTML = `
    <a class="back-link" href="#/cons">← 返回銷耗資產列表</a>
    <div class="panel">
      <div class="toolbar">
        <h3 style="margin:0">${esc(item['品項名稱'])} <span style="color:var(--muted);font-weight:400;font-size:13px">（${esc(item['資產編號'])} · ${esc(item['分類'] || '未分類')}）</span></h3>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" id="editBtn">編輯</button>
          <button class="btn btn-danger btn-sm" id="delBtn">刪除</button>
        </div>
      </div>
      <div class="grid-stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card ${low ? 'danger' : ''}"><div class="label">目前剩餘</div><div class="value">${item['目前剩餘數量']}</div></div>
        <div class="stat-card"><div class="label">安全值</div><div class="value">${item['警告安全數量']}</div></div>
        <div class="stat-card"><div class="label">位置</div><div class="value" style="font-size:16px">${esc(item['位置備註'])}</div></div>
        <div class="stat-card"><div class="label">狀態</div><div class="value" style="font-size:16px">${low ? '<span class="badge danger">庫存不足</span>' : '<span class="badge ok">正常</span>'}</div></div>
      </div>
      <div class="toolbar" style="margin-top:10px">
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" data-act="補充">登記補充(入庫)</button>
          <button class="btn btn-ghost btn-sm" data-act="出庫">登記出庫(領用)</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>📷 此品項專屬 QR Code</h3>
      <p style="color:var(--muted);font-size:12.5px">貼在耗材架上，同仁掃描後可直接登記這項耗材的補充／出庫數量，不用先選項目。</p>
      <div class="qrcode-box"><img id="cqr_img" src="${itemQrImgSrc('cons', item['資產編號'], 200)}" width="200" height="200"/></div>
      ${qrSizeControlsHtml('cqr')}
      <div class="row-actions" style="margin-top:10px">
        <a id="cqr_dl" class="btn btn-primary btn-sm" href="#" style="text-decoration:none">下載 QR Code 圖片</a>
        <button class="btn btn-ghost btn-sm" id="cqr_open">開新分頁看大圖（可另存）</button>
        <button class="btn btn-ghost btn-sm" id="cqr_print">開新視窗列印</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">如果「下載」按鈕沒反應（常見於手機瀏覽器），改用「開新分頁看大圖」，長按（手機）或右鍵（電腦）圖片選「儲存圖片」即可。</p>
    </div>
    <div class="panel">
      <h3>補充／出庫紀錄</h3>
      ${logs.length ? logs.map(l => `<div class="log-item"><div><b>${esc(l['動作'])}</b>　數量：${esc(l['異動數量'])}　${esc(l['備註'] || '')}
        <div class="meta">${fmtDate(l['時間戳記'])}</div></div></div>`).join('') : `<div class="empty">尚無紀錄</div>`}
    </div>`;
  $('#editBtn').addEventListener('click', () => openConsForm(item));
  $('#delBtn').addEventListener('click', async () => {
    if (!confirm('確定要刪除此銷耗資產嗎？')) return;
    await guard(Api.deleteConsumable(item['資產編號'])); toast('已刪除', 'success'); location.hash = '#/cons';
  });
  $('#content').querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
    openModal(`
      <h3>${btn.dataset.act}：${esc(item['品項名稱'])}</h3>
      <div class="field"><label>數量</label><input id="a_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label>備註</label><input id="a_note"/></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="okBtn">確認</button></div>`);
    $('#cancelBtn').addEventListener('click', closeModal);
    $('#okBtn').addEventListener('click', async () => {
      try {
        await Api.consumableAction({ id: item['資產編號'], action: btn.dataset.act, qty: Number($('#a_qty').value), note: $('#a_note').value.trim() });
        closeModal(); toast('已登記', 'success'); viewConsDetail(item['資產編號']);
      } catch (e) { toast(e.message, 'error'); }
    });
  }));
  wireItemQrDownload('cqr_img', 'cqr_dl', 'cqr_print', 'cqr', 'cons', item['資產編號'], item['資產編號'], 'cqr_open');
}

// ================= 人員設定 =================
async function viewStaff() {
  setTitle('人員設定', '管理人員列表與所屬單位');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.listStaff());
  const data = res.data;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <select id="statusFilter" style="width:150px">
          <option value="all">顯示全部</option>
          <option value="在職">只顯示在職</option>
          <option value="離職">只顯示離職</option>
        </select>
        <button class="btn btn-primary" id="addBtn">+ 新增人員</button>
      </div>
      <div id="staffTableWrap"></div>
    </div>`;
  function draw(list) {
    $('#staffTableWrap').innerHTML = list.length ? `<table><thead><tr><th>單位</th><th>員工姓名</th><th>狀態</th><th></th></tr></thead>
      <tbody>${list.map(s => `<tr><td>${esc(s['單位'])}</td><td>${esc(s['員工姓名'])}</td><td>${s['狀態'] === '在職' ? '<span class="badge ok">在職</span>' : '<span class="badge neutral">離職</span>'}</td>
        <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(s['員工ID'])}">編輯</button><button class="btn btn-danger btn-sm" data-del="${esc(s['員工ID'])}">刪除</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">尚無符合條件的人員資料</div>`;
    $('#staffTableWrap').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openStaffForm(data.find(s => s['員工ID'] === b.dataset.edit), data)));
    $('#staffTableWrap').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('確定要刪除此人員嗎？')) return;
      await guard(Api.deleteStaff(b.dataset.del)); resetStaffCache(); toast('已刪除', 'success'); viewStaff();
    }));
  }
  draw(data);
  $('#statusFilter').addEventListener('change', () => {
    const v = $('#statusFilter').value;
    draw(v === 'all' ? data : data.filter(s => s['狀態'] === v));
  });
  $('#addBtn').addEventListener('click', () => openStaffForm(null, data));
}

function allUnitsOf(staffList) {
  return Array.from(new Set((staffList || []).filter(s => s['單位']).map(s => s['單位'])));
}

function openStaffForm(existing, staffList) {
  const units = allUnitsOf(staffList || []);
  const currentUnit = existing ? existing['單位'] : '';
  const isKnownUnit = !currentUnit || units.includes(currentUnit);
  openModal(`
    <h3>${existing ? '編輯人員：' + esc(existing['員工姓名']) : '新增人員'}</h3>
    <div class="field"><label>單位</label>
      <select id="s_unit">
        <option value="">-- 請選擇單位 --</option>
        ${units.map(u => `<option ${u === currentUnit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
        <option value="__new__" ${!isKnownUnit ? 'selected' : ''}>+ 新增單位...</option>
      </select>
    </div>
    <div class="field ${isKnownUnit ? 'hidden' : ''}" id="newUnitField"><label>新單位名稱</label><input id="s_unit_new" value="${esc(!isKnownUnit ? currentUnit : '')}"/></div>
    <div class="field"><label>員工姓名</label><input id="s_name" value="${esc(existing ? existing['員工姓名'] : '')}"/></div>
    <div class="field"><label>狀態</label><select id="s_status"><option ${!existing || existing['狀態'] === '在職' ? 'selected' : ''}>在職</option><option ${existing && existing['狀態'] === '離職' ? 'selected' : ''}>離職</option></select></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="saveBtn">儲存</button></div>`);
  $('#s_unit').addEventListener('change', () => $('#newUnitField').classList.toggle('hidden', $('#s_unit').value !== '__new__'));
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const sel = $('#s_unit').value;
    const unit = sel === '__new__' ? $('#s_unit_new').value.trim() : sel;
    const name = $('#s_name').value.trim(), status = $('#s_status').value;
    if (!unit) { toast('請選擇或輸入單位', 'error'); return; }
    if (!name) { toast('請輸入姓名', 'error'); return; }
    try {
      if (existing) await Api.updateStaff({ id: existing['員工ID'], unit, name, status });
      else await Api.addStaff({ unit, name, status });
      resetStaffCache();
      closeModal(); toast('已儲存', 'success'); viewStaff();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ================= 系統通知設定 =================
async function viewSettings() {
  setTitle('系統通知設定', '設定通知 Email 與定期報表週期');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.getSettings());
  const s = res.data || {};
  $('#content').innerHTML = `
    <div class="panel" style="max-width:480px">
      <h3>通知設定</h3>
      <div class="field"><label>通知 Email</label><input id="st_email" value="${esc(s['通知Email'] || '')}" placeholder="example@gmail.com"/></div>
      <div class="field"><label>定期報表週期</label>
        <select id="st_cycle">
          ${['每日', '每週', '每月'].map(c => `<option ${s['定期報表週期'] === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <p style="color:var(--muted);font-size:12.5px">上次發信時間：${fmtDate(s['上次發信時間'])}。銷耗資產低於安全庫存時，系統會於每日檢查後自動寄送警告信。</p>
      <button class="btn btn-primary" id="saveBtn">儲存設定</button>
    </div>
    <div class="panel" style="max-width:480px">
      <h3>📷 通用 QR Code 掃碼登記入口</h3>
      <p style="color:var(--muted);font-size:12.5px">列印以下 QR Code 貼在倉庫門口，同仁掃描後可自行選擇要登記固定資產或銷耗資產、選項目，可以連續加入多個品項後一次送出。每個品項詳情頁裡也有「該品項專屬」的 QR Code，貼在設備/耗材本體上，掃了直接知道是哪個品項，一樣可以連續掃多個之後一次送出。</p>
      <div class="qrcode-box"><img id="qrImg" width="180" height="180"/></div>
      <p style="margin-top:10px"><a href="#/qr" target="_blank">${location.origin + location.pathname}#/qr</a></p>
    </div>
    <div class="panel" style="max-width:480px">
      <h3>💾 資料備份</h3>
      <p style="color:var(--muted);font-size:12.5px">系統每天會自動備份一份到你的 Google Drive「${'設備管理系統備份'}」資料夾（最多保留 20 份，自動清除舊備份）；定期報表信件也會自動附上完整 Excel 檔案。你也可以隨時手動備份一次。</p>
      <button class="btn btn-primary btn-sm" id="backupNowBtn">立即備份一份</button>
      <div id="backupList" style="margin-top:14px"></div>
    </div>`;
  const qrUrl = location.origin + location.pathname + '#/qr';
  $('#qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(qrUrl);
  $('#saveBtn').addEventListener('click', async () => {
    try { await Api.updateSettings({ email: $('#st_email').value.trim(), cycle: $('#st_cycle').value }); toast('已儲存', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#backupNowBtn').addEventListener('click', async () => {
    $('#backupNowBtn').disabled = true; $('#backupNowBtn').textContent = '備份中...';
    try {
      await Api.backupNow();
      toast('備份完成', 'success');
      loadBackupList();
    } catch (e) { toast(e.message, 'error'); }
    finally { $('#backupNowBtn').disabled = false; $('#backupNowBtn').textContent = '立即備份一份'; }
  });
  loadBackupList();
}

async function loadBackupList() {
  const el = $('#backupList');
  if (!el) return;
  el.innerHTML = `<div class="empty">載入備份紀錄...</div>`;
  try {
    const res = await Api.listBackups();
    const list = res.data || [];
    el.innerHTML = list.length ? list.slice(0, 10).map(b => `
      <div class="log-item"><div>${esc(b.name)}<div class="meta">${fmtDate(b.createdAt)}</div></div>
      <a class="btn btn-ghost btn-sm" href="${esc(b.url)}" target="_blank" style="text-decoration:none">開啟</a></div>`).join('')
      : `<div class="empty">尚無備份紀錄</div>`;
  } catch (e) { el.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; }
}

// ================= 報表下載 =================
const REPORT_TYPES = [
  { key: 'all', label: '全部資料' },
  { key: 'lowStock', label: '低於安全庫存的銷耗資產' },
  { key: 'fixedStatus', label: '固定資產各項目前狀態' },
  { key: 'consTotal', label: '銷耗資產各項總量' },
  { key: 'purchase', label: '待採購表單（品項與建議採購數量）' },
  { key: 'repair', label: '待維修表單（固定資產損壞數量）' },
  { key: 'catalog', label: '設備總表（資產類型/分類/編號/品名/QR Code圖片，可直接列印）' },
];

function viewReports() {
  setTitle('報表下載', '匯出 Excel 報表');
  $('#content').innerHTML = `
    <div class="panel" style="max-width:560px">
      <h3>選擇要下載的報表</h3>
      ${REPORT_TYPES.map(r => `<div class="log-item"><div>${r.label}</div><button class="btn btn-primary btn-sm" data-type="${r.key}">下載 Excel</button></div>`).join('')}
      <p style="color:var(--muted);font-size:12px;margin-top:14px">「設備總表」會把每項設備的 QR Code 直接嵌入 Excel 儲存格（本機產生，不需要對外連線，一定能成功），下載後可直接列印整份表單。</p>
    </div>`;
  $('#content').querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.type === 'catalog') downloadCatalogReport();
    else downloadReport(btn.dataset.type);
  }));
}

async function downloadReport(type) {
  try {
    const res = await Api.report(type);
    const wb = XLSX.utils.book_new();
    const sheets = res.data;
    Object.keys(sheets).forEach(name => {
      const rows = sheets[name];
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['（無資料）']]);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `設備管理報表_${type}_${ts}.xlsx`);
    toast('報表已下載', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// 設備總表：資產類型（固定資產／消耗資產）、分類、編號、品項名稱、數量、位置、QR Code（本機產生後用 ExcelJS 直接嵌入儲存格）
async function downloadCatalogReport() {
  if (typeof QRCode === 'undefined' || typeof ExcelJS === 'undefined') {
    toast('QR Code／Excel 函式庫尚未載入成功，請強制重新整理網頁（Ctrl+Shift+R）後再試一次；若仍失敗，可能是網路或瀏覽器限制，請聯絡管理員', 'error');
    return;
  }
  toast('設備總表產生中，請稍候...', 'success');
  try {
    const res = await Api.report('catalog');
    const sheetsData = res.data;

    // 第一階段：先把「每一筆」的 QR Code 圖片都產生出來，只要有任何一筆失敗，整份報表就不產生、不下載
    const prepared = {}; // { sheetName: [{ row, dataUrl }] }
    const failures = []; // [{ sheetName, 品項名稱, 資產編號, error }]
    for (const sheetName of Object.keys(sheetsData)) {
      const rows = sheetsData[sheetName];
      prepared[sheetName] = [];
      for (const r of rows) {
        const qrType = r['_qrType'] || (r['資產類型'] === '固定資產' ? 'fixed' : 'cons');
        const qrUrl = itemQrUrl(qrType, r['資產編號']);
        try {
          const dataUrl = await QRCode.toDataURL(qrUrl, { width: 140, margin: 1 });
          prepared[sheetName].push({ row: r, dataUrl });
        } catch (e) {
          failures.push({ sheetName, name: r['品項名稱'], id: r['資產編號'], error: e.message });
        }
      }
    }

    if (failures.length > 0) {
      const detail = failures.slice(0, 5).map(f => `${f.sheetName}／${f.id}／${f.name}`).join('；');
      toast(`已取消下載：共 ${failures.length} 筆 QR Code 產生失敗（${detail}${failures.length > 5 ? '...' : ''}）。請重新整理網頁再試一次，若持續失敗請聯絡管理員`, 'error');
      return;
    }

    // 第二階段：全部成功才建立 Excel 檔案並下載
    const wb = new ExcelJS.Workbook();
    for (const sheetName of Object.keys(prepared)) {
      const ws = wb.addWorksheet(sheetName.slice(0, 31));
      ws.columns = [
        { header: '資產類型', key: 'assetType', width: 12 },
        { header: '分類', key: 'cat', width: 14 },
        { header: '資產編號', key: 'id', width: 14 },
        { header: '品項名稱', key: 'name', width: 24 },
        { header: '數量', key: 'qty', width: 8 },
        { header: '位置備註', key: 'loc', width: 16 },
        { header: 'QR Code', key: 'qr', width: 16 },
      ];
      for (const item of prepared[sheetName]) {
        const r = item.row;
        const excelRow = ws.addRow({ assetType: r['資產類型'], cat: r['分類'], id: r['資產編號'], name: r['品項名稱'], qty: r['數量'], loc: r['位置備註'] });
        const rowNum = excelRow.number;
        ws.getRow(rowNum).height = 60;
        const imgId = wb.addImage({ base64: item.dataUrl.split(',')[1], extension: 'png' });
        ws.addImage(imgId, { tl: { col: 6, row: rowNum - 1 }, ext: { width: 54, height: 54 } });
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const ts = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `設備總表_${ts}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('設備總表已下載，所有 QR Code 圖片皆已成功嵌入', 'success');
  } catch (e) {
    toast('產生設備總表失敗：' + e.message, 'error');
  }
}

// ================= QR 掃碼登記流程（免登入，手機優先，購物車模式） =================
// 兩種入口都共用同一個購物車：
//   1) 通用入口 #/qr：先選類型與品項，選數量後「加入清單」，可連續加入多筆
//   2) 品項專屬入口 #/qi/fixed|cons/編號：品項已經固定，選數量後「加入清單」，可以連續掃下一個品項的 QR
// 全部加完之後，到清單頁一次送出；固定資產需要選經辦人，銷耗資產不需要（只記錄數量與時間）。
const QR_CART_KEY = 'ems_qr_cart';
function qrCartLoad() {
  try { const c = JSON.parse(localStorage.getItem(QR_CART_KEY) || 'null'); return (c && Array.isArray(c.entries)) ? c : { entries: [] }; }
  catch (e) { return { entries: [] }; }
}
function qrCartSave(cart) { localStorage.setItem(QR_CART_KEY, JSON.stringify(cart)); }
function qrCartClear() { localStorage.removeItem(QR_CART_KEY); }
function qrCartAdd(entry) { const c = qrCartLoad(); c.entries.push(entry); qrCartSave(c); return c; }

// QR 入口不需要登入，直接匿名呼叫後端（doPost 對 qrInit/qrSubmit 白名單放行，無需 session）
async function anonQrInit() {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'qrInit', token: 'anonymous', payload: {} }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}
async function anonCall(action, payload) {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: 'anonymous', payload }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j;
}

function qrPageShell(title) {
  const cart = qrCartLoad();
  document.body.innerHTML = `<div class="qr-page"><div class="qr-container" id="qrRoot">
    <div style="text-align:center;margin:14px 0 16px"><div class="login-mark" style="margin:0 auto 8px">EM</div><div style="font-weight:700">${esc(title)}</div></div>
    ${cart.entries.length ? `<a href="#/qr-cart" style="text-decoration:none"><div class="qr-entry" style="margin-bottom:14px;justify-content:center"><div>🛒 清單目前有 <b>${cart.entries.length}</b> 項，點此查看／送出</div></div></a>` : ''}
    <div class="qr-step" id="qrStepArea"><div class="empty">載入中...</div></div>
  </div></div>`;
}
function qrSetStep(html) { const el = document.getElementById('qrStepArea'); if (el) el.innerHTML = html; }

// ---------- 入口 1：通用 QR（先選類型與品項） ----------
async function viewQr() {
  qrPageShell('掃碼登記');
  let init;
  try { init = await anonQrInit(); } catch (e) { qrSetStep(`<div class="empty">${esc(e.message)}</div>`); return; }
  qrSetStep(`
    <h3 style="margin-top:0">請選擇要登記的類型</h3>
    <div class="pill-choice">
      <button class="btn btn-primary" id="fixedBtn">📦 固定資產（借還）</button>
      <button class="btn btn-ghost" id="consBtn">🧯 銷耗資產（補充／出庫）</button>
    </div>
    <p style="color:var(--muted);font-size:12.5px;margin-top:14px">可以連續加入多個品項，最後再一次送出。</p>`);
  $('#fixedBtn').addEventListener('click', () => openQrItemPicker('fixed', init));
  $('#consBtn').addEventListener('click', () => openQrItemPicker('cons', init));
}

function openQrItemPicker(type, init) {
  const list = type === 'fixed' ? init.fixed : init.cons;
  const options = list.map(x => ({ value: x.id, label: x.name }));
  openModal(`
    <h3>${type === 'fixed' ? '新增固定資產登記' : '新增銷耗資產登記'}</h3>
    <div class="field"><label>設備項目</label>${searchableSelectHtml('qp_item', '輸入搜尋，找不到就直接打新名稱新增')}</div>
    ${type === 'fixed' ? `
      <div class="field"><label>動作</label><select id="qp_action"><option value="借出">借出</option><option value="歸還">歸還</option></select></div>
      <div class="field"><label>數量</label><input id="qp_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label id="qp_dateLabel">預計歸還日期</label><input id="qp_date" type="date"/></div>
      <div class="field"><label>備註（租借原因等）</label><input id="qp_note"/></div>`
      : `
      <div class="field"><label>動作</label><select id="qp_action"><option value="出庫">出庫（領用）</option><option value="補充">補充（入庫）</option></select></div>
      <div class="field"><label>數量</label><input id="qp_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label>備註</label><input id="qp_note"/></div>`}
    <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="addBtn">加入清單</button></div>`);
  const itemCtrl = initSearchableSelect('qp_item', options);
  if (type === 'fixed') {
    $('#qp_action').addEventListener('change', () => { $('#qp_dateLabel').textContent = $('#qp_action').value === '借出' ? '預計歸還日期' : '實際歸還日期'; });
  }
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#addBtn').addEventListener('click', () => {
    const id = itemCtrl.getValue();
    const typedText = itemCtrl.getText();
    const isNew = !id;
    if (!typedText) { toast('請輸入或選擇設備項目', 'error'); return; }
    const entry = {
      type, id: isNew ? null : id, isNew, newName: isNew ? typedText : '', name: typedText,
      action: $('#qp_action').value, qty: Number($('#qp_qty').value || 1),
      date: type === 'fixed' ? $('#qp_date').value : '',
      note: $('#qp_note').value.trim(),
    };
    qrCartAdd(entry);
    closeModal(); toast('已加入清單', 'success');
    viewQr();
  });
}

// ---------- 入口 2：品項專屬 QR（品項已固定，只需選數量／動作） ----------
async function viewQrItem(type, id) {
  qrPageShell('設備登記');
  let init;
  try { init = await anonQrInit(); } catch (e) { qrSetStep(`<div class="empty">${esc(e.message)}</div>`); return; }
  const list = type === 'fixed' ? init.fixed : init.cons;
  const item = list.find(x => x.id === id);
  if (!item) { qrSetStep(`<div class="empty">找不到此品項，QR Code 可能已失效，請聯絡管理員</div>`); return; }
  qrSetStep(`
    <div class="qr-entry" style="margin-bottom:14px"><div>${type === 'fixed' ? '📦' : '🧯'} <b>${esc(item.name)}</b><div class="meta">${esc(item.category || '')}　${esc(item.id)}</div></div></div>
    ${type === 'fixed' ? `
      <div class="field"><label>動作</label><select id="qi_action"><option value="借出">借出</option><option value="歸還">歸還</option></select></div>
      <div class="field"><label>數量</label><input id="qi_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label id="qi_dateLabel">預計歸還日期</label><input id="qi_date" type="date"/></div>
      <div class="field"><label>備註（租借原因等）</label><input id="qi_note"/></div>`
      : `
      <div class="field"><label>動作</label><select id="qi_action"><option value="出庫">出庫（領用）</option><option value="補充">補充（入庫）</option></select></div>
      <div class="field"><label>數量</label><input id="qi_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label>備註</label><input id="qi_note"/></div>`}
    <button class="btn btn-primary btn-block" id="addBtn" style="margin-top:6px">加入清單</button>
    <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:10px">加入後可以繼續掃下一個品項的 QR Code，全部掃完再一次送出</p>`);
  if (type === 'fixed') {
    $('#qi_action').addEventListener('change', () => { $('#qi_dateLabel').textContent = $('#qi_action').value === '借出' ? '預計歸還日期' : '實際歸還日期'; });
  }
  $('#addBtn').addEventListener('click', () => {
    const entry = {
      type, id: item.id, isNew: false, name: item.name,
      action: $('#qi_action').value, qty: Number($('#qi_qty').value || 1),
      date: type === 'fixed' ? $('#qi_date').value : '',
      note: $('#qi_note').value.trim(),
    };
    qrCartAdd(entry);
    const count = qrCartLoad().entries.length;
    qrSetStep(`
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:36px;margin-bottom:8px">✅</div>
        <h3>已加入清單</h3>
        <p style="color:var(--muted)">請繼續掃描下一個品項的 QR Code，或點下方查看清單並送出。</p>
        <a href="#/qr-cart" class="btn btn-primary btn-block" style="text-decoration:none;display:block;margin-top:14px">查看清單並送出（${count} 項）</a>
      </div>`);
  });
}

// ---------- 清單確認與送出 ----------
async function viewQrCart() {
  qrPageShell('確認清單');
  renderQrCart();
}

function renderQrCart() {
  const cart = qrCartLoad();
  const hasFixed = cart.entries.some(e => e.type === 'fixed');
  qrSetStep(`
    <div id="qrCartList">${cart.entries.length ? cart.entries.map((e, i) => `
      <div class="qr-entry"><div>
        ${e.type === 'fixed' ? '📦' : '🧯'} <b>${esc(e.isNew ? e.newName : e.name)}</b>
        　${esc(e.action)}　數量：${esc(e.qty)}${e.date ? '　' + esc(e.date) : ''}
      </div><button class="btn btn-danger btn-sm" data-i="${i}">移除</button></div>`).join('')
      : `<div class="empty">清單是空的，請先掃描品項 QR Code，或從掃碼入口新增</div>`}</div>
    ${hasFixed ? `<div style="margin-top:14px"><h3 style="margin:0 0 10px">固定資產需要選擇經辦人</h3>${unitPersonFieldsHtml('qc', '單位', '姓名')}</div>` : ''}
    <div class="modal-actions" style="justify-content:space-between;margin-top:16px">
      <button class="btn btn-ghost btn-sm" id="clearBtn">清空清單</button>
      <button class="btn btn-primary" id="submitBtn" ${cart.entries.length ? '' : 'disabled'}>確認送出</button>
    </div>`);
  document.querySelectorAll('#qrCartList [data-i]').forEach(b => b.addEventListener('click', () => {
    const c = qrCartLoad(); c.entries.splice(Number(b.dataset.i), 1); qrCartSave(c); renderQrCart();
  }));
  $('#clearBtn').addEventListener('click', () => { if (confirm('確定要清空整個清單嗎？')) { qrCartClear(); renderQrCart(); } });

  let personCtrl = null;
  if (hasFixed) {
    anonQrInit().then(init => { const w = wireUnitPersonFieldsQR('qc', init.staff || []); personCtrl = w.personCtrl; }).catch(() => {});
  }
  $('#submitBtn').addEventListener('click', async () => {
    if (!cart.entries.length) return;
    const person = hasFixed ? (personCtrl ? personCtrl.getValue() : '') : '';
    if (hasFixed && !person) { toast('請先選單位，再從清單點選經辦人姓名', 'error'); return; }
    $('#submitBtn').disabled = true; $('#submitBtn').textContent = '送出中...';
    try {
      await anonCall('qrSubmit', { person, entries: cart.entries });
      qrCartClear();
      qrSetStep(`<div style="text-align:center;padding:20px 0">
        <div style="font-size:40px;margin-bottom:10px">✅</div>
        <h3>登記完成！</h3>
        <p style="color:var(--muted)">資料已同步更新，感謝你的登記。</p>
        <a href="#/qr" class="btn btn-primary btn-block" style="text-decoration:none;display:block;margin-top:14px">再次掃碼登記</a>
      </div>`);
    } catch (e) {
      toast(e.message, 'error');
      $('#submitBtn').disabled = false; $('#submitBtn').textContent = '確認送出';
    }
  });
}

// ================= 路由 =================
async function router() {
  const hash = location.hash || '#/dashboard';

  if (hash.startsWith('#/qi/')) {
    const parts = hash.replace('#/qi/', '').split('/');
    await viewQrItem(parts[0], decodeURIComponent(parts[1] || ''));
    return;
  }
  if (hash === '#/qr-cart') { await viewQrCart(); return; }
  if (hash.startsWith('#/qr')) { await viewQr(); return; }

  if (hash === '#/login' || !Api.token()) {
    if (hash !== '#/login' ) location.hash = '#/login';
    renderLogin();
    return;
  }

  // 已登入 -> 確保 shell 存在
  if (!document.querySelector('.app')) renderShell();

  const parts = hash.replace('#/', '').split('/');
  const page = parts[0];
  try {
    if (page === 'dashboard') await viewDashboard();
    else if (page === 'fixed' && parts[1]) await viewFixedDetail(decodeURIComponent(parts[1]));
    else if (page === 'fixed') await viewFixedList();
    else if (page === 'cons' && parts[1]) await viewConsDetail(decodeURIComponent(parts[1]));
    else if (page === 'cons') await viewConsList();
    else if (page === 'staff') await viewStaff();
    else if (page === 'settings') await viewSettings();
    else if (page === 'reports') viewReports();
    else await viewDashboard();
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', hash.startsWith(a.getAttribute('href'))));
  } catch (e) { /* 已由 guard() 處理 */ }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
