/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Selection: Multi-part picking, Box Select, Radius Select, Painting state
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.Selection = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const selectedPartIds = new Set();
  let activeBrushGroup = 1;
  let hoveredPartId = -1;
  let isolatedCategory = -1;
  let isPainting = false;
  let paintDirty = false;
  let toolMode = 'brush';
  let selectionRadiusPx = 35;
  let isBoxSelecting = false;
  let isRadiusSelecting = false;
  let boxStartPos = { x: 0, y: 0 };

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function setActiveBrushGroup(groupNum) {
    activeBrushGroup = groupNum;
    const colHex = getGroupColorHex(groupNum);
    const bd = document.getElementById('brush-dot');
    if (bd) bd.style.background = colHex;
    const bn = document.getElementById('brush-name');
    if (bn) bn.textContent = getGroupName(groupNum, true);
    const brushHex = document.getElementById('brush-hex');
    if (brushHex) brushHex.textContent = colHex;
    if (typeof renderPaintGroupsList === 'function') renderPaintGroupsList();
  }

  function setToolMode(mode) {
    toolMode = mode;
    document.querySelectorAll('.tool-mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tool-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const edgeDetectionPanel = document.getElementById('edge-detection-panel');
    const toolSettingsPanel = document.getElementById('tool-settings-panel');
    const subsplitSettings = document.getElementById('subsplit-tool-settings');
    const radiusSettings = document.getElementById('radius-tool-settings');
    const toolSettingsTitle = document.getElementById('tool-settings-title');

    if (edgeDetectionPanel) edgeDetectionPanel.style.display = mode === 'brush' ? 'block' : 'none';

    if (toolSettingsPanel) {
      if (mode === 'subsplit') {
        toolSettingsPanel.style.display = 'block';
        if (subsplitSettings) subsplitSettings.style.display = 'block';
        if (radiusSettings) radiusSettings.style.display = 'none';
        if (toolSettingsTitle) toolSettingsTitle.textContent = 'Sub-Split Settings';
      } else if (mode === 'radius') {
        toolSettingsPanel.style.display = 'block';
        if (subsplitSettings) subsplitSettings.style.display = 'none';
        if (radiusSettings) radiusSettings.style.display = 'block';
        if (toolSettingsTitle) toolSettingsTitle.textContent = 'Radius Select Settings';
      } else {
        toolSettingsPanel.style.display = 'none';
        if (subsplitSettings) subsplitSettings.style.display = 'none';
        if (radiusSettings) radiusSettings.style.display = 'none';
      }
    }

    const helpEl = document.getElementById('tool-help-text');
    if (helpEl) {
      if (mode === 'brush') {
        helpEl.innerHTML = '💡 <b>Brush Mode:</b> Click to select &bull; <b>Shift+Drag</b> to paint &bull; Keys <b>1-9</b> pick color.';
      } else if (mode === 'box') {
        helpEl.innerHTML = '💡 <b>Box Area Select:</b> Drag a rectangle over the model to select all segments in that area &bull; <b>Shift</b> to add.';
      } else if (mode === 'radius') {
        helpEl.innerHTML = '💡 <b>Radius Area Select:</b> Click or drag circle over the model to select segments in that radius &bull; <b>Shift</b> to add.';
      } else if (mode === 'subsplit') {
        helpEl.innerHTML = '💡 <b>Sub-Split Mode:</b> Hover to preview softer crease patch &bull; <b>Click</b> to split off and reassign.';
      }
    }

    const ring = document.getElementById('radius-cursor-ring');
    if (ring && mode !== 'radius') ring.style.display = 'none';

    if (typeof clearSubSplitPreview === 'function' && mode !== 'subsplit') clearSubSplitPreview();

    if (mode === 'box' || mode === 'radius') {
      renderer.domElement.style.cursor = 'crosshair';
    } else if (mode === 'subsplit') {
      renderer.domElement.style.cursor = 'cell';
    } else {
      renderer.domElement.style.cursor = 'default';
    }
  }

  function updateSelectionUI() {
    const bar = document.getElementById('selection-action-bar');
    const badge = document.getElementById('selection-count-badge');
    if (!bar) return;
    if (selectedPartIds.size > 0) {
      bar.style.display = 'flex';
      let totalFaces = 0;
      selectedPartIds.forEach(p => { if (partFaces[p]) totalFaces += partFaces[p].length; });
      badge.textContent = `${selectedPartIds.size} parts selected (${totalFaces.toLocaleString()} faces)`;
    } else {
      bar.style.display = 'none';
    }
  }

  function assignSelectionToActiveBrush() {
    if (selectedPartIds.size === 0) return;
    assignSelectionToGroup(activeBrushGroup);
  }

  function handleCategoryCardClick(catNum) {
    if (selectedPartIds.size > 0) {
      assignSelectionToGroup(catNum);
    } else {
      setActiveBrushGroup(catNum);
    }
  }

  function executeBoxSelect(startX, startY, endX, endY) {
    if (!currentMesh || numParts === 0 || !partCenters) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const xMin = Math.min(startX, endX);
    const xMax = Math.max(startX, endX);
    const yMin = Math.min(startY, endY);
    const yMax = Math.max(startY, endY);

    const tempVec = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const camDir = new THREE.Vector3();

    for (let p = 0; p < numParts; p++) {
      worldPos.set(partCenters[p * 3], partCenters[p * 3 + 1], partCenters[p * 3 + 2]);
      tempVec.copy(worldPos).project(camera);

      if (tempVec.z < -1 || tempVec.z > 1) continue;

      const screenX = ((tempVec.x + 1) * 0.5) * rect.width + rect.left;
      const screenY = ((-tempVec.y + 1) * 0.5) * rect.height + rect.top;

      let isInBox = (screenX >= xMin && screenX <= xMax && screenY >= yMin && screenY <= yMax);

      if (!isInBox && partFaces[p] && partFaces[p].length > 10) {
        const faces = partFaces[p];
        const step = Math.max(1, Math.floor(faces.length / 5));
        const pos = currentMesh.geometry.attributes.position.array;
        for (let i = 0; i < faces.length; i += step) {
          const f9 = faces[i] * 9;
          tempVec.set(pos[f9], pos[f9 + 1], pos[f9 + 2]).project(camera);
          if (tempVec.z >= -1 && tempVec.z <= 1) {
            const sx = ((tempVec.x + 1) * 0.5) * rect.width + rect.left;
            const sy = ((-tempVec.y + 1) * 0.5) * rect.height + rect.top;
            if (sx >= xMin && sx <= xMax && sy >= yMin && sy <= yMax) { isInBox = true; break; }
          }
        }
      }

      if (isInBox) {
        camDir.subVectors(camera.position, worldPos).normalize();
        normal.set(partNormals[p * 3], partNormals[p * 3 + 1], partNormals[p * 3 + 2]);
        if (normal.dot(camDir) > -0.25) {
          selectedPartIds.add(p);
          writePartSliceColor(p, 'selected');
        }
      }
    }

    if (selectedPartIds.size > 0) openGroupPopup(endX, endY);
    else closeGroupPopup();
    updateSelectionUI();
  }

  function executeRadiusSelect(clientX, clientY, skipPopupUpdate = false) {
    if (!currentMesh || numParts === 0 || !partCenters) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const tempVec = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const camDir = new THREE.Vector3();

    for (let p = 0; p < numParts; p++) {
      worldPos.set(partCenters[p * 3], partCenters[p * 3 + 1], partCenters[p * 3 + 2]);
      tempVec.copy(worldPos).project(camera);

      if (tempVec.z < -1 || tempVec.z > 1) continue;

      const screenX = ((tempVec.x + 1) * 0.5) * rect.width + rect.left;
      const screenY = ((-tempVec.y + 1) * 0.5) * rect.height + rect.top;

      if (Math.hypot(screenX - clientX, screenY - clientY) <= selectionRadiusPx) {
        camDir.subVectors(camera.position, worldPos).normalize();
        normal.set(partNormals[p * 3], partNormals[p * 3 + 1], partNormals[p * 3 + 2]);
        if (normal.dot(camDir) > -0.25) {
          selectedPartIds.add(p);
          writePartSliceColor(p, 'selected');
        }
      }
    }

    if (!skipPopupUpdate) {
      if (selectedPartIds.size > 0) openGroupPopup(clientX, clientY);
      else closeGroupPopup();
    }
    updateSelectionUI();
  }

  function clearSelection() {
    selectedPartIds.forEach(p => writePartSliceColor(p, 'base'));
    selectedPartIds.clear();
    updateSelectionUI();
  }

  function assignSelectionToGroup(groupNum) {
    groupNum = parseInt(groupNum, 10);
    if (isNaN(groupNum) || groupNum < 1 || selectedPartIds.size === 0) return;

    if (groupNum > 2) {
      userCreatedGroups.add(groupNum);
      if (!groupColors.has(groupNum)) groupColors.set(groupNum, getGroupColorHex(groupNum));
    }

    selectedPartIds.forEach(pId => {
      partGroup[pId] = groupNum;
      writePartSliceColor(pId, 'base');
    });

    selectedPartIds.clear();
    if (typeof popup !== 'undefined' && popup) popup.style.display = 'none';
    updateSelectionUI();
    updateLiveStats();
  }

  function getPartUnderPointer(clientX, clientY) {
    if (!currentMesh || numFaces === 0) return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentMesh);
    if (hits.length > 0) {
      const faceIdx = hits[0].faceIndex;
      if (partOfFace && faceIdx < partOfFace.length) return partOfFace[faceIdx];
    }
    return -1;
  }

  function getFaceUnderPointer(clientX, clientY) {
    if (!currentMesh || numFaces === 0) return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentMesh);
    return hits.length > 0 ? hits[0].faceIndex : -1;
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && settingsModal.classList.contains('open')) return;

    if (e.key === 'Escape') {
      clearSelection();
      closeGroupPopup();
      clearSubSplitPreview();
      updateSelectionUI();
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      const groupNum = parseInt(e.key, 10);
      if (selectedPartIds.size > 0) assignSelectionToGroup(groupNum);
      else setActiveBrushGroup(groupNum);
      return;
    }
    if (typeof appSettings !== 'undefined' && appSettings.keys) {
      const k = e.key.toLowerCase();
      const keys = appSettings.keys;
      if (k === keys.brush) setToolMode('brush');
      else if (k === keys.box) setToolMode('box');
      else if (k === keys.radius) setToolMode('radius');
      else if (k === keys.subsplit) setToolMode('subsplit');
    }
  });

  // Pointer events
  const inspector = document.getElementById('surface-inspector');
  let pointerDownPos = { x: 0, y: 0 };
  let pointerDownTime = 0;
  let didPaintInDrag = false;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
    pointerDownTime = performance.now();
    didPaintInDrag = false;

    if (e.button !== 0) return;

    if (toolMode === 'box') {
      controls.enabled = false;
      isBoxSelecting = true;
      boxStartPos = { x: e.clientX, y: e.clientY };
      const marquee = document.getElementById('selection-marquee');
      if (marquee) {
        marquee.style.left = e.clientX + 'px';
        marquee.style.top = e.clientY + 'px';
        marquee.style.width = '0px';
        marquee.style.height = '0px';
        marquee.style.display = 'block';
      }
      if (!e.shiftKey) clearSelection();
      return;
    }

    if (toolMode === 'radius') {
      controls.enabled = false;
      isRadiusSelecting = true;
      if (!e.shiftKey) clearSelection();
      executeRadiusSelect(e.clientX, e.clientY, true);
      return;
    }

    if (e.shiftKey && e.button === 0) {
      controls.enabled = false;
      isPainting = true;
      const pId = getPartUnderPointer(e.clientX, e.clientY);
      if (pId !== -1 && partGroup[pId] !== activeBrushGroup) {
        partGroup[pId] = activeBrushGroup;
        if (activeBrushGroup > 2) userCreatedGroups.add(activeBrushGroup);
        writePartSliceColor(pId, 'base');
        paintDirty = true;
        didPaintInDrag = true;
      }
    }
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!currentMesh || numFaces === 0) return;

    if (toolMode === 'radius') {
      const ring = document.getElementById('radius-cursor-ring');
      if (ring) {
        ring.style.display = 'block';
        ring.style.left = e.clientX + 'px';
        ring.style.top = e.clientY + 'px';
        ring.style.width = (selectionRadiusPx * 2) + 'px';
        ring.style.height = (selectionRadiusPx * 2) + 'px';
      }
    }

    if (toolMode === 'radius' && isRadiusSelecting && (e.buttons === 1)) {
      executeRadiusSelect(e.clientX, e.clientY, true);
      return;
    }

    if (isBoxSelecting) {
      const minX = Math.min(boxStartPos.x, e.clientX);
      const maxX = Math.max(boxStartPos.x, e.clientX);
      const minY = Math.min(boxStartPos.y, e.clientY);
      const maxY = Math.max(boxStartPos.y, e.clientY);
      const marquee = document.getElementById('selection-marquee');
      if (marquee) {
        marquee.style.left = minX + 'px';
        marquee.style.top = minY + 'px';
        marquee.style.width = (maxX - minX) + 'px';
        marquee.style.height = (maxY - minY) + 'px';
      }
      return;
    }

    if (isPainting && e.shiftKey && (e.buttons === 1)) {
      const pId = getPartUnderPointer(e.clientX, e.clientY);
      if (pId !== -1 && partGroup[pId] !== activeBrushGroup) {
        partGroup[pId] = activeBrushGroup;
        if (activeBrushGroup > 2) userCreatedGroups.add(activeBrushGroup);
        writePartSliceColor(pId, 'base');
        paintDirty = true;
        didPaintInDrag = true;
      }
      return;
    }

    if (toolMode === 'subsplit') {
      const faceIdx = getFaceUnderPointer(e.clientX, e.clientY);
      if (faceIdx !== -1) {
        renderer.domElement.style.cursor = 'cell';
        if (faceIdx !== subSplitHoverFace) {
          clearSubSplitPreview();
          const subAngleEl = document.getElementById('sub-angle-slider');
          const subAngle = subAngleEl ? parseFloat(subAngleEl.value) : 12;
          const subPatch = computeSubPatchAtFace(faceIdx, subAngle);
          if (subPatch && subPatch.faces.length > 0) {
            subSplitHoverFace = faceIdx;
            subSplitHoverFaces = subPatch.faces;
            subSplitHoverParentPart = subPatch.parentPart;
            writeFaceSliceColor(subSplitHoverFaces, subSplitHoverParentPart, 'hover');
            const pId = subPatch.parentPart;
            const g = partGroup ? partGroup[pId] : 1;
            const gName = getGroupName(g);
            if (inspector) {
              inspector.style.display = 'block';
              inspector.innerHTML = `<b>Sub-Patch Preview</b> (${subPatch.faces.length.toLocaleString()} of ${partFaces[pId].length.toLocaleString()} faces)<br>Parent: <b>Part #${pId + 1}</b> (${escapeHtml(gName)}) &bull; <b>Click</b> to split &amp; reassign`;
            }
          }
        }
      } else {
        renderer.domElement.style.cursor = 'default';
        if (inspector) inspector.style.display = 'none';
        clearSubSplitPreview();
      }
      return;
    }

    if (subSplitHoverFaces) clearSubSplitPreview();

    const pId = getPartUnderPointer(e.clientX, e.clientY);

    if (pId !== -1) {
      if (toolMode === 'brush') renderer.domElement.style.cursor = 'pointer';

      if (pId !== hoveredPartId) {
        if (hoveredPartId !== -1 && !selectedPartIds.has(hoveredPartId)) writePartSliceColor(hoveredPartId, 'base');
        hoveredPartId = pId;
        if (hoveredPartId !== -1 && !selectedPartIds.has(hoveredPartId)) writePartSliceColor(hoveredPartId, 'hover');
      }

      const g = partGroup ? partGroup[pId] : 1;
      const gName = getGroupName(g);
      const cnt = partFaces[pId] ? partFaces[pId].length : 0;
      if (inspector) {
        inspector.style.display = 'block';
        inspector.innerHTML = `<b>Part #${pId + 1}</b> (${cnt.toLocaleString()} faces)<br>Category: <b>${escapeHtml(gName)}</b> &bull; Click/Shift+Click to select`;
      }
    } else {
      if (toolMode === 'brush') renderer.domElement.style.cursor = 'default';
      if (inspector) inspector.style.display = 'none';
      if (hoveredPartId !== -1) {
        if (!selectedPartIds.has(hoveredPartId)) writePartSliceColor(hoveredPartId, 'base');
        hoveredPartId = -1;
      }
    }
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    const ring = document.getElementById('radius-cursor-ring');
    if (ring) ring.style.display = 'none';
    clearSubSplitPreview();
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    controls.enabled = true;
    isPainting = false;

    if (paintDirty) { paintDirty = false; updateLiveStats(); }

    if (isBoxSelecting) {
      isBoxSelecting = false;
      const marquee = document.getElementById('selection-marquee');
      if (marquee) marquee.style.display = 'none';
      const dist = Math.hypot(e.clientX - boxStartPos.x, e.clientY - boxStartPos.y);
      if (dist < 5) {
        const pId = getPartUnderPointer(e.clientX, e.clientY);
        if (pId !== -1) {
          if (e.shiftKey && selectedPartIds.has(pId)) {
            selectedPartIds.delete(pId); writePartSliceColor(pId, 'base');
          } else {
            selectedPartIds.add(pId); writePartSliceColor(pId, 'selected');
          }
          if (selectedPartIds.size > 0) openGroupPopup(e.clientX, e.clientY);
          else closeGroupPopup();
        } else if (!e.shiftKey) {
          clearSelection(); closeGroupPopup();
        }
      } else {
        executeBoxSelect(boxStartPos.x, boxStartPos.y, e.clientX, e.clientY);
      }
      updateSelectionUI();
      return;
    }

    if (isRadiusSelecting) {
      isRadiusSelecting = false;
      if (selectedPartIds.size > 0) openGroupPopup(e.clientX, e.clientY);
      else closeGroupPopup();
      updateSelectionUI();
      return;
    }

    if (toolMode === 'radius') return;

    if (e.button !== 0) return;
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    const duration = performance.now() - pointerDownTime;
    if (dist > 6 || duration > 500 || didPaintInDrag) return;
    if (!currentMesh || numFaces === 0) return;

    if (toolMode === 'subsplit') {
      const faceIdx = getFaceUnderPointer(e.clientX, e.clientY);
      if (faceIdx !== -1) {
        const subAngleEl = document.getElementById('sub-angle-slider');
        const subAngle = subAngleEl ? parseFloat(subAngleEl.value) : 12;
        const subPatch = computeSubPatchAtFace(faceIdx, subAngle);
        if (subPatch && subPatch.faces.length > 0) {
          const parentPartId = subPatch.parentPart;
          const parentFaces = partFaces[parentPartId];
          if (subPatch.faces.length >= parentFaces.length) {
            clearSelection();
            selectedPartIds.add(parentPartId);
            writePartSliceColor(parentPartId, 'selected');
            openGroupPopup(e.clientX, e.clientY);
            updateSelectionUI();
            return;
          }
          const subSet = new Set(subPatch.faces);
          partFaces[parentPartId] = parentFaces.filter(f => !subSet.has(f));
          const newPartId = numParts++;
          partFaces.push(subPatch.faces);
          const initialG = partGroup[parentPartId] || 1;
          partGroup.push(initialG);
          initialPartGroup.push(initialG);
          for (let i = 0; i < subPatch.faces.length; i++) partOfFace[subPatch.faces[i]] = newPartId;
          computePartSpatialData();
          clearSelection();
          selectedPartIds.add(newPartId);
          writePartSliceColor(newPartId, 'selected');
          openGroupPopup(e.clientX, e.clientY);
          updateSelectionUI();
          updateLiveStats();
          const sp = document.getElementById('stat-parts');
          if (sp) sp.textContent = numParts.toLocaleString();
        }
      }
      return;
    }

    const pId = getPartUnderPointer(e.clientX, e.clientY);
    if (pId !== -1) {
      if (e.shiftKey) {
        if (selectedPartIds.has(pId)) { selectedPartIds.delete(pId); writePartSliceColor(pId, 'base'); }
        else { selectedPartIds.add(pId); writePartSliceColor(pId, 'selected'); }
        if (selectedPartIds.size > 0) openGroupPopup(e.clientX, e.clientY);
        else closeGroupPopup();
      } else {
        clearSelection();
        selectedPartIds.add(pId);
        writePartSliceColor(pId, 'selected');
        openGroupPopup(e.clientX, e.clientY);
      }
    } else {
      if (!e.shiftKey) clearSelection();
      closeGroupPopup();
    }
    updateSelectionUI();
  });

  return {
    selectedPartIds,
    get activeBrushGroup() { return activeBrushGroup; },
    set activeBrushGroup(v) { activeBrushGroup = v; },
    get hoveredPartId() { return hoveredPartId; },
    set hoveredPartId(v) { hoveredPartId = v; },
    get isolatedCategory() { return isolatedCategory; },
    set isolatedCategory(v) { isolatedCategory = v; },
    get toolMode() { return toolMode; },
    set toolMode(v) { toolMode = v; },
    get selectionRadiusPx() { return selectionRadiusPx; },
    set selectionRadiusPx(v) { selectionRadiusPx = v; },
    setActiveBrushGroup,
    setToolMode,
    updateSelectionUI,
    assignSelectionToActiveBrush,
    handleCategoryCardClick,
    executeBoxSelect,
    executeRadiusSelect,
    clearSelection,
    assignSelectionToGroup,
    getPartUnderPointer,
    getFaceUnderPointer
  };
});
