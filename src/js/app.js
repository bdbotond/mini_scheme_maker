/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * App Bootstrap: Animation loop, slider events, module initialization
 *
 * Depends (in load order):
 *   color_utils.js  → color math, group names/colors, toast
 *   mesh_topology.js → BFS segmentation, face coloring
 *   paint_manager.js → paint-brand matching, paint-groups UI
 *   exporters.js     → PLY / OBJ / CSV / PNG / HTML export
 *   scene.js         → Three.js renderer, camera, lights, controls
 *   selection.js     → multi-pick, box/radius select, brush painting
 *   popup.js         → part-reassignment popup
 *   gizmo.js         → orientation cube + camera snap
 *   settings.js      → theme, speed, keybinds, localStorage
 *   file_loader.js   → STL/OBJ parsing, drag-drop, geometry setup
 */

(function () {

  // ── Animation loop ────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    renderGizmo();
  }

  // ── Slider: Edge Detection Hardness ──────────────────────────────────────
  const hs = document.getElementById('hardness-slider');
  if (hs) {
    hs.addEventListener('input', (e) => {
      const hv = document.getElementById('hardness-val');
      if (hv) hv.textContent = e.target.value + '°';
    });
    hs.addEventListener('change', runSegmentation);
  }

  // ── Slider: Smooth Patch Min Area ─────────────────────────────────────────
  const as = document.getElementById('area-slider');
  if (as) {
    as.addEventListener('input', (e) => {
      const av = document.getElementById('area-val');
      if (av) av.textContent = parseFloat(e.target.value).toFixed(1) + '%';
    });
    as.addEventListener('change', runSegmentation);
  }

  // ── Slider: Min Feature Edge Length ───────────────────────────────────────
  const els = document.getElementById('edge-len-slider');
  if (els) {
    els.addEventListener('input', (e) => {
      const elv = document.getElementById('edge-len-val');
      if (elv) elv.textContent = e.target.value + ' edges';
    });
    els.addEventListener('change', runSegmentation);
  }

  // ── Slider: Edge Straightness Filter ──────────────────────────────────────
  const ess = document.getElementById('edge-straight-slider');
  if (ess) {
    ess.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const esv = document.getElementById('edge-straight-val');
      if (esv) esv.textContent = val === 0 ? '0.0 (Off)' : val.toFixed(2);
    });
    ess.addEventListener('change', runSegmentation);
  }

  // ── Secondary Brush Sliders ──────────────────────────────────────────────
  const shs = document.getElementById('sec-hardness-slider');
  if (shs) {
    shs.addEventListener('input', (e) => {
      const shv = document.getElementById('sec-hardness-val');
      if (shv) shv.textContent = e.target.value + '°';
    });
    shs.addEventListener('change', runSecondarySegmentation);
  }

  const sas2 = document.getElementById('sec-area-slider');
  if (sas2) {
    sas2.addEventListener('input', (e) => {
      const sav = document.getElementById('sec-area-val');
      if (sav) sav.textContent = parseFloat(e.target.value).toFixed(1) + '%';
    });
    sas2.addEventListener('change', runSecondarySegmentation);
  }

  const sels = document.getElementById('sec-edge-len-slider');
  if (sels) {
    sels.addEventListener('input', (e) => {
      const selv = document.getElementById('sec-edge-len-val');
      if (selv) selv.textContent = e.target.value + ' edges';
    });
    sels.addEventListener('change', runSecondarySegmentation);
  }

  const sess = document.getElementById('sec-edge-straight-slider');
  if (sess) {
    sess.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const sesv = document.getElementById('sec-edge-straight-val');
      if (sesv) sesv.textContent = val === 0 ? '0.0 (Off)' : val.toFixed(2);
    });
    sess.addEventListener('change', runSecondarySegmentation);
  }

  // ── Slider: Sub-Split Angle (live preview) ────────────────────────────────
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

  // ── Startup ───────────────────────────────────────────────────────────────
  loadSettings();
  animate();
  updateLiveStats();
  initPaintBrands();
  renderPaintGroupsList();
  setupGroupDragSelect();
  if (typeof ShapeSegmentor !== 'undefined') {
    ShapeSegmentor.initShapeSegmentor(scene, camera, renderer, controls);
  }
  if (typeof loadDefaultProject === 'function') {
    loadDefaultProject();
  }
  if (typeof initTutorial === 'function') {
    initTutorial();
  }

})();
