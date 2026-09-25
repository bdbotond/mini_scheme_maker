/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Miniature Paint Matching & Paint Groups List UI
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.PaintManager = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const loadedPaintBrands = new Map();
  let currentSelectedBrandFile = 'Warhammer_Colour.json';
  let lastDistStats = null;

  function renderDistributionBar() {
    if (typeof document === 'undefined') return;
    const distBar = document.getElementById('dist-bar');
    if (!distBar || !lastDistStats) return;
    const { sPct, dPct, customList } = lastDistStats;
    let html = `
      <div class="dist-segment" style="width: ${sPct}%; background: ${getGroupColorHex(1)};" title="${escapeHtml(getGroupName(1, true))}: ${sPct.toFixed(1)}%"></div>
      <div class="dist-segment" style="width: ${dPct}%; background: ${getGroupColorHex(2)};" title="${escapeHtml(getGroupName(2, true))}: ${dPct.toFixed(1)}%"></div>
    `;
    if (customList) {
      for (const item of customList) {
        html += `<div class="dist-segment" style="width: ${item.pct}%; background: ${getGroupColorHex(item.g)};" title="${escapeHtml(getGroupName(item.g, true))}: ${item.pct.toFixed(1)}%"></div>`;
      }
    }
    distBar.innerHTML = html;
  }

  function updateLiveStats() {
    let sArea = 0, dArea = 0;
    let sCount = 0, dCount = 0;

    const customGroupsMap = new Map();
    userCreatedGroups.forEach(g => {
      if (g > 2) customGroupsMap.set(g, { parts: 0, faces: 0, area: 0 });
    });

    if (numParts > 0 && partGroup) {
      for (let p = 0; p < numParts; p++) {
        const g = partGroup[p];
        const count = partFaces[p] ? partFaces[p].length : 0;
        let area = 0;
        if (faceAreas && partFaces[p]) {
          for (let i = 0; i < count; i++) area += faceAreas[partFaces[p][i]];
        }

        if (g === 1) { sArea += area; sCount += count; }
        else if (g === 2) { dArea += area; dCount += count; }
        else {
          if (!customGroupsMap.has(g)) customGroupsMap.set(g, { parts: 0, faces: 0, area: 0 });
          const entry = customGroupsMap.get(g);
          entry.parts++;
          entry.faces += count;
          entry.area += area;
        }
      }
    }

    const sPct = totalMeshArea > 0 ? (sArea / totalMeshArea * 100) : 0;
    const dPct = totalMeshArea > 0 ? (dArea / totalMeshArea * 100) : 0;

    const sortedCustom = Array.from(customGroupsMap.keys()).sort((a,b) => a - b);
    const customDistList = sortedCustom.map(g => {
      const info = customGroupsMap.get(g);
      return {
        g,
        pct: totalMeshArea > 0 ? (info.area / totalMeshArea * 100) : 0
      };
    });

    lastDistStats = { sPct, dPct, customList: customDistList };
    renderDistributionBar();
    if (typeof renderPaintGroupsList === 'function') renderPaintGroupsList();
  }

  function resetSingleGroup(groupNum) {
    let hadParts = false;
    for (let p = 0; p < numParts; p++) {
      if (partGroup[p] === groupNum) {
        partGroup[p] = initialPartGroup[p];
        hadParts = true;
      }
    }
    userCreatedGroups.delete(groupNum);
    groupNames.delete(groupNum);
    groupColors.delete(groupNum);
    threeColorCache.delete(groupNum);
    if (typeof activeBrushGroup !== 'undefined' && activeBrushGroup === groupNum) {
      if (typeof setActiveBrushGroup === 'function') setActiveBrushGroup(1);
    }
    if (hadParts && typeof fullColorMesh === 'function') fullColorMesh();
    updateLiveStats();
  }

  function resetToInitialCategories() {
    for (let p = 0; p < numParts; p++) {
      partGroup[p] = initialPartGroup[p];
    }
    userCreatedGroups.clear();
    if (typeof setActiveBrushGroup === 'function') setActiveBrushGroup(1);
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof closeGroupPopup === 'function') closeGroupPopup();
    if (typeof fullColorMesh === 'function') fullColorMesh();
    updateLiveStats();
  }

  async function initPaintBrands() {
    let manifest = null;
    if (typeof window !== 'undefined' && window.MINIATURE_PAINTS_DB && window.MINIATURE_PAINTS_DB.manifest) {
      manifest = window.MINIATURE_PAINTS_DB.manifest;
      for (const [file, paints] of Object.entries(window.MINIATURE_PAINTS_DB.paints || {})) {
        loadedPaintBrands.set(file, paints);
      }
    } else {
      try {
        const res = await fetch('dep/paints/manifest.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        manifest = await res.json();
      } catch (err) {
        console.warn('Failed to load miniature paint manifest:', err);
      }
    }

    const select = document.getElementById('paint-brand-select');
    const countSpan = document.getElementById('paint-brand-count');

    if (manifest && manifest.length > 0) {
      if (countSpan) countSpan.textContent = `${manifest.length} Brands Available`;
      if (select) {
        select.innerHTML = manifest.map(b => 
          `<option value="${b.file}" ${b.file === currentSelectedBrandFile ? 'selected' : ''}>${escapeHtml(b.displayName)} (${b.paintCount} paints)</option>`
        ).join('');
      }
      await loadAndSelectPaintBrand(currentSelectedBrandFile);
    } else {
      if (select) select.innerHTML = '<option value="">Paint dataset offline</option>';
    }
  }

  async function loadAndSelectPaintBrand(brandFile) {
    currentSelectedBrandFile = brandFile;
    if (!loadedPaintBrands.has(brandFile)) {
      if (typeof window !== 'undefined' && window.MINIATURE_PAINTS_DB && window.MINIATURE_PAINTS_DB.paints && window.MINIATURE_PAINTS_DB.paints[brandFile]) {
        loadedPaintBrands.set(brandFile, window.MINIATURE_PAINTS_DB.paints[brandFile]);
      } else {
        try {
          const res = await fetch(`dep/paints/${brandFile}`);
          const data = await res.json();
          loadedPaintBrands.set(brandFile, data.paints || []);
        } catch (err) {
          console.error(`Error loading paint brand ${brandFile}:`, err);
          return;
        }
      }
    }
    updateAllPaintMatches();
  }

  function handlePaintBrandChange(brandFile) {
    if (brandFile) loadAndSelectPaintBrand(brandFile);
  }

  function updatePaintMatchForGroup(groupNum) {
    if (typeof renderPaintGroupsList === 'function') renderPaintGroupsList();
  }

  function updateAllPaintMatches() {
    if (typeof renderPaintGroupsList === 'function') renderPaintGroupsList();
  }

  function renderPaintGroupsList() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('paint-groups-list');
    if (!container) return;

    const allGroups = [1, 2, ...Array.from(userCreatedGroups).filter(g => g > 2).sort((a,b)=>a-b)];
    const paints = loadedPaintBrands.get(currentSelectedBrandFile) || [];

    let html = '';
    for (const g of allGroups) {
      const colHex = getGroupColorHex(g);
      const name = getGroupName(g, false);
      const isBrush = typeof activeBrushGroup !== 'undefined' && activeBrushGroup === g;
      const isCustom = g > 2;

      let faceCount = 0, areaSum = 0;
      if (numParts > 0 && partGroup) {
        for (let p = 0; p < numParts; p++) {
          if (partGroup[p] === g) {
            faceCount += partFaces[p] ? partFaces[p].length : 0;
            if (faceAreas && partFaces[p]) {
              for (let i = 0; i < partFaces[p].length; i++) areaSum += faceAreas[partFaces[p][i]];
            }
          }
        }
      }
      const pct = totalMeshArea > 0 ? (areaSum / totalMeshArea * 100) : 0;

      let paintMatchHtml = '';
      if (paints.length > 0) {
        const match = findClosestPaint(colHex, paints);
        if (match) {
          const dEText = match.dE < 1.0 ? 'Exact' : `ΔE ${match.dE.toFixed(1)}`;
          const mfr = currentSelectedBrandFile.replace(/_/g,' ').replace('.json','');
          paintMatchHtml = `<div class="pg-paint-match"><span class="pg-paint-swatch" style="background:${match.paint.hex}"></span>${escapeHtml(match.paint.name)} &bull; ${dEText} &bull; <span style="color:#64748b;font-size:9px">${escapeHtml(mfr)}</span></div>`;
        }
      }

      const delBtn = isCustom
        ? `<button class="pg-row-del" title="Remove group" onclick="event.stopPropagation();resetSingleGroup(${g})">&times;</button>`
        : '';

      html += `
        <div class="pg-row ${isBrush ? 'active-brush' : ''}" onclick="handleCategoryCardClick(${g})">
          <input type="color" id="color-picker-${g}" class="group-color-input" value="${colHex}" title="Pick color"
            style="width:18px;height:18px;flex-shrink:0"
            onclick="event.stopPropagation();" oninput="setGroupColor(${g}, this.value)">
          <input type="text" class="pg-row-name" id="name-input-${g}" value="${escapeHtml(name)}"
            placeholder="Group ${g}" onclick="event.stopPropagation();"
            oninput="setGroupName(${g}, this.value)" onkeydown="if(event.key==='Enter')this.blur();">
          <span class="pg-row-pct">${pct.toFixed(1)}%</span>
          <span class="pg-row-badge">BRUSH</span>
          ${delBtn}
        </div>
        ${paintMatchHtml ? `<div style="padding: 0 8px 2px;">${paintMatchHtml}</div>` : ''}
      `;
    }
    container.innerHTML = html;

    const resetBtn = document.getElementById('reset-base-btn');
    if (resetBtn) {
      const isModified = userCreatedGroups.size > 0 || (partGroup && initialPartGroup && numParts > 0 && partGroup.some((g, i) => g !== initialPartGroup[i]));
      resetBtn.style.display = isModified ? 'inline-flex' : 'none';
    }
  }

  return {
    loadedPaintBrands,
    get currentSelectedBrandFile() { return currentSelectedBrandFile; },
    set currentSelectedBrandFile(v) { currentSelectedBrandFile = v; },
    renderDistributionBar,
    updateLiveStats,
    resetSingleGroup,
    resetToInitialCategories,
    initPaintBrands,
    loadAndSelectPaintBrand,
    handlePaintBrandChange,
    updatePaintMatchForGroup,
    updateAllPaintMatches,
    renderPaintGroupsList
  };
});
