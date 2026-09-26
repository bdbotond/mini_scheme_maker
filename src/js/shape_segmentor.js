/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Shape Segmentor: 3D Primitive Volumes (Box, Sphere, Cylinder)
 * Interactive TransformControls + Surface Intersection & Surgical Segmentation
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.ShapeSegmentor = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  let _scene = null;
  let _camera = null;
  let _renderer = null;
  let _orbitControls = null;

  let shapeRoot = null;
  let shapeMesh = null;
  let shapeOutline = null;
  let transformControls = null;

  let currentShapeType = 'box'; // 'box' | 'sphere' | 'cylinder'
  let currentTransformMode = 'translate'; // 'translate' | 'rotate' | 'scale'
  let isToolActive = false;
  let snapToClickActive = false;

  let intersectingFaces = [];
  let highlightedFaces = [];
  let isUpdatingUI = false;

  const matFill = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    roughness: 0.3,
    metalness: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const matLine = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.85,
    linewidth: 2
  });

  function createGeometryForType(type) {
    if (type === 'sphere') {
      return new THREE.SphereGeometry(0.5, 32, 20);
    } else if (type === 'cylinder') {
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    }
    // Default box
    return new THREE.BoxGeometry(1, 1, 1);
  }

  function createOutlineForType(type, geom) {
    if (type === 'sphere') {
      return new THREE.LineSegments(new THREE.WireframeGeometry(geom), matLine);
    } else if (type === 'cylinder') {
      return new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), matLine);
    }
    return new THREE.LineSegments(new THREE.EdgesGeometry(geom), matLine);
  }

  function initShapeSegmentor(scene, camera, renderer, orbitControls) {
    _scene = scene;
    _camera = camera;
    _renderer = renderer;
    _orbitControls = orbitControls;

    shapeRoot = new THREE.Group();
    shapeRoot.name = 'shape-segmentor-root';
    shapeRoot.visible = false;
    _scene.add(shapeRoot);

    rebuildShapeMesh();

    if (typeof THREE.TransformControls !== 'undefined') {
      transformControls = new THREE.TransformControls(_camera, _renderer.domElement);
      transformControls.size = 0.75;
      transformControls.setMode(currentTransformMode);
      transformControls.attach(shapeRoot);
      transformControls.enabled = false;
      transformControls.visible = false;

      transformControls.addEventListener('change', () => {
        if (!isToolActive) return;
        updateUIInputs();
        computeIntersection();
      });

      transformControls.addEventListener('dragging-changed', (event) => {
        if (_orbitControls) _orbitControls.enabled = !event.value;
      });

      _scene.add(transformControls);
    }

    bindUIEventListeners();
  }

  function rebuildShapeMesh() {
    if (!shapeRoot) return;

    // Preserve existing transform
    const pos = shapeRoot.position.clone();
    const rot = shapeRoot.rotation.clone();
    const sca = shapeRoot.scale.clone();

    // Clean old children
    while (shapeRoot.children.length > 0) {
      const child = shapeRoot.children[0];
      if (child.geometry) child.geometry.dispose();
      shapeRoot.remove(child);
    }

    const geom = createGeometryForType(currentShapeType);
    shapeMesh = new THREE.Mesh(geom, matFill);
    shapeOutline = createOutlineForType(currentShapeType, geom);

    shapeRoot.add(shapeMesh);
    shapeRoot.add(shapeOutline);

    shapeRoot.position.copy(pos);
    shapeRoot.rotation.copy(rot);
    shapeRoot.scale.copy(sca);
  }

  function setShapeType(type) {
    if (type !== 'box' && type !== 'sphere' && type !== 'cylinder') return;
    currentShapeType = type;
    rebuildShapeMesh();

    document.querySelectorAll('.shape-type-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-shape-${type}`);
    if (btn) btn.classList.add('active');

    computeIntersection();
  }

  function setTransformMode(mode) {
    if (mode !== 'translate' && mode !== 'rotate' && mode !== 'scale') return;
    currentTransformMode = mode;
    if (transformControls) {
      transformControls.setMode(mode);
    }

    document.querySelectorAll('.shape-transform-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-shape-mode-${mode}`);
    if (btn) btn.classList.add('active');
  }

  function activateShapeTool() {
    isToolActive = true;
    if (shapeRoot) {
      shapeRoot.visible = true;
      // If scale is default 1 and a mesh exists, scale to 30% of mesh bounding box
      if (shapeRoot.scale.x === 1 && shapeRoot.scale.y === 1 && shapeRoot.scale.z === 1) {
        resetShape();
      }
    }
    if (transformControls) {
      transformControls.enabled = true;
      transformControls.visible = true;
      transformControls.updateMatrixWorld();
    }
    updateUIInputs();
    computeIntersection();
  }

  function deactivateShapeTool() {
    isToolActive = false;
    clearHighlight();
    intersectingFaces = [];
    if (shapeRoot) shapeRoot.visible = false;
    if (transformControls) {
      transformControls.enabled = false;
      transformControls.visible = false;
    }
  }

  function clearHighlight() {
    if (highlightedFaces.length > 0 && typeof writeFaceSliceColor === 'function') {
      writeFaceSliceColor(highlightedFaces, -1, 'base');
      highlightedFaces = [];
    }
    updateIntersectCountUI(0);
  }

  function computeIntersection() {
    if (!isToolActive || !shapeRoot || typeof currentMesh === 'undefined' || !currentMesh) {
      clearHighlight();
      return;
    }

    const nFaces = typeof numFaces !== 'undefined' ? numFaces : 0;
    if (nFaces === 0) {
      clearHighlight();
      return;
    }

    // Ensure centroids are available
    let centroids = (typeof faceCentroids !== 'undefined' && faceCentroids) ? faceCentroids : null;
    if (!centroids) {
      const posAttr = currentMesh.geometry.attributes.position;
      if (!posAttr) return;
      const posArr = posAttr.array;
      centroids = new Float32Array(nFaces * 3);
      for (let f = 0; f < nFaces; f++) {
        const f9 = f * 9;
        centroids[f * 3]     = (posArr[f9] + posArr[f9 + 3] + posArr[f9 + 6]) / 3;
        centroids[f * 3 + 1] = (posArr[f9 + 1] + posArr[f9 + 4] + posArr[f9 + 7]) / 3;
        centroids[f * 3 + 2] = (posArr[f9 + 2] + posArr[f9 + 5] + posArr[f9 + 8]) / 3;
      }
      if (typeof faceCentroids !== 'undefined') faceCentroids = centroids;
    }

    shapeRoot.updateMatrixWorld();
    const invM = new THREE.Matrix4().copy(shapeRoot.matrixWorld).invert();
    const e = invM.elements;

    const matchedFaces = [];
    const type = currentShapeType;

    for (let f = 0; f < nFaces; f++) {
      const idx = f * 3;
      const cx = centroids[idx];
      const cy = centroids[idx + 1];
      const cz = centroids[idx + 2];

      // Local coordinate transformation
      const lx = e[0] * cx + e[4] * cy + e[8]  * cz + e[12];
      const ly = e[1] * cx + e[5] * cy + e[9]  * cz + e[13];
      const lz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];

      let isInside = false;
      if (type === 'box') {
        if (Math.abs(lx) <= 0.5 && Math.abs(ly) <= 0.5 && Math.abs(lz) <= 0.5) {
          isInside = true;
        }
      } else if (type === 'sphere') {
        if (lx * lx + ly * ly + lz * lz <= 0.25) {
          isInside = true;
        }
      } else if (type === 'cylinder') {
        if (lx * lx + lz * lz <= 0.25 && Math.abs(ly) <= 0.5) {
          isInside = true;
        }
      }

      if (isInside) {
        matchedFaces.push(f);
      }
    }

    intersectingFaces = matchedFaces;

    // Highlight updates
    if (typeof writeFaceSliceColor === 'function') {
      if (highlightedFaces.length > 0) {
        writeFaceSliceColor(highlightedFaces, -1, 'base');
      }
      if (matchedFaces.length > 0) {
        writeFaceSliceColor(matchedFaces, -1, 'hover');
      }
      highlightedFaces = matchedFaces;
    }

    updateIntersectCountUI(matchedFaces.length);
  }

  function applyShapeSegmentation() {
    if (!intersectingFaces || intersectingFaces.length === 0) {
      if (typeof showToast === 'function') showToast('No surface faces inside shape volume', 'warning');
      return;
    }

    const count = intersectingFaces.length;
    const targetGroup = typeof activeBrushGroup !== 'undefined' ? activeBrushGroup : 1;
    const groupName = typeof getGroupName === 'function' ? getGroupName(targetGroup) : `Group ${targetGroup}`;

    // Apply surgical split
    if (typeof assignFacesToGroup === 'function') {
      assignFacesToGroup(intersectingFaces, targetGroup);
    }

    highlightedFaces = [];
    if (typeof showToast === 'function') {
      showToast(`Applied ${groupName} to ${count.toLocaleString()} faces`, 'success');
    }

    computeIntersection();
  }

  function snapToPoint(point) {
    if (!point || !shapeRoot) return;
    shapeRoot.position.copy(point);
    if (transformControls) transformControls.updateMatrixWorld();
    updateUIInputs();
    computeIntersection();
  }

  function resetShape() {
    if (!shapeRoot) return;

    let center = new THREE.Vector3(0, 0, 0);
    let size = new THREE.Vector3(20, 20, 20);

    if (typeof currentMesh !== 'undefined' && currentMesh && currentMesh.geometry) {
      if (!currentMesh.geometry.boundingBox) currentMesh.geometry.computeBoundingBox();
      const bb = currentMesh.geometry.boundingBox;
      bb.getCenter(center);
      bb.getSize(size);
      const dim = Math.max(size.x, size.y, size.z) * 0.3;
      shapeRoot.scale.set(dim, dim, dim);
    } else {
      shapeRoot.scale.set(10, 10, 10);
    }

    shapeRoot.position.copy(center);
    shapeRoot.rotation.set(0, 0, 0);

    if (transformControls) transformControls.updateMatrixWorld();
    updateUIInputs();
    computeIntersection();
  }

  function updateIntersectCountUI(count) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('shape-intersect-count');
    if (el) el.textContent = `${count.toLocaleString()} faces`;
  }

  function updateUIInputs() {
    if (typeof document === 'undefined') return;
    if (isUpdatingUI || !shapeRoot) return;
    isUpdatingUI = true;

    const px = document.getElementById('shape-pos-x');
    const py = document.getElementById('shape-pos-y');
    const pz = document.getElementById('shape-pos-z');
    if (px) px.value = shapeRoot.position.x.toFixed(1);
    if (py) py.value = shapeRoot.position.y.toFixed(1);
    if (pz) pz.value = shapeRoot.position.z.toFixed(1);

    const sx = document.getElementById('shape-scale-x');
    const sy = document.getElementById('shape-scale-y');
    const sz = document.getElementById('shape-scale-z');
    if (sx) sx.value = Math.abs(shapeRoot.scale.x).toFixed(1);
    if (sy) sy.value = Math.abs(shapeRoot.scale.y).toFixed(1);
    if (sz) sz.value = Math.abs(shapeRoot.scale.z).toFixed(1);

    const rx = document.getElementById('shape-rot-x');
    const ry = document.getElementById('shape-rot-y');
    const rz = document.getElementById('shape-rot-z');
    if (rx) rx.value = Math.round(THREE.MathUtils.radToDeg(shapeRoot.rotation.x));
    if (ry) ry.value = Math.round(THREE.MathUtils.radToDeg(shapeRoot.rotation.y));
    if (rz) rz.value = Math.round(THREE.MathUtils.radToDeg(shapeRoot.rotation.z));

    isUpdatingUI = false;
  }

  function onUIInputChange() {
    if (isUpdatingUI || !shapeRoot) return;

    const px = parseFloat(document.getElementById('shape-pos-x')?.value || 0);
    const py = parseFloat(document.getElementById('shape-pos-y')?.value || 0);
    const pz = parseFloat(document.getElementById('shape-pos-z')?.value || 0);
    shapeRoot.position.set(px, py, pz);

    const sx = Math.max(0.01, parseFloat(document.getElementById('shape-scale-x')?.value || 1));
    const sy = Math.max(0.01, parseFloat(document.getElementById('shape-scale-y')?.value || 1));
    const sz = Math.max(0.01, parseFloat(document.getElementById('shape-scale-z')?.value || 1));
    shapeRoot.scale.set(sx, sy, sz);

    const rx = THREE.MathUtils.degToRad(parseFloat(document.getElementById('shape-rot-x')?.value || 0));
    const ry = THREE.MathUtils.degToRad(parseFloat(document.getElementById('shape-rot-y')?.value || 0));
    const rz = THREE.MathUtils.degToRad(parseFloat(document.getElementById('shape-rot-z')?.value || 0));
    shapeRoot.rotation.set(rx, ry, rz);

    if (transformControls) transformControls.updateMatrixWorld();
    computeIntersection();
  }

  function bindUIEventListeners() {
    if (typeof document === 'undefined') return;
    ['shape-pos-x', 'shape-pos-y', 'shape-pos-z',
     'shape-scale-x', 'shape-scale-y', 'shape-scale-z',
     'shape-rot-x', 'shape-rot-y', 'shape-rot-z'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', onUIInputChange);
      }
    });

    const snapBtn = document.getElementById('btn-shape-snap-toggle');
    if (snapBtn) {
      snapBtn.addEventListener('click', () => {
        snapToClickActive = !snapToClickActive;
        snapBtn.classList.toggle('active', snapToClickActive);
        if (typeof showToast === 'function') {
          showToast(snapToClickActive ? 'Snap to Click enabled: Click miniature surface to move shape' : 'Snap to Click disabled', 'info');
        }
      });
    }
  }

  return {
    initShapeSegmentor,
    setShapeType,
    setTransformMode,
    activateShapeTool,
    deactivateShapeTool,
    computeIntersection,
    applyShapeSegmentation,
    snapToPoint,
    resetShape,
    get isToolActive() { return isToolActive; },
    get snapToClickActive() { return snapToClickActive; },
    set snapToClickActive(v) { snapToClickActive = v; }
  };
});
