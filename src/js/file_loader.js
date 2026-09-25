/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * File Loader: STL/OBJ drag-drop and file-input parsing, geometry setup
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.FileLoader = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function setupGeometry(geom, filename) {
    filename = filename || 'Model';
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
        if (numFaces === 0) throw new Error('No faces found in geometry');

        const sn = document.getElementById('stat-name');
        if (sn) sn.textContent = filename;
        const sf = document.getElementById('stat-faces');
        if (sf) sf.textContent = numFaces.toLocaleString();

        const colorsArr = new Float32Array(geom.attributes.position.count * 3);
        geom.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

        buildMeshTopology(geom.attributes.position.array, numFaces);
        const sa = document.getElementById('stat-area');
        if (sa) sa.textContent = totalMeshArea.toFixed(1);

        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.04 });

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

        showToast(`Loaded ${filename} (${numFaces.toLocaleString()} tris)`, 'success');
      } catch (err) {
        console.error('Geometry processing error:', err);
        showToast('Error processing mesh: ' + (err.message || err), 'error');
      } finally {
        if (loading) loading.style.display = 'none';
      }
    }, 20);
  }

  function loadFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();

    if (!name.endsWith('.stl') && !name.endsWith('.obj')) {
      showToast('Unsupported file. Please open a .STL or .OBJ 3D mesh.', 'warning');
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
          showToast('Failed to parse STL: ' + (err.message || 'Invalid file format'), 'error');
        }
      };
      reader.onerror = () => showToast('Error reading file', 'error');
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
              if (count > maxVerts) { maxVerts = count; foundGeom = c.geometry; }
            }
          });
          if (foundGeom) {
            setupGeometry(foundGeom, file.name);
          } else {
            showToast('No 3D mesh geometry found in OBJ file', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to parse OBJ: ' + (err.message || 'Invalid file format'), 'error');
        }
      };
      reader.onerror = () => showToast('Error reading file', 'error');
      reader.readAsText(file);
    }
  }

  // File input
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) loadFile(e.target.files[0]);
    });
  }

  // Drag-and-drop
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
    if (e.dataTransfer && e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
  });

  return { setupGeometry, loadFile };
});
