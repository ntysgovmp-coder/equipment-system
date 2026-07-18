const Api = (function () {
  function token() { return localStorage.getItem('ems_token') || ''; }

  async function call(action, payload) {
    // 用 text/plain 避免瀏覽器對 Apps Script 發送 CORS 預檢請求 (Apps Script 不支援 OPTIONS)
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: token(), payload: payload || {} }),
    });
    if (!res.ok) throw new Error('伺服器連線失敗 (HTTP ' + res.status + ')');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '發生未知錯誤');
    return json;
  }

  return {
    login: (account, password) => call('login', { account, password }),
    logout: () => call('logout', {}),
    dashboard: () => call('dashboard', {}),

    listFixedAssets: () => call('listFixedAssets', {}),
    addFixedAsset: (data) => call('addFixedAsset', data),
    updateFixedAsset: (data) => call('updateFixedAsset', data),
    deleteFixedAsset: (id) => call('deleteFixedAsset', { id }),
    fixedAssetDetail: (id) => call('fixedAssetDetail', { id }),
    fixedAssetAction: (data) => call('fixedAssetAction', data),

    listConsumables: () => call('listConsumables', {}),
    addConsumable: (data) => call('addConsumable', data),
    updateConsumable: (data) => call('updateConsumable', data),
    deleteConsumable: (id) => call('deleteConsumable', { id }),
    consumableDetail: (id) => call('consumableDetail', { id }),
    consumableAction: (data) => call('consumableAction', data),

    listStaff: () => call('listStaff', {}),
    addStaff: (data) => call('addStaff', data),
    updateStaff: (data) => call('updateStaff', data),
    deleteStaff: (id) => call('deleteStaff', { id }),

    getSettings: () => call('getSettings', {}),
    updateSettings: (data) => call('updateSettings', data),

    qrInit: () => call('qrInit', {}),
    qrSubmit: (data) => call('qrSubmit', data),

    report: (type) => call('report', { type }),
    backupNow: () => call('backupNow', {}),
    listBackups: () => call('listBackups', {}),

    setToken(t) { localStorage.setItem('ems_token', t); },
    clearToken() { localStorage.removeItem('ems_token'); },
    token,
  };
})();
