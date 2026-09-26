/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Color Recommender: Color-wheel picker + harmony-based suggestions for 3-color paint schemes
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.ColorRecommender = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const WHEEL_SIZE = 200;

  // State
  let _colors     = [null, null, null];
  let _activeSlot = 0;
  let _lightness  = 0.55;
  let _canvas     = null;
  let _ctx        = null;
  let _dragging   = false;

  // ── Color math ──────────────────────────────────────────────────────────────

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
    return [h * 360, s, l];
  }

  function hexToHsl(hex) {
    hex = (hex || '#808080').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const n = parseInt(hex, 16) || 0;
    return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  function hslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(
      ((h % 360) + 360) % 360,
      Math.max(0, Math.min(1, s)),
      Math.max(0, Math.min(1, l))
    );
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function contrastFor(hex) {
    const [, , l] = hexToHsl(hex);
    return l > 0.55 ? '#111' : '#fff';
  }

  // ── Harmony recommendations ──────────────────────────────────────────────────

  function getRecommendations() {
    const prior = _colors.slice(0, _activeSlot).filter(Boolean);
    if (prior.length === 0) return [];

    const [h1, s1, l1] = hexToHsl(prior[0]);
    const sat = Math.max(0.55, s1);
    const lit = (l1 > 0.15 && l1 < 0.88) ? l1 : 0.55;

    if (prior.length === 1) {
      return dedup([
        { hex: hslToHex((h1+180)%360,      sat,      lit),      label: 'Complementary' },
        { hex: hslToHex((h1+120)%360,      sat,      lit),      label: 'Triadic ▲' },
        { hex: hslToHex((h1+240)%360,      sat,      lit),      label: 'Triadic ▼' },
        { hex: hslToHex((h1+150)%360,      sat*0.9,  lit+0.04), label: 'Split-Comp ▲' },
        { hex: hslToHex((h1+210)%360,      sat*0.9,  lit+0.04), label: 'Split-Comp ▼' },
        { hex: hslToHex((h1+30) %360,      sat*0.8,  lit+0.05), label: 'Analogous ▲' },
        { hex: hslToHex((h1-30+360)%360,   sat*0.8,  lit+0.05), label: 'Analogous ▼' },
        { hex: hslToHex((h1+90) %360,      sat,      lit),      label: 'Square ▲' },
        { hex: hslToHex((h1+270)%360,      sat,      lit),      label: 'Square ▼' },
      ]);
    }

    const [h2, s2, l2] = hexToHsl(prior[1]);
    const avgS = Math.max(0.5, (s1+s2)/2);
    const avgL = ((l1+l2)/2 > 0.15 && (l1+l2)/2 < 0.88) ? (l1+l2)/2 : 0.55;
    const diff = (h2 - h1 + 360) % 360;
    const gap  = 360 - diff;

    return dedup([
      { hex: hslToHex((h1+240)%360,   avgS,  avgL),  label: 'Triadic' },
      { hex: hslToHex((h2+120)%360,   avgS,  avgL),  label: 'Triadic' },
      { hex: hslToHex((h2+gap/2)%360, avgS,  avgL),  label: 'Balance' },
      { hex: hslToHex((h1+180)%360,   avgS,  avgL),  label: 'Compl. 1' },
      { hex: hslToHex((h2+180)%360,   avgS,  avgL),  label: 'Compl. 2' },
      { hex: hslToHex((h1+h2)/2,      0.18,  0.75),  label: 'Neutral' },
      { hex: hslToHex((h1+h2)/2,      0.20,  0.20),  label: 'Shadow' },
    ]);
  }

  function dedup(recs) {
    const out = [];
    for (const r of recs) {
      const [rh] = hexToHsl(r.hex);
      if (!out.some(u => {
        const [uh] = hexToHsl(u.hex);
        return Math.abs(((rh - uh + 180 + 360) % 360) - 180) < 14;
      })) out.push(r);
    }
    return out;
  }

  // ── Canvas wheel ─────────────────────────────────────────────────────────────

  function drawWheel() {
    if (!_ctx) return;
    const S = WHEEL_SIZE, cx = S/2, cy = S/2, r = S/2 - 2;
    const img = _ctx.createImageData(S, S);
    const d   = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const s = dist / r;
        const [rr, gg, bb] = hslToRgb(h, s, _lightness);
        const i = (y * S + x) * 4;
        d[i]=rr; d[i+1]=gg; d[i+2]=bb; d[i+3]=255;
      }
    }
    _ctx.putImageData(img, 0, 0);

    _colors.forEach((hex, i) => {
      if (!hex) return;
      const [h, s] = hexToHsl(hex);
      const angle = h * Math.PI / 180;
      const sat   = Math.max(0, Math.min(1, s));
      const mx = cx + Math.cos(angle) * sat * r;
      const my = cy + Math.sin(angle) * sat * r;
      const active = (i === _activeSlot);
      _ctx.beginPath();
      _ctx.arc(mx, my, active ? 9 : 7, 0, Math.PI*2);
      _ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.55)';
      _ctx.lineWidth   = active ? 3 : 2;
      _ctx.stroke();
      _ctx.fillStyle = hex;
      _ctx.fill();
      _ctx.fillStyle = contrastFor(hex);
      _ctx.font = `bold ${active ? 10 : 8}px sans-serif`;
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(i + 1, mx, my);
    });
  }

  function wheelColorAt(cx, cy) {
    const S = WHEEL_SIZE, r = S/2 - 2;
    const dx = cx - S/2, dy = cy - S/2;
    if (Math.hypot(dx, dy) > r) return null;
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const s = Math.hypot(dx, dy) / r;
    return hslToHex(h, s, _lightness);
  }

  function canvasCoords(e) {
    const rect = _canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (WHEEL_SIZE / rect.width),
      (e.clientY - rect.top)  * (WHEEL_SIZE / rect.height)
    ];
  }

  function attachWheelEvents() {
    if (!_canvas || _canvas._crecBound) return;
    _canvas._crecBound = true;

    _canvas.addEventListener('mousedown', e => {
      _dragging = true;
      const [x, y] = canvasCoords(e);
      const hex = wheelColorAt(x, y);
      if (hex) { _colors[_activeSlot] = hex; renderSlots(); drawWheel(); renderRecs(); }
    });
    _canvas.addEventListener('mousemove', e => {
      if (!_dragging) return;
      const [x, y] = canvasCoords(e);
      const hex = wheelColorAt(x, y);
      if (hex) { _colors[_activeSlot] = hex; renderSlots(); drawWheel(); }
    });
    document.addEventListener('mouseup', () => {
      if (!_dragging) return;
      _dragging = false;
      advanceSlot();
      refreshAll();
    });
  }

  function advanceSlot() {
    for (let i = _activeSlot + 1; i < 3; i++) {
      if (!_colors[i]) { _activeSlot = i; return; }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function renderSlots() {
    if (typeof document === 'undefined') return;
    _colors.forEach((hex, i) => {
      const el = document.getElementById(`crec-slot-${i}`);
      if (!el) return;
      const active = (i === _activeSlot);
      el.style.background  = hex || 'transparent';
      el.style.borderColor = active ? '#60a5fa' : (hex ? '#475569' : '#334155');
      el.style.borderStyle = active ? 'solid'   : (hex ? 'solid'   : 'dashed');
      el.style.borderWidth = active ? '3px'     : '2px';
      const hexEl = el.querySelector('.crec-slot-hex');
      if (hexEl) { hexEl.textContent = hex || '—'; hexEl.style.color = hex ? contrastFor(hex) : '#64748b'; }
      const numEl = el.querySelector('.crec-slot-num');
      if (numEl) numEl.style.color = hex ? contrastFor(hex) : '#94a3b8';
    });
    const pv  = document.getElementById('crec-preview-bar');
    const pvh = document.getElementById('crec-preview-hex');
    const lbl = document.getElementById('crec-step-label');
    const cur = _colors[_activeSlot];
    if (pv)  pv.style.background = cur || '#1e2433';
    if (pvh) { pvh.textContent = cur || '—'; pvh.style.color = cur ? contrastFor(cur) : '#64748b'; }
    if (lbl) lbl.textContent = `Editing: Color ${_activeSlot + 1}`;
  }

  function renderRecs() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('crec-recs');
    if (!el) return;
    const recs = getRecommendations();
    if (recs.length === 0) {
      el.innerHTML = `<div class="crec-hint">Pick your first color from the wheel above, or enter a hex code below.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="crec-recs-title">Suggestions for Color ${_activeSlot + 1}</div>
      <div class="crec-recs-grid">
        ${recs.map(r => `
          <div class="crec-rec" onclick="crecPickRecommended('${r.hex}')"
               onmouseenter="this.style.borderColor='#60a5fa'"
               onmouseleave="this.style.borderColor='#2d3748'"
               title="${r.label} — ${r.hex}">
            <div class="crec-rec-swatch" style="background:${r.hex}"></div>
            <span class="crec-rec-label">${r.label}</span>
            <span class="crec-rec-hex">${r.hex}</span>
          </div>
        `).join('')}
      </div>`;
  }

  function renderApply() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('crec-apply-row');
    if (el) el.style.display = _colors.filter(Boolean).length >= 2 ? 'flex' : 'none';
  }

  function refreshAll() {
    renderSlots();
    renderRecs();
    renderApply();
    drawWheel();
  }

  // ── Public actions ────────────────────────────────────────────────────────────

  function crecPickRecommended(hex) {
    _colors[_activeSlot] = hex;
    advanceSlot();
    refreshAll();
  }

  function crecSetActiveSlot(i) {
    _activeSlot = parseInt(i, 10);
    refreshAll();
  }

  function crecClearSlot(i) {
    i = parseInt(i, 10);
    _colors[i] = null;
    if (_activeSlot > i) _activeSlot = i;
    refreshAll();
  }

  function applyCrecColors() {
    _colors.forEach((hex, i) => {
      const g = i + 1;
      if (hex) {
        if (g > 2 && typeof userCreatedGroups !== 'undefined') {
          userCreatedGroups.add(g);
        }
        if (typeof setGroupColor === 'function') setGroupColor(g, hex);
      }
    });
    closeColorRecommender();
    if (typeof renderPaintGroupsList === 'function') renderPaintGroupsList();
    if (typeof updateLiveStats === 'function') updateLiveStats();
    if (typeof showToast === 'function') showToast('Color scheme applied to groups 1–3', 'success');
  }

  // ── Open / Close ──────────────────────────────────────────────────────────────

  function openColorRecommender() {
    const modal = document.getElementById('color-recommender-modal');
    if (!modal) return;

    _colors = [
      typeof getGroupColorHex === 'function' ? getGroupColorHex(1) : null,
      typeof getGroupColorHex === 'function' ? getGroupColorHex(2) : null,
      null
    ];
    _activeSlot = _colors[1] ? 2 : (_colors[0] ? 1 : 0);

    modal.classList.add('open');

    _canvas = document.getElementById('crec-wheel');
    if (_canvas) {
      _canvas.width  = WHEEL_SIZE;
      _canvas.height = WHEEL_SIZE;
      _ctx = _canvas.getContext('2d');
      attachWheelEvents();
    }

    const ls  = document.getElementById('crec-lightness-slider');
    const lsv = document.getElementById('crec-lightness-val');
    if (ls) {
      ls.value = Math.round(_lightness * 100);
      ls.oninput = (e) => {
        _lightness = parseInt(e.target.value, 10) / 100;
        if (lsv) lsv.textContent = Math.round(_lightness * 100) + '%';
        drawWheel();
      };
    }

    const hi = document.getElementById('crec-hex-input');
    if (hi) {
      hi.value = '';
      hi.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        const v = hi.value.trim();
        const hex = /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith('#') ? v : '#'+v) : null;
        if (!hex) return;
        _colors[_activeSlot] = hex;
        advanceSlot();
        hi.value = '';
        refreshAll();
      };
    }

    refreshAll();
  }

  function closeColorRecommender() {
    const modal = document.getElementById('color-recommender-modal');
    if (modal) modal.classList.remove('open');
  }

  return {
    openColorRecommender,
    closeColorRecommender,
    crecPickRecommended,
    crecSetActiveSlot,
    crecClearSlot,
    applyCrecColors
  };
});
