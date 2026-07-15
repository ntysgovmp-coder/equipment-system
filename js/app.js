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
    return `<table><thead><tr><th>編號</th><th>品項名稱</th><th>總數量</th><th>可借數量</th><th>位置</th><th>狀態</th></tr></thead>
      <tbody>${list.map(f => `<tr data-id="${esc(f['資產編號'])}">
        <td>${esc(f['資產編號'])}</td><td>${esc(f['品項名稱'])}</td><td>${esc(f['總數量'])}</td>
        <td>${esc(f['目前可借數量'])}</td><td>${esc(f['位置備註'])}</td><td>${statusBadge(f['目前狀態'])}</td></tr>`).join('')}</tbody></table>`;
  }
  draw(data);
  $('#q').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    draw(data.filter(f => Object.values(f).join(' ').toLowerCase().includes(q)));
  });
  $('#addBtn').addEventListener('click', () => openFixedForm());
}

function openFixedForm(existing) {
  const isEdit = !!existing;
  openModal(`
    <h3>${isEdit ? '編輯固定資產' : '新增固定資產'}</h3>
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
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const payload = { name: $('#f_name').value.trim(), total: Number($('#f_total').value), available: Number($('#f_avail').value), location: $('#f_loc').value.trim(), status: $('#f_status').value };
    if (!payload.name) { toast('請輸入品項名稱', 'error'); return; }
    try {
      if (isEdit) { payload.id = existing['資產編號']; await Api.updateFixedAsset(payload); }
      else { await Api.addFixedAsset(payload); }
      closeModal(); toast('已儲存', 'success'); viewFixedList();
    } catch (e) { toast(e.message, 'error'); }
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
        <h3 style="margin:0">${esc(a['品項名稱'])} <span style="color:var(--muted);font-weight:400;font-size:13px">（${esc(a['資產編號'])}）</span></h3>
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
}

function openFixedActionForm(asset, action) {
  const needsQty = action === '採購';
  const needsDate = action === '借出' || action === '歸還';
  openModal(`
    <h3>${action}：${esc(asset['品項名稱'])}</h3>
    <div class="field"><label>經辦人 / 借用人</label><input id="a_person" placeholder="姓名"/></div>
    ${needsQty ? `<div class="field"><label>數量</label><input id="a_qty" type="number" min="1" value="1"/></div>` : ''}
    ${needsDate ? `<div class="field"><label>${action === '借出' ? '預計歸還日期' : '實際歸還日期'}</label><input id="a_date" type="date"/></div>` : ''}
    <div class="field"><label>備註</label><input id="a_note" placeholder="租借原因等"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">取消</button>
      <button class="btn btn-primary" id="okBtn">確認</button>
    </div>`);
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#okBtn').addEventListener('click', async () => {
    const payload = { id: asset['資產編號'], action, qty: needsQty ? Number($('#a_qty').value) : 1, person: $('#a_person').value.trim(), note: $('#a_note').value.trim() };
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
    $('#tableWrap').innerHTML = list.length ? `<table><thead><tr><th>編號</th><th>品項名稱</th><th>剩餘數量</th><th>安全值</th><th>位置</th><th>狀態</th></tr></thead>
      <tbody>${list.map(c => {
        const low = Number(c['目前剩餘數量']) <= Number(c['警告安全數量']);
        return `<tr data-id="${esc(c['資產編號'])}"><td>${esc(c['資產編號'])}</td><td>${esc(c['品項名稱'])}</td><td>${esc(c['目前剩餘數量'])}</td><td>${esc(c['警告安全數量'])}</td><td>${esc(c['位置備註'])}</td><td>${low ? '<span class="badge danger">庫存不足</span>' : '<span class="badge ok">正常</span>'}</td></tr>`;
      }).join('')}</tbody></table>` : `<div class="empty">尚無資料，點選右上角新增</div>`;
    $('#tableWrap').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { location.hash = '#/cons/' + encodeURIComponent(tr.dataset.id); }));
  }
  draw(data);
  $('#q').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); draw(data.filter(c => Object.values(c).join(' ').toLowerCase().includes(q))); });
  $('#addBtn').addEventListener('click', () => openConsForm());
}

function openConsForm(existing) {
  const isEdit = !!existing;
  openModal(`
    <h3>${isEdit ? '編輯銷耗資產' : '新增銷耗資產'}</h3>
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
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const payload = { name: $('#c_name').value.trim(), qty: Number($('#c_qty').value), warnQty: Number($('#c_warn').value), location: $('#c_loc').value.trim() };
    if (!payload.name) { toast('請輸入品項名稱', 'error'); return; }
    try {
      if (isEdit) { payload.id = existing['資產編號']; await Api.updateConsumable(payload); }
      else { await Api.addConsumable(payload); }
      closeModal(); toast('已儲存', 'success'); viewConsList();
    } catch (e) { toast(e.message, 'error'); }
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
        <h3 style="margin:0">${esc(item['品項名稱'])} <span style="color:var(--muted);font-weight:400;font-size:13px">（${esc(item['資產編號'])}）</span></h3>
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
      <h3>補充／出庫紀錄</h3>
      ${logs.length ? logs.map(l => `<div class="log-item"><div><b>${esc(l['動作'])}</b>　${esc(l['經辦人'])}　數量：${esc(l['異動數量'])}　${esc(l['備註'] || '')}
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
      <div class="field"><label>經辦人</label><input id="a_person"/></div>
      <div class="field"><label>數量</label><input id="a_qty" type="number" min="1" value="1"/></div>
      <div class="field"><label>備註</label><input id="a_note"/></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="okBtn">確認</button></div>`);
    $('#cancelBtn').addEventListener('click', closeModal);
    $('#okBtn').addEventListener('click', async () => {
      try {
        await Api.consumableAction({ id: item['資產編號'], action: btn.dataset.act, qty: Number($('#a_qty').value), person: $('#a_person').value.trim(), note: $('#a_note').value.trim() });
        closeModal(); toast('已登記', 'success'); viewConsDetail(item['資產編號']);
      } catch (e) { toast(e.message, 'error'); }
    });
  }));
}

