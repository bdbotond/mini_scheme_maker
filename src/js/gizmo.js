/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Gizmo: Orientation Cube & Camera Snap
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.Gizmo = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  let gizmoRenderer = null;
  let gizmoScene = null;
  let gizmoCamera = null;
  let gizmoCubeMeshes = [];
  let cameraTween = null;

  const _gizmoDir = new THREE.Vector3();

  const GIZMO_FACES = [
    { label: 'F', normal: [0,  0,  1] },
    { label: 'B', normal: [0,  0, -1] },
    { label: 'R', normal: [1,  0,  0] },
    { label: 'L', normal: [-1, 0,  0] },
    { label: 'T', normal: [0,  1,  0] },
    { label: 'Bo', normal: [0, -1,  0] },
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

    const faceColors = [0x4f80ff, 0x2a4da8, 0x3b82f6, 0x1d4ed8, 0x60a5fa, 0x1e3a6e];
    const faceData = [
      { pos: [0, 0, 0.51],  rot: [0, 0, 0] },
      { pos: [0, 0, -0.51], rot: [0, Math.PI, 0] },
      { pos: [0.51, 0, 0],  rot: [0, -Math.PI / 2, 0] },
      { pos: [-0.51, 0, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [0, 0.51, 0],  rot: [-Math.PI / 2, 0, 0] },
      { pos: [0, -0.51, 0], rot: [Math.PI / 2, 0, 0] },
    ];

    const edgeGeo = new THREE.BoxGeometry(1, 1, 1);
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
      const tc = document.createElement('canvas');
      tc.width = 64; tc.height = 64;
      const ctx = tc.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(face.label, 32, 32);
      const tex = new THREE.CanvasTexture(tc);
      const lmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthTest: false });
      const lmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), lmat);
      const fd = faceData[i];
      lmesh.position.set(fd.pos[0] * 1.001, fd.pos[1] * 1.001, fd.pos[2] * 1.001);
      lmesh.rotation.set(...fd.rot);
      gizmoScene.add(lmesh);
    });

    gizmoScene.add(new THREE.AmbientLight(0xffffff, 1));

    const gRaycaster = new THREE.Raycaster();
    const gMouse = new THREE.Vector2();
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      gMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      gMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      gRaycaster.setFromCamera(gMouse, gizmoCamera);
      const hits = gRaycaster.intersectObjects(gizmoCubeMeshes);
      if (hits.length > 0) snapCameraToFace(hits[0].object.userData.faceIdx);
    });

    canvas.style.display = 'block';
  }

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

  function renderGizmo() {
    if (gizmoRenderer && gizmoScene && gizmoCamera) {
      _gizmoDir.subVectors(camera.position, controls.target).normalize().multiplyScalar(3.5);
      gizmoCamera.position.copy(_gizmoDir);
      gizmoCamera.lookAt(0, 0, 0);
      gizmoRenderer.render(gizmoScene, gizmoCamera);
    }
  }

  return { initGizmo, snapCameraToFace, renderGizmo, get gizmoRenderer() { return gizmoRenderer; } };
});
