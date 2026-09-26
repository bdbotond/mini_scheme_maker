/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Scene Setup: Three.js renderer, camera, lights, OrbitControls
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.Scene = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  const camera = new THREE.PerspectiveCamera(45, (container ? container.clientWidth / container.clientHeight : 1), 0.1, 2000);
  camera.position.set(0, 40, 90);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (container) renderer.setSize(container.clientWidth, container.clientHeight);
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.LinearEncoding;
  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.NoToneMapping;
  }
  if (container) container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  // Calibrated lighting for faithful paint color reproduction with subtle 3D depth
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const cameraLight = new THREE.DirectionalLight(0xffffff, 0.35);
  cameraLight.position.set(0, 10, 30);
  camera.add(cameraLight);

  const backFillLight = new THREE.DirectionalLight(0xffffff, 0.2);
  backFillLight.position.set(0, -10, -30);
  camera.add(backFillLight);
  scene.add(camera);

  window.addEventListener('resize', () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, camera, renderer, controls, container };
});