// ================= 人員設定 =================
async function viewStaff() {
  setTitle('人員設定', '管理人員列表與所屬單位');
  $('#content').innerHTML = `<div class="empty">載入中...</div>`;
  const res = await guard(Api.listStaff());
  const data = res.data;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="toolbar"><div></div><button class="btn btn-primary" id="addBtn">+ 新增人員</button></div>
      ${data.length ? `<table><thead><tr><th>單位</th><th>員工姓名</th><th>狀態</th><th></th></tr></thead>
        <tbody>${data.map(s => `<tr><td>${esc(s['單位'])}</td><td>${esc(s['員工姓名'])}</td><td>${s['狀態'] === '在職' ? '<span class="badge ok">在職</span>' : '<span class="badge neutral">離職</span>'}</td>
          <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(s['員工姓名'])}">編輯</button><button class="btn btn-danger btn-sm" data-del="${esc(s['員工姓名'])}">刪除</button></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">尚無人員資料</div>`}
    </div>`;
  $('#addBtn').addEventListener('click', () => openStaffForm());
  $('#content').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openStaffForm(data.find(s => s['員工姓名'] === b.dataset.edit))));
  $('#content').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('確定要刪除此人員嗎？')) return;
    await guard(Api.deleteStaff(b.dataset.del)); toast('已刪除', 'success'); viewStaff();
  }));
}

