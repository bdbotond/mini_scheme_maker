/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Popup: Interactive Part Reassignment Popup UI
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.Popup = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const popup = document.getElementById('group-popup');
  const popupInput = document.getElementById('popup-group-input');
  const popupPartBadge = document.getElementById('popup-part-badge');
  const popupFaceCount = document.getElementById('popup-face-count');
  const popupPills = document.getElementById('popup-pills');
  const popupPromptText = document.getElementById('popup-prompt-text');

  function openGroupPopup(clientX, clientY) {
    if (!popup || selectedPartIds.size === 0) return;

    let totalSelectedFaces = 0;
    selectedPartIds.forEach(pId => { if (partFaces[pId]) totalSelectedFaces += partFaces[pId].length; });

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
    const customGroups = Array.from(allGroups).sort((a, b) => a - b);

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

  function handlePopupSubmit(e) {
    e.preventDefault();
    if (popupInput) assignSelectionToGroup(popupInput.value);
  }

  return { openGroupPopup, closeGroupPopup, handlePopupSubmit };
});
