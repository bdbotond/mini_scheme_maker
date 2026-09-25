/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Main Application Runtime: Scene Setup, Tool Interactions, UI Events, Settings & Gizmo
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.App = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Multi-Selection & Painting State
  const selectedPartIds = new Set();
  let activeBrushGroup = 1;
  let hoveredPartId = -1;
  let isolatedCategory = -1;
  let isPainting = false;
  let paintDirty = false;

  // Scene setup
  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  const camera = new THREE.PerspectiveCamera(45, (container ? container.clientWidth / container.clientHeight : 1), 0.1, 2000);
  camera.position.set(0, 40, 90);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (container) {
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  if (container) {
    container.appendChild(renderer.domElement);
  }

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  // Smooth, balanced studio lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0d5dd, 0.3);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  const cameraLight = new THREE.DirectionalLight(0xffffff, 0.3);
  cameraLight.position.set(0, 10, 30);
  camera.add(cameraLight);

  const backFillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  backFillLight.position.set(0, -10, -30);
  camera.add(backFillLight);
  scene.add(camera);

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

  // Tool Modes: 'brush', 'box', 'radius', 'subsplit'
  let toolMode = 'brush';
  let selectionRadiusPx = 35;
  let isBoxSelecting = false;
  let isRadiusSelecting = false;
  let boxStartPos = { x: 0, y: 0 };

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

    if (edgeDetectionPanel) {
      edgeDetectionPanel.style.display = mode === 'brush' ? 'block' : 'none';
    }

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

    if (typeof clearSubSplitPreview === 'function' && mode !== 'subsplit') {
      clearSubSplitPreview();
    }

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
      selectedPartIds.forEach(p => {
        if (partFaces[p]) totalFaces += partFaces[p].length;
      });
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
            if (sx >= xMin && sx <= xMax && sy >= yMin && sy <= yMax) {
              isInBox = true;
              break;
            }
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

    if (selectedPartIds.size > 0) {
      openGroupPopup(endX, endY);
    } else {
      closeGroupPopup();
    }
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

      const dist = Math.hypot(screenX - clientX, screenY - clientY);
      if (dist <= selectionRadiusPx) {
        camDir.subVectors(camera.position, worldPos).normalize();
        normal.set(partNormals[p * 3], partNormals[p * 3 + 1], partNormals[p * 3 + 2]);
        if (normal.dot(camDir) > -0.25) {
          selectedPartIds.add(p);
          writePartSliceColor(p, 'selected');
        }
      }
    }

    if (!skipPopupUpdate) {
      if (selectedPartIds.size > 0) {
        openGroupPopup(clientX, clientY);
      } else {
        closeGroupPopup();
      }
    }
    updateSelectionUI();
  }

  function clearSelection() {
    selectedPartIds.forEach(p => {
      writePartSliceColor(p, 'base');
    });
    selectedPartIds.clear();
    updateSelectionUI();
  }

  // Interactive Reassignment Popup
  const popup = document.getElementById('group-popup');
  const popupInput = document.getElementById('popup-group-input');
  const popupPartBadge = document.getElementById('popup-part-badge');
  const popupFaceCount = document.getElementById('popup-face-count');
  const popupPills = document.getElementById('popup-pills');
  const popupPromptText = document.getElementById('popup-prompt-text');

  function openGroupPopup(clientX, clientY) {
    if (!popup || selectedPartIds.size === 0) return;

    let totalSelectedFaces = 0;
    selectedPartIds.forEach(pId => {
      if (partFaces[pId]) totalSelectedFaces += partFaces[pId].length;
    });

    if (selectedPartIds.size === 1) {
      const pId = selectedPartIds.values().next().value;
      if (popupPartBadge) popupPartBadge.textContent = `Part #${pId + 1}`;
      if (popupFaceCount) popupFaceCount.textContent = `${totalSelectedFaces.toLocaleString()} faces`;
      if (popupPromptText) popupPromptText.textContent = `Reassign Part #${pId + 1} to:`;
      const currGroup = partGroup[pId];
      [1, 2].forEach(g => {
        const btn = document.getElementById(`choice-g${g}`);
        if (btn) btn.classList.toggle('active', currGroup === g);
        const nameEl = document.getElementById(`popup-name-g${g}`);
        if (nameEl) nameEl.textContent = getGroupName(g, true);
        const dotEl = document.getElementById(`choice-dot-${g}`);
        if (dotEl) dotEl.style.background = getGroupColorHex(g);
        const hexEl = document.getElementById(`popup-hex-g${g}`);
        if (hexEl) hexEl.textContent = getGroupColorHex(g);
      });
      if (popupInput) popupInput.value = currGroup > 2 ? currGroup : getNextCustomGroupNumber();
    } else {
      if (popupPartBadge) popupPartBadge.textContent = `${selectedPartIds.size} Parts Selected`;
      if (popupFaceCount) popupFaceCount.textContent = `${totalSelectedFaces.toLocaleString()} faces`;
      if (popupPromptText) popupPromptText.textContent = `Reassign ${selectedPartIds.size} selected parts to:`;
      [1, 2].forEach(g => {
        const btn = document.getElementById(`choice-g${g}`);
        if (btn) btn.classList.remove('active');
        const nameEl = document.getElementById(`popup-name-g${g}`);
        if (nameEl) nameEl.textContent = getGroupName(g, true);
        const dotEl = document.getElementById(`choice-dot-${g}`);
        if (dotEl) dotEl.style.background = getGroupColorHex(g);
        const hexEl = document.getElementById(`popup-hex-g${g}`);
        if (hexEl) hexEl.textContent = getGroupColorHex(g);
      });
      if (popupInput) popupInput.value = getNextCustomGroupNumber();
    }

    const allGroups = new Set([...(partGroup || []), ...userCreatedGroups].filter(g => g > 2));
    const customGroups = Array.from(allGroups).sort((a,b) => a - b);
    
    let pillsHtml = '';
    for (const g of customGroups) {
      const col = getGroupColorHex(g);
      pillsHtml += `<div class="group-pill" onclick="assignSelectionToGroup(${g})"><span style="width: 8px; height: 8px; border-radius: 2px; background: ${col}; display: inline-block;"></span>${escapeHtml(getGroupName(g, true))} <span class="group-color-hex" style="padding: 0 3px; font-size: 9px; cursor: default;">${col}</span></div>`;
    }
    
    const nextG = getNextCustomGroupNumber();
    pillsHtml += `<div class="group-pill" style="border-color: #3b82f6; color: #60a5fa;" onclick="assignSelectionToGroup(${nextG})">+ Group ${nextG}</div>`;
    if (popupPills) popupPills.innerHTML = pillsHtml;

    if (typeof clientX !== 'number' || isNaN(clientX)) clientX = Math.round(window.innerWidth / 2 - 140);
    if (typeof clientY !== 'number' || isNaN(clientY)) clientY = Math.round(window.innerHeight / 2 - 130);
    let posX = clientX + 12;
    let posY = clientY + 12;
    if (posX + 285 > window.innerWidth) posX = clientX - 290;
    if (posY + 270 > window.innerHeight) posY = clientY - 260;
    popup.style.left = Math.max(15, posX) + 'px';
    popup.style.top = Math.max(15, posY) + 'px';
    popup.style.display = 'block';
  }

  function closeGroupPopup() {
    if (popup) popup.style.display = 'none';
  }

  function assignSelectionToGroup(groupNum) {
    groupNum = parseInt(groupNum, 10);
    if (isNaN(groupNum) || groupNum < 1 || selectedPartIds.size === 0) return;

    if (groupNum > 2) {
      userCreatedGroups.add(groupNum);
      if (!groupColors.has(groupNum)) {
        groupColors.set(groupNum, getGroupColorHex(groupNum));
      }
    }

    selectedPartIds.forEach(pId => {
      partGroup[pId] = groupNum;
      writePartSliceColor(pId, 'base');
    });

    selectedPartIds.clear();
    if (popup) popup.style.display = 'none';
    updateSelectionUI();
    updateLiveStats();
  }

  function handlePopupSubmit(e) {
    e.preventDefault();
    if (popupInput) assignSelectionToGroup(popupInput.value);
  }

  // Keyboard Shortcuts
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
      if (selectedPartIds.size > 0) {
        assignSelectionToGroup(groupNum);
      } else {
        setActiveBrushGroup(groupNum);
      }
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

  // Pointer Events
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
      if (!e.shiftKey) {
        clearSelection();
      }
      return;
    }

    if (toolMode === 'radius') {
      controls.enabled = false;
      isRadiusSelecting = true;
      if (!e.shiftKey) {
        clearSelection();
      }
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

    if (subSplitHoverFaces) {
      clearSubSplitPreview();
    }

    const pId = getPartUnderPointer(e.clientX, e.clientY);

    if (pId !== -1) {
      if (toolMode === 'brush') renderer.domElement.style.cursor = 'pointer';

      if (pId !== hoveredPartId) {
        if (hoveredPartId !== -1 && !selectedPartIds.has(hoveredPartId)) {
          writePartSliceColor(hoveredPartId, 'base');
        }
        hoveredPartId = pId;
        if (hoveredPartId !== -1 && !selectedPartIds.has(hoveredPartId)) {
          writePartSliceColor(hoveredPartId, 'hover');
        }
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
        if (!selectedPartIds.has(hoveredPartId)) {
          writePartSliceColor(hoveredPartId, 'base');
        }
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

    if (paintDirty) {
      paintDirty = false;
      updateLiveStats();
    }

    if (isBoxSelecting) {
      isBoxSelecting = false;
      const marquee = document.getElementById('selection-marquee');
      if (marquee) marquee.style.display = 'none';

      const dist = Math.hypot(e.clientX - boxStartPos.x, e.clientY - boxStartPos.y);
      if (dist < 5) {
        const pId = getPartUnderPointer(e.clientX, e.clientY);
        if (pId !== -1) {
          if (e.shiftKey && selectedPartIds.has(pId)) {
            selectedPartIds.delete(pId);
            writePartSliceColor(pId, 'base');
          } else {
            selectedPartIds.add(pId);
            writePartSliceColor(pId, 'selected');
          }
          if (selectedPartIds.size > 0) openGroupPopup(e.clientX, e.clientY);
          else closeGroupPopup();
        } else if (!e.shiftKey) {
          clearSelection();
          closeGroupPopup();
        }
      } else {
        executeBoxSelect(boxStartPos.x, boxStartPos.y, e.clientX, e.clientY);
      }
      updateSelectionUI();
      return;
    }

    if (isRadiusSelecting) {
      isRadiusSelecting = false;
      if (selectedPartIds.size > 0) {
        openGroupPopup(e.clientX, e.clientY);
      } else {
        closeGroupPopup();
      }
      updateSelectionUI();
      return;
    }

    if (toolMode === 'radius') {
      return;
    }

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
          const remainingParentFaces = parentFaces.filter(f => !subSet.has(f));
          partFaces[parentPartId] = remainingParentFaces;

          const newPartId = numParts++;
          partFaces.push(subPatch.faces);
          const initialG = partGroup[parentPartId] || 1;
          partGroup.push(initialG);
          initialPartGroup.push(initialG);

          for (let i = 0; i < subPatch.faces.length; i++) {
            partOfFace[subPatch.faces[i]] = newPartId;
          }

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
        if (selectedPartIds.has(pId)) {
          selectedPartIds.delete(pId);
          writePartSliceColor(pId, 'base');
        } else {
          selectedPartIds.add(pId);
          writePartSliceColor(pId, 'selected');
        }
        if (selectedPartIds.size > 0) {
          openGroupPopup(e.clientX, e.clientY);
        } else {
          closeGroupPopup();
        }
      } else {
        clearSelection();
        selectedPartIds.add(pId);
        writePartSliceColor(pId, 'selected');
        openGroupPopup(e.clientX, e.clientY);
      }
    } else {
      if (!e.shiftKey) {
        clearSelection();
      }
      closeGroupPopup();
    }
    updateSelectionUI();
  });

  function getPartUnderPointer(clientX, clientY) {
    if (!currentMesh || numFaces === 0) return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentMesh);
    if (hits.length > 0) {
      const faceIdx = hits[0].faceIndex;
      if (partOfFace && faceIdx < partOfFace.length) {
        return partOfFace[faceIdx];
      }
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
    if (hits.length > 0) {
      return hits[0].faceIndex;
    }
    return -1;
  }

  // Geometry Loading
  function setupGeometry(geom, filename = "Model") {
    loadedFileName = filename;
    const loading = document.getElementById('loading-indicator');
    if (loading) loading.style.display = 'block';
    clearSubSplitPreview();
    selectedPartIds.clear();
    closeGroupPopup();

    setTimeout(() => {
      try {
        geom = geom.toNonIndexed();
        geom.computeVertexNormals();

        geom.computeBoundingBox();
        const size = geom.boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        geom.center();

        numFaces = geom.attributes.position.count / 3;
        if (numFaces === 0) throw new Error("No faces found in geometry");

        const sn = document.getElementById('stat-name');
        if (sn) sn.textContent = filename;
        const sf = document.getElementById('stat-faces');
        if (sf) sf.textContent = numFaces.toLocaleString();

        const colorsArr = new Float32Array(geom.attributes.position.count * 3);
        geom.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

        buildMeshTopology(geom.attributes.position.array, numFaces);
        const sa = document.getElementById('stat-area');
        if (sa) sa.textContent = totalMeshArea.toFixed(1);

        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.04
        });

        if (currentMesh) {
          currentMesh.geometry.dispose();
          if (Array.isArray(currentMesh.material)) {
            currentMesh.material.forEach(m => m.dispose());
          } else if (currentMesh.material) {
            currentMesh.material.dispose();
          }
          scene.remove(currentMesh);
        }
        currentMesh = new THREE.Mesh(geom, mat);
        scene.add(currentMesh);

        autoCalibrateAndSegment();

        camera.position.set(0, maxDim * 0.7, maxDim * 1.6);
        controls.target.set(0, 0, 0);
        controls.update();

        const dropOverlay = document.getElementById('drop-overlay');
        if (dropOverlay) {
          dropOverlay.classList.add('hidden');
          dropOverlay.classList.remove('drag-active');
        }

        if (!gizmoRenderer) initGizmo();
        const gc = document.getElementById('gizmo-canvas');
        if (gc) gc.style.display = 'block';

        showToast(`Loaded ${filename} (${numFaces.toLocaleString()} tris)`, "success");
      } catch (err) {
        console.error("Geometry processing error:", err);
        showToast("Error processing mesh: " + (err.message || err), "error");
      } finally {
        if (loading) loading.style.display = 'none';
      }
    }, 20);
  }

  function loadFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();

    if (!name.endsWith('.stl') && !name.endsWith('.obj')) {
      showToast("Unsupported file. Please open a .STL or .OBJ 3D mesh.", "warning");
      return;
    }

    const reader = new FileReader();

    if (name.endsWith('.stl')) {
      reader.onload = (e) => {
        try {
          const geom = new THREE.STLLoader().parse(e.target.result);
          setupGeometry(geom, file.name);
        } catch (err) {
          console.error(err);
          showToast("Failed to parse STL: " + (err.message || "Invalid file format"), "error");
        }
      };
      reader.onerror = () => showToast("Error reading file", "error");
      reader.readAsArrayBuffer(file);
    } else if (name.endsWith('.obj')) {
      reader.onload = (e) => {
        try {
          const obj = new THREE.OBJLoader().parse(e.target.result);
          let foundGeom = null;
          let maxVerts = 0;
          obj.traverse(c => {
            if (c.isMesh && c.geometry && c.geometry.attributes.position) {
              const count = c.geometry.attributes.position.count;
              if (count > maxVerts) {
                maxVerts = count;
                foundGeom = c.geometry;
              }
            }
          });
          if (foundGeom) {
            setupGeometry(foundGeom, file.name);
          } else {
            showToast("No 3D mesh geometry found in OBJ file", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to parse OBJ: " + (err.message || "Invalid file format"), "error");
        }
      };
      reader.onerror = () => showToast("Error reading file", "error");
      reader.readAsText(file);
    }
  }

  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        loadFile(e.target.files[0]);
      }
    });
  }

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    const overlay = document.getElementById('drop-overlay');
    if (overlay) overlay.classList.add('drag-active');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      const overlay = document.getElementById('drop-overlay');
      if (overlay) overlay.classList.remove('drag-active');
    }
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const overlay = document.getElementById('drop-overlay');
    if (overlay) overlay.classList.remove('drag-active');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  // Slider events
  const hs = document.getElementById('hardness-slider');
  if (hs) {
    hs.addEventListener('input', (e) => {
      const hv = document.getElementById('hardness-val');
      if (hv) hv.textContent = e.target.value + '°';
    });
    hs.addEventListener('change', runSegmentation);
  }

  const as = document.getElementById('area-slider');
  if (as) {
    as.addEventListener('input', (e) => {
      const av = document.getElementById('area-val');
      if (av) av.textContent = parseFloat(e.target.value).toFixed(1) + '%';
    });
    as.addEventListener('change', runSegmentation);
  }

  const els = document.getElementById('edge-len-slider');
  if (els) {
    els.addEventListener('input', (e) => {
      const elv = document.getElementById('edge-len-val');
      if (elv) elv.textContent = e.target.value + ' edges';
    });
    els.addEventListener('change', runSegmentation);
  }

  const ess = document.getElementById('edge-straight-slider');
  if (ess) {
    ess.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const esv = document.getElementById('edge-straight-val');
      if (esv) esv.textContent = val === 0 ? '0.0 (Off)' : val.toFixed(2);
    });
    ess.addEventListener('change', runSegmentation);
  }

  const sas = document.getElementById('sub-angle-slider');
  if (sas) {
    sas.addEventListener('input', (e) => {
      const sav = document.getElementById('sub-angle-val');
      if (sav) sav.textContent = e.target.value + '°';
      if (toolMode === 'subsplit' && subSplitHoverFace !== -1) {
        const faceIdx = subSplitHoverFace;
        clearSubSplitPreview();
        const subAngle = parseFloat(e.target.value) || 12;
        const subPatch = computeSubPatchAtFace(faceIdx, subAngle);
        if (subPatch && subPatch.faces.length > 0) {
          subSplitHoverFace = faceIdx;
          subSplitHoverFaces = subPatch.faces;
          subSplitHoverParentPart = subPatch.parentPart;
          writeFaceSliceColor(subSplitHoverFaces, subSplitHoverParentPart, 'hover');
        }
      }
    });
  }

  window.addEventListener('resize', () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // Gizmo Cube
  let gizmoRenderer = null, gizmoScene = null, gizmoCamera = null;
  const _gizmoDir = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);

    if (gizmoRenderer && gizmoScene && gizmoCamera) {
      _gizmoDir.subVectors(camera.position, controls.target).normalize().multiplyScalar(3.5);
      gizmoCamera.position.copy(_gizmoDir);
      gizmoCamera.lookAt(0, 0, 0);
      gizmoRenderer.render(gizmoScene, gizmoCamera);
    }
  }

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
    } catch(e) {}
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

    ['brush','box','radius','subsplit'].forEach(t => {
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
      const el = document.getElementById('setting-orbit');
      appSettings.orbitSpeed = parseFloat(el.value);
      const v = document.getElementById('setting-orbit-val');
      if (v) v.textContent = appSettings.orbitSpeed.toFixed(1);
      controls.rotateSpeed = appSettings.orbitSpeed;
    } else if (type === 'pan') {
      const el = document.getElementById('setting-pan');
      appSettings.panSpeed = parseFloat(el.value);
      const v = document.getElementById('setting-pan-val');
      if (v) v.textContent = appSettings.panSpeed.toFixed(1);
      controls.panSpeed = appSettings.panSpeed;
    } else if (type === 'zoom') {
      const el = document.getElementById('setting-zoom');
      appSettings.zoomSpeed = parseFloat(el.value);
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

  let gizmoCubeMeshes = [];
  const GIZMO_FACES = [
    { label:'F', normal:[0,0,1] },
    { label:'B', normal:[0,0,-1] },
    { label:'R', normal:[1,0,0] },
    { label:'L', normal:[-1,0,0] },
    { label:'T', normal:[0,1,0] },
    { label:'Bo', normal:[0,-1,0] },
  ];

  function initGizmo() {
    const canvas = document.getElementById('gizmo-canvas');
    if (!canvas) return;

    const W = 90, H = 90;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;

    gizmoRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    gizmoRenderer.setPixelRatio(window.devicePixelRatio);
    gizmoRenderer.setSize(W, H);
    gizmoRenderer.setClearColor(0x000000, 0);

    gizmoScene = new THREE.Scene();
    gizmoCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    gizmoCamera.position.set(0, 0, 3.5);

    const faceColors = [0x4f80ff,0x2a4da8,0x3b82f6,0x1d4ed8,0x60a5fa,0x1e3a6e];
    const faceData = [
      { pos:[0,0,0.51], rot:[0,0,0] },
      { pos:[0,0,-0.51], rot:[0,Math.PI,0] },
      { pos:[0.51,0,0], rot:[0,-Math.PI/2,0] },
      { pos:[-0.51,0,0], rot:[0,Math.PI/2,0] },
      { pos:[0,0.51,0], rot:[-Math.PI/2,0,0] },
      { pos:[0,-0.51,0], rot:[Math.PI/2,0,0] },
    ];

    const edgeGeo = new THREE.BoxGeometry(1,1,1);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 });
    gizmoScene.add(new THREE.LineSegments(new THREE.EdgesGeometry(edgeGeo), edgeMat));

    gizmoCubeMeshes = [];
    GIZMO_FACES.forEach((face, i) => {
      const geo = new THREE.PlaneGeometry(0.88, 0.88);
      const mat = new THREE.MeshBasicMaterial({ color: faceColors[i], transparent: true, opacity: 0.82, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      const fd = faceData[i];
      mesh.position.set(...fd.pos);
      mesh.rotation.set(...fd.rot);
      mesh.userData.faceIdx = i;
      gizmoScene.add(mesh);
      gizmoCubeMeshes.push(mesh);
    });

    GIZMO_FACES.forEach((face, i) => {
      const tc = document.createElement('canvas'); tc.width = 64; tc.height = 64;
      const ctx = tc.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(face.label, 32, 32);
      const tex = new THREE.CanvasTexture(tc);
      const lmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthTest: false });
      const lmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), lmat);
      const fd = faceData[i];
      lmesh.position.set(fd.pos[0]*1.001, fd.pos[1]*1.001, fd.pos[2]*1.001);
      lmesh.rotation.set(...fd.rot);
      gizmoScene.add(lmesh);
    });

    gizmoScene.add(new THREE.AmbientLight(0xffffff, 1));

    const gRaycaster = new THREE.Raycaster();
    const gMouse = new THREE.Vector2();
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      gMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      gMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      gRaycaster.setFromCamera(gMouse, gizmoCamera);
      const hits = gRaycaster.intersectObjects(gizmoCubeMeshes);
      if (hits.length > 0) {
        const fIdx = hits[0].object.userData.faceIdx;
        snapCameraToFace(fIdx);
      }
    });

    canvas.style.display = 'block';
  }

  let cameraTween = null;
  function snapCameraToFace(faceIdx) {
    const face = GIZMO_FACES[faceIdx];
    const dist = camera.position.distanceTo(controls.target) || 90;
    const target = controls.target.clone();
    const normal = new THREE.Vector3(...face.normal);
    const endPos = target.clone().add(normal.multiplyScalar(dist));

    const startPos = camera.position.clone();
    const startTime = performance.now();
    const duration = 400;

    if (cameraTween) cancelAnimationFrame(cameraTween);
    function tween() {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, endPos, ease);
      camera.lookAt(controls.target);
      controls.update();
      if (t < 1) cameraTween = requestAnimationFrame(tween);
    }
    tween();
  }

  // Initialization
  loadSettings();
  animate();
  updateLiveStats();
  initPaintBrands();
  renderPaintGroupsList();

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
    scene,
    camera,
    renderer,
    controls,
    setActiveBrushGroup,
    setToolMode,
    updateSelectionUI,
    assignSelectionToActiveBrush,
    handleCategoryCardClick,
    executeBoxSelect,
    executeRadiusSelect,
    clearSelection,
    openGroupPopup,
    closeGroupPopup,
    assignSelectionToGroup,
    handlePopupSubmit,
    getPartUnderPointer,
    getFaceUnderPointer,
    setupGeometry,
    loadFile,
    initGizmo,
    snapCameraToFace,
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