function openStaffForm(existing) {
  openModal(`
    <h3>${existing ? '編輯人員' : '新增人員'}</h3>
    <div class="field"><label>單位</label><input id="s_unit" value="${esc(existing ? existing['單位'] : '')}"/></div>
    <div class="field"><label>員工姓名</label><input id="s_name" value="${esc(existing ? existing['員工姓名'] : '')}"/></div>
    <div class="field"><label>狀態</label><select id="s_status"><option ${!existing || existing['狀態'] === '在職' ? 'selected' : ''}>在職</option><option ${existing && existing['狀態'] === '離職' ? 'selected' : ''}>離職</option></select></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="saveBtn">儲存</button></div>`);
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const unit = $('#s_unit').value.trim(), name = $('#s_name').value.trim(), status = $('#s_status').value;
    if (!name) { toast('請輸入姓名', 'error'); return; }
    try {
      if (existing) await Api.updateStaff({ oldName: existing['員工姓名'], unit, name, status });
      else await Api.addStaff({ unit, name, status });
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
      <h3>📷 QR Code 掃碼登記入口</h3>
      <p style="color:var(--muted);font-size:12.5px">列印以下 QR Code 貼在倉庫，同仁用手機掃描即可登記固定資產租借歸還／銷耗資產領用，不需要登入帳號。</p>
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
];

function viewReports() {
  setTitle('報表下載', '匯出 Excel 報表');
  $('#content').innerHTML = `
    <div class="panel" style="max-width:520px">
      <h3>選擇要下載的報表</h3>
      ${REPORT_TYPES.map(r => `<div class="log-item"><div>${r.label}</div><button class="btn btn-primary btn-sm" data-type="${r.key}">下載 Excel</button></div>`).join('')}
    </div>`;
  $('#content').querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => downloadReport(btn.dataset.type)));
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

// ================= QR 掃碼登記流程（免登入，手機優先） =================
let qrState = { person: null, entries: [], init: null };

async function viewQr() {
  document.body.innerHTML = `<div class="qr-page"><div class="qr-container" id="qrRoot"></div></div>`;
  qrState = { person: null, entries: [], init: null };
  try { qrState.init = (await Api.qrInit()).data; }
  catch (e) {
    // 未登入時 API 需要 token；為了讓 QR 免登入使用，改走匿名 fetch
    qrState.init = await anonQrInit();
  }
  qrStepPerson();
}

// QR 入口不需要登入，直接匿名呼叫後端（doPost 對 qrInit/qrSubmit 也允許無 session, 由後端邏輯決定）
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

function qrShell(stepIdx, innerHtml) {
  $('#qrRoot').innerHTML = `
    <div style="text-align:center;margin:14px 0 20px"><div class="login-mark" style="margin:0 auto 8px">EM</div><div style="font-weight:700">設備借還／領用登記</div></div>
    <div class="progress-dots">${[0, 1, 2].map(i => `<span class="${i === stepIdx ? 'active' : ''}"></span>`).join('')}</div>
    <div class="qr-step">${innerHtml}</div>`;
}

function qrStepPerson() {
  const staff = qrState.init.staff || [];
  qrShell(0, `
    <h3 style="margin-top:0">請選擇你的姓名</h3>
    <div class="field"><select id="personSel" style="width:100%"><option value="">-- 請選擇 --</option>${staff.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
    <button class="btn btn-primary btn-block" id="nextBtn">下一步</button>`);
  $('#nextBtn').addEventListener('click', () => {
    const v = $('#personSel').value;
    if (!v) { toast('請選擇姓名', 'error'); return; }
    qrState.person = v;
    qrStepType();
  });
}

function qrStepType() {
  qrShell(1, `
    <h3 style="margin-top:0">${esc(qrState.person)}，你好！請選擇要登記的類型</h3>
    <div class="pill-choice">
      <button class="btn btn-primary" id="fixedBtn">固定資產（借還）</button>
      <button class="btn btn-ghost" id="consBtn">銷耗資產（領用）</button>
    </div>
    <div id="entryList" style="margin-top:16px"></div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn btn-ghost btn-sm" id="backBtn">上一步</button>
      <button class="btn btn-primary" id="submitBtn">完成並送出</button>
    </div>`);
  renderEntryList();
  $('#backBtn').addEventListener('click', qrStepPerson);
  $('#fixedBtn').addEventListener('click', () => openQrEntryForm('fixed'));
  $('#consBtn').addEventListener('click', () => openQrEntryForm('cons'));
  $('#submitBtn').addEventListener('click', submitQr);
}

