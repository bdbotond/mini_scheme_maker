/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Settings: Theme, mouse sensitivity, keyboard rebinding, persistence
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.Settings = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    orbitSpeed: 1.0,
    panSpeed: 1.0,
    zoomSpeed: 1.0,
    keys: { brush: 'p', box: 'b', radius: 'r', subsplit: 's' }
  };

  let appSettings = typeof structuredClone === 'function'
    ? structuredClone(DEFAULT_SETTINGS)
    : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  function loadSettings() {
    try {
      const stored = localStorage.getItem('mini_seg_settings');
      if (stored) appSettings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(stored));
    } catch (e) {}
    applySettings();
  }

  function applySettings() {
    document.body.classList.toggle('light-theme', appSettings.theme === 'light');
    const db = document.getElementById('theme-btn-dark');
    const lb = document.getElementById('theme-btn-light');
    if (db) db.classList.toggle('active', appSettings.theme === 'dark');
    if (lb) lb.classList.toggle('active', appSettings.theme === 'light');

    controls.rotateSpeed = appSettings.orbitSpeed;
    controls.panSpeed = appSettings.panSpeed;
    controls.zoomSpeed = appSettings.zoomSpeed;

    const so = document.getElementById('setting-orbit');
    const sp = document.getElementById('setting-pan');
    const sz = document.getElementById('setting-zoom');
    if (so) { so.value = appSettings.orbitSpeed; const sov = document.getElementById('setting-orbit-val'); if (sov) sov.textContent = appSettings.orbitSpeed.toFixed(1); }
    if (sp) { sp.value = appSettings.panSpeed; const spv = document.getElementById('setting-pan-val'); if (spv) spv.textContent = appSettings.panSpeed.toFixed(1); }
    if (sz) { sz.value = appSettings.zoomSpeed; const szv = document.getElementById('setting-zoom-val'); if (szv) szv.textContent = appSettings.zoomSpeed.toFixed(1); }

    ['brush', 'box', 'radius', 'subsplit'].forEach(t => {
      const btn = document.getElementById(`kb-${t}`);
      if (btn) btn.textContent = appSettings.keys[t].toUpperCase();
    });
  }

  function saveSettings() {
    localStorage.setItem('mini_seg_settings', JSON.stringify(appSettings));
    closeSettings();
  }

  function resetSettings() {
    appSettings = typeof structuredClone === 'function'
      ? structuredClone(DEFAULT_SETTINGS)
      : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    applySettings();
    saveSettings();
  }

  function updateSettingVal(type) {
    if (type === 'orbit') {
      appSettings.orbitSpeed = parseFloat(document.getElementById('setting-orbit').value);
      const v = document.getElementById('setting-orbit-val');
      if (v) v.textContent = appSettings.orbitSpeed.toFixed(1);
      controls.rotateSpeed = appSettings.orbitSpeed;
    } else if (type === 'pan') {
      appSettings.panSpeed = parseFloat(document.getElementById('setting-pan').value);
      const v = document.getElementById('setting-pan-val');
      if (v) v.textContent = appSettings.panSpeed.toFixed(1);
      controls.panSpeed = appSettings.panSpeed;
    } else if (type === 'zoom') {
      appSettings.zoomSpeed = parseFloat(document.getElementById('setting-zoom').value);
      const v = document.getElementById('setting-zoom-val');
      if (v) v.textContent = appSettings.zoomSpeed.toFixed(1);
      controls.zoomSpeed = appSettings.zoomSpeed;
    }
  }

  function setTheme(t) {
    appSettings.theme = t;
    applySettings();
  }

  function openSettings() {
    const m = document.getElementById('settings-modal');
    if (m) m.classList.add('open');
    applySettings();
  }

  function closeSettings() {
    const m = document.getElementById('settings-modal');
    if (m) m.classList.remove('open');
  }

  let rebindTarget = null;
  function startRebind(tool) {
    rebindTarget = tool;
    const btn = document.getElementById(`kb-${tool}`);
    document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
    if (btn) { btn.classList.add('listening'); btn.textContent = '…'; }
  }

  window.addEventListener('keydown', function handleRebind(e) {
    if (!rebindTarget) return;
    if (e.key === 'Escape') {
      rebindTarget = null;
      document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
      applySettings();
      return;
    }
    const key = e.key.toLowerCase();
    if (key.length !== 1) return;
    appSettings.keys[rebindTarget] = key;
    rebindTarget = null;
    document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
    applySettings();
    e.preventDefault();
    e.stopPropagation();
  }, true);

  return {
    get appSettings() { return appSettings; },
    loadSettings,
    applySettings,
    saveSettings,
    resetSettings,
    updateSettingVal,
    setTheme,
    openSettings,
    closeSettings,
    startRebind
  };
});
