/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Color Utilities & Color Space Math (sRGB, CIE-Lab, CIEDE2000)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.ColorUtils = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_GROUP_NAMES = {
    1: "Large Smooth Surfaces",
    2: "Fine Detail / Textured"
  };

  const groupNames = new Map();
  const groupColors = new Map([
    [1, "#94a3b8"],
    [2, "#eab308"]
  ]);

  const threeColorCache = typeof THREE !== 'undefined' ? new Map([
    [1, new THREE.Color("#94a3b8")],
    [2, new THREE.Color("#eab308")]
  ]) : new Map();

  const userCreatedGroups = new Set();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showToast(message, type = 'info') {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  function formatHexColor(hex) {
    if (!hex) return '#94a3b8';
    hex = String(hex).trim().toLowerCase();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : '#94a3b8';
  }

  function getGroupName(groupNum, includeNumber = true) {
    groupNum = parseInt(groupNum, 10);
    let name = groupNames.get(groupNum);
    if (!name) {
      name = DEFAULT_GROUP_NAMES[groupNum] || `Group ${groupNum}`;
    }
    if (includeNumber) {
      if (name.startsWith(`${groupNum}: `)) return name;
      return `${groupNum}: ${name}`;
    }
    if (name.startsWith(`${groupNum}: `)) {
      return name.slice(`${groupNum}: `.length);
    }
    return name;
  }

  function setGroupName(groupNum, newName) {
    groupNum = parseInt(groupNum, 10);
    const trimmed = (newName || '').trim();
    if (trimmed) {
      groupNames.set(groupNum, trimmed);
    } else {
      groupNames.delete(groupNum);
    }

    if (typeof activeBrushGroup !== 'undefined' && activeBrushGroup === groupNum) {
      const bn = document.getElementById('brush-name');
      if (bn) bn.textContent = getGroupName(groupNum, true);
    }

    const popupLabel = document.getElementById(`popup-name-g${groupNum}`);
    if (popupLabel) {
      popupLabel.textContent = getGroupName(groupNum, true);
    }

    if (typeof hoveredPartId !== 'undefined' && hoveredPartId !== -1 && typeof partGroup !== 'undefined' && partGroup && partGroup[hoveredPartId] === groupNum) {
      const gName = getGroupName(groupNum, true);
      const cnt = (typeof partFaces !== 'undefined' && partFaces[hoveredPartId]) ? partFaces[hoveredPartId].length : 0;
      const inspector = document.getElementById('surface-inspector');
      if (inspector) {
        inspector.innerHTML = `<b>Part #${hoveredPartId + 1}</b> (${cnt.toLocaleString()} faces)<br>Category: <b>${escapeHtml(gName)}</b> &bull; Click/Shift+Click to select`;
      }
    }

    if (typeof renderDistributionBar === 'function') renderDistributionBar();
  }

  function getGroupColor(groupNum) {
    groupNum = parseInt(groupNum, 10);
    if (threeColorCache.has(groupNum)) {
      return threeColorCache.get(groupNum);
    }
    let col;
    if (groupColors.has(groupNum)) {
      col = typeof THREE !== 'undefined' ? new THREE.Color(groupColors.get(groupNum)) : null;
    } else if (typeof THREE !== 'undefined') {
      const hue = ((groupNum * 137.508) % 360);
      const sat = 0.68 + (groupNum % 3) * 0.05;
      const lit = 0.52 + (groupNum % 2) * 0.04;
      col = new THREE.Color();
      col.setHSL(hue / 360, sat, lit);
    }
    if (col) threeColorCache.set(groupNum, col);
    return col;
  }

  function getGroupColorHex(groupNum) {
    groupNum = parseInt(groupNum, 10);
    if (groupColors.has(groupNum)) {
      const val = groupColors.get(groupNum);
      if (typeof val === 'string') return formatHexColor(val);
      return formatHexColor('#' + val.getHexString());
    }
    const gc = getGroupColor(groupNum);
    return formatHexColor(gc ? '#' + gc.getHexString() : '#94a3b8');
  }

  function setGroupColor(groupNum, hex) {
    groupNum = parseInt(groupNum, 10);
    groupColors.set(groupNum, hex);
    if (typeof THREE !== 'undefined') {
      threeColorCache.set(groupNum, new THREE.Color(hex));
    }

    if (typeof document !== 'undefined') {
      if (groupNum === 1) document.documentElement.style.setProperty('--col-smooth', hex);
      else if (groupNum === 2) document.documentElement.style.setProperty('--col-detail', hex);

      if (typeof activeBrushGroup !== 'undefined' && activeBrushGroup === groupNum) {
        const bd = document.getElementById('brush-dot');
        if (bd) bd.style.background = hex;
        const brushHex = document.getElementById('brush-hex');
        if (brushHex) brushHex.textContent = hex;
      }

      const colorInput = document.getElementById(`color-picker-${groupNum}`);
      if (colorInput && colorInput.value !== hex) colorInput.value = hex;

      const hexLabel = document.getElementById(`color-hex-${groupNum}`);
      if (hexLabel) hexLabel.textContent = hex;

      const choiceDot = document.getElementById(`choice-dot-${groupNum}`);
      if (choiceDot) choiceDot.style.background = hex;

      const popupHex = document.getElementById(`popup-hex-g${groupNum}`);
      if (popupHex) popupHex.textContent = hex;
    }

    if (typeof fullColorMesh === 'function') fullColorMesh();
    if (typeof renderDistributionBar === 'function') renderDistributionBar();
    if (typeof updatePaintMatchForGroup === 'function') updatePaintMatchForGroup(groupNum);
  }

  function getNextCustomGroupNumber() {
    const allGroups = new Set(typeof partGroup !== 'undefined' && partGroup ? partGroup : []);
    userCreatedGroups.forEach(g => allGroups.add(g));
    let nextG = 3;
    while (allGroups.has(nextG)) nextG++;
    return nextG;
  }

  function createNewCustomGroup() {
    const newG = getNextCustomGroupNumber();
    userCreatedGroups.add(newG);
    if (!groupColors.has(newG)) {
      groupColors.set(newG, getGroupColorHex(newG));
    }
    if (typeof setActiveBrushGroup === 'function') setActiveBrushGroup(newG);
    if (typeof updateLiveStats === 'function') updateLiveStats();
    setTimeout(() => {
      const input = document.getElementById(`name-input-${newG}`);
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  function hexToRgb(hex) {
    hex = (hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16) || 0;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToLab(r, g, b) {
    let rN = r / 255, gN = g / 255, bN = b / 255;
    rN = rN > 0.04045 ? Math.pow((rN + 0.055) / 1.055, 2.4) : rN / 12.92;
    gN = gN > 0.04045 ? Math.pow((gN + 0.055) / 1.055, 2.4) : gN / 12.92;
    bN = bN > 0.04045 ? Math.pow((bN + 0.055) / 1.055, 2.4) : bN / 12.92;

    let x = (rN * 0.4124564 + gN * 0.3575761 + bN * 0.1804375) / 0.95047;
    let y = (rN * 0.2126729 + gN * 0.7151522 + bN * 0.0721750) / 1.00000;
    let z = (rN * 0.0193339 + gN * 0.1191920 + bN * 0.9503041) / 1.08883;

    const f = t => t > 0.008856451679 ? Math.cbrt(t) : (7.787037037 * t) + (16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);

    return { L: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function deltaE2000(lab1, lab2) {
    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;

    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;

    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);

    const h1p = (b1 === 0 && a1p === 0) ? 0 : (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
    const h2p = (b2 === 0 && a2p === 0) ? 0 : (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = 0;
    if (C1p * C2p !== 0) {
      if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
      else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
      else dhp = h2p - h1p + 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * Math.PI / 180);

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;

    let hbarp = 0;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
      else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
      else hbarp = (h1p + h2p - 360) / 2;
    }

    const T = 1 - 0.17 * Math.cos((hbarp - 30) * Math.PI / 180)
              + 0.24 * Math.cos((2 * hbarp) * Math.PI / 180)
              + 0.32 * Math.cos((3 * hbarp + 6) * Math.PI / 180)
              - 0.20 * Math.cos((4 * hbarp - 63) * Math.PI / 180);

    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const Cbarp7 = Math.pow(Cbarp, 7);
    const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));

    const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;
    const RT = -Math.sin((2 * dTheta) * Math.PI / 180) * RC;

    return Math.sqrt(
      Math.pow(dLp / SL, 2) +
      Math.pow(dCp / SC, 2) +
      Math.pow(dHp / SH, 2) +
      RT * (dCp / SC) * (dHp / SH)
    );
  }

  function findClosestPaint(groupHex, paints) {
    if (!paints || paints.length === 0) return null;
    const groupRgb = hexToRgb(groupHex);
    const groupLab = rgbToLab(groupRgb.r, groupRgb.g, groupRgb.b);

    let bestPaint = null;
    let minDE = Infinity;

    for (const paint of paints) {
      if (!paint.hex) continue;
      const pRgb = paint.rgb || hexToRgb(paint.hex);
      const pLab = rgbToLab(pRgb.r, pRgb.g, pRgb.b);
      const dE = deltaE2000(groupLab, pLab);
      if (dE < minDE) {
        minDE = dE;
        bestPaint = paint;
      }
    }

    return bestPaint ? { paint: bestPaint, dE: minDE } : null;
  }

  return {
    DEFAULT_GROUP_NAMES,
    groupNames,
    groupColors,
    threeColorCache,
    userCreatedGroups,
    escapeHtml,
    showToast,
    formatHexColor,
    getGroupName,
    setGroupName,
    getGroupColor,
    getGroupColorHex,
    setGroupColor,
    getNextCustomGroupNumber,
    createNewCustomGroup,
    hexToRgb,
    rgbToLab,
    deltaE2000,
    findClosestPaint
  };
});