function renderEntryList() {
  const el = $('#entryList');
  if (!el) return;
  el.innerHTML = qrState.entries.length ? qrState.entries.map((e, i) => `
    <div class="qr-entry"><div>
        ${e.type === 'fixed' ? '📦' : '🧯'} <b>${esc(e.isNew ? e.newName : nameOf(e))}</b>
        ${e.type === 'fixed' ? `　${esc(e.action)}${e.date ? '　' + esc(e.date) : ''}` : `　數量：${esc(e.qty)}`}
      </div><button class="btn btn-danger btn-sm" data-i="${i}">移除</button></div>`).join('')
    : `<div class="empty">尚未加入任何項目</div>`;
  el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { qrState.entries.splice(Number(b.dataset.i), 1); renderEntryList(); }));
}
function nameOf(e) {
  const list = e.type === 'fixed' ? qrState.init.fixed : qrState.init.cons;
  const f = list.find(x => x.id === e.id);
  return f ? f.name : e.id;
}

function openQrEntryForm(type) {
  const list = type === 'fixed' ? qrState.init.fixed : qrState.init.cons;
  openModal(`
    <h3>${type === 'fixed' ? '新增固定資產登記' : '新增銷耗資產登記'}</h3>
    <div class="field"><label>設備項目</label>
      <select id="itemSel"><option value="__new__">+ 新增品項...</option>${list.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
    </div>
    <div class="field hidden" id="newNameField"><label>新品項名稱</label><input id="newName"/></div>
    ${type === 'fixed' ? `
      <div class="field"><label>動作</label><select id="actionSel"><option value="借出">借出</option><option value="歸還">歸還</option></select></div>
      <div class="field"><label id="dateLabel">預計歸還日期</label><input id="dateInput" type="date"/></div>
      <div class="field"><label>備註（租借原因等）</label><input id="noteInput"/></div>`
      : `<div class="field"><label>取出數量</label><input id="qtyInput" type="number" min="1" value="1"/></div>`}
    <div class="modal-actions"><button class="btn btn-ghost" id="cancelBtn">取消</button><button class="btn btn-primary" id="addBtn">加入清單</button></div>`);
  $('#itemSel').addEventListener('change', () => $('#newNameField').classList.toggle('hidden', $('#itemSel').value !== '__new__'));
  if (type === 'fixed') {
    $('#actionSel').addEventListener('change', () => { $('#dateLabel').textContent = $('#actionSel').value === '借出' ? '預計歸還日期' : '實際歸還日期'; });
  }
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#addBtn').addEventListener('click', () => {
    const sel = $('#itemSel').value;
    const isNew = sel === '__new__';
    const newName = isNew ? $('#newName').value.trim() : '';
    if (isNew && !newName) { toast('請輸入新品項名稱', 'error'); return; }
    if (type === 'fixed') {
      qrState.entries.push({ type: 'fixed', id: isNew ? null : sel, isNew, newName, action: $('#actionSel').value, date: $('#dateInput').value, note: $('#noteInput').value.trim() });
    } else {
      const qty = Number($('#qtyInput').value || 1);
      qrState.entries.push({ type: 'cons', id: isNew ? null : sel, isNew, newName, qty });
    }
    closeModal(); renderEntryList();
  });
}

async function submitQr() {
  if (!qrState.entries.length) { toast('請至少加入一項登記', 'error'); return; }
  qrShell(2, `<div class="empty">送出中，請稍候...</div>`);
  try {
    await anonCall('qrSubmit', { person: qrState.person, entries: qrState.entries });
    qrShell(2, `<div style="text-align:center;padding:20px 0">
      <div style="font-size:40px;margin-bottom:10px">✅</div>
      <h3>登記完成！</h3>
      <p style="color:var(--muted)">感謝 ${esc(qrState.person)} 的登記，資料已同步更新。</p>
      <button class="btn btn-primary btn-block" id="againBtn">再登記一筆</button>
    </div>`);
    $('#againBtn').addEventListener('click', viewQr);
  } catch (e) {
    toast(e.message, 'error');
    qrStepType();
  }
}

// ================= 路由 =================
async function router() {
  const hash = location.hash || '#/dashboard';

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
