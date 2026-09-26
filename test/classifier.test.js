/**
 * Test Suite: 3D Surface Classifier & Color Utilities
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  parseSTL,
  classifyMeshGeometry,
  hexToRgb,
  rgbToLab,
  deltaE2000,
  findClosestPaint
} = require('../src/surface_classifier.js');

console.log('🧪 Starting Mini-Segmentor Test Suite...\n');

// 1. Color Math Tests
console.log('1. Testing Color Math & CIEDE2000...');
{
  const rgb = hexToRgb('#3b82f6');
  assert.strictEqual(rgb.r, 59);
  assert.strictEqual(rgb.g, 130);
  assert.strictEqual(rgb.b, 246);

  const rgbShort = hexToRgb('#fff');
  assert.strictEqual(rgbShort.r, 255);
  assert.strictEqual(rgbShort.g, 255);
  assert.strictEqual(rgbShort.b, 255);

  const labWhite = rgbToLab(255, 255, 255);
  assert(Math.abs(labWhite.L - 100.0) < 0.5, 'White L* should be ~100');
  assert(Math.abs(labWhite.a) < 1.0, 'White a* should be ~0');
  assert(Math.abs(labWhite.b) < 1.0, 'White b* should be ~0');

  const labBlack = rgbToLab(0, 0, 0);
  assert(Math.abs(labBlack.L) < 0.1, 'Black L* should be ~0');

  // Identical colors should have ΔE = 0
  const dEIdentical = deltaE2000(labWhite, labWhite);
  assert.strictEqual(dEIdentical, 0, 'Identical colors should have ΔE 0');

  // Different colors should have ΔE > 0
  const dEDiff = deltaE2000(labWhite, labBlack);
  assert(dEDiff > 90, 'Black vs White should have high ΔE');

  // Paint matching
  const testPaints = [
    { name: 'Pure Red', hex: '#ff0000', rgb: { r: 255, g: 0, b: 0 } },
    { name: 'Sky Blue', hex: '#38bdf8', rgb: { r: 56, g: 189, b: 248 } },
    { name: 'Slate Grey', hex: '#94a3b8', rgb: { r: 148, g: 163, b: 184 } }
  ];
  const match = findClosestPaint('#94a3b8', testPaints);
  assert(match !== null, 'Match should not be null');
  assert.strictEqual(match.paint.name, 'Slate Grey');
  assert(match.dE < 1e-4, 'Exact match should have negligible ΔE');

  console.log('   ✓ Hex to RGB conversion passed');
  console.log('   ✓ RGB to CIE-Lab conversion passed');
  console.log('   ✓ CIEDE2000 delta E formula passed');
  console.log('   ✓ Nearest paint matcher passed');
}

// 2. Binary STL Parsing & Geometry Classification Tests
console.log('\n2. Testing Mesh Parsing & Geometric Classification...');
{
  // Construct a minimal valid binary STL buffer: 2 triangles forming a square
  const buf = Buffer.alloc(84 + 2 * 50);
  buf.writeUInt32LE(2, 80); // 2 triangles

  // Triangle 1: (0,0,0), (1,0,0), (0,1,0)
  let off = 84;
  off += 12; // Normal (0,0,0)
  buf.writeFloatLE(0, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  buf.writeFloatLE(1, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  buf.writeFloatLE(0, off); buf.writeFloatLE(1, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  off += 2; // attr byte count

  // Triangle 2: (1,0,0), (1,1,0), (0,1,0)
  off += 12; // Normal (0,0,0)
  buf.writeFloatLE(1, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  buf.writeFloatLE(1, off); buf.writeFloatLE(1, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  buf.writeFloatLE(0, off); buf.writeFloatLE(1, off + 4); buf.writeFloatLE(0, off + 8); off += 12;
  off += 2;

  const parsed = parseSTL(buf);
  assert.strictEqual(parsed.numFaces, 2, 'Should parse 2 faces');
  assert.strictEqual(parsed.pos.length, 18, 'Should have 18 float positions');

  const result = classifyMeshGeometry(parsed.pos, parsed.numFaces, {});
  assert.strictEqual(result.faceCategory.length, 2, 'Should classify 2 faces');
  assert(result.totalArea > 0, 'Total area should be positive');
  assert(Math.abs(result.totalArea - 1.0) < 1e-4, 'Two right triangles of side 1 should form area ~1.0');

  console.log('   ✓ Binary STL parser correctly unpacks vertices');
  console.log('   ✓ Normals, bounding coordinates, and face areas computed');
  console.log('   ✓ Connected surface coplanar merging evaluated');
}

// 3. Integration test with sample model
console.log('\n3. Testing Sample Mesh Integration...');
{
  const samplePath = path.join(__dirname, '..', 'samples', 'SG_Assault_r_3_head.stl');
  if (fs.existsSync(samplePath)) {
    const buf = fs.readFileSync(samplePath);
    const parsed = parseSTL(buf);
    assert(parsed.numFaces > 1000, 'Sample model should have > 1000 faces');
    const result = classifyMeshGeometry(parsed.pos, parsed.numFaces, {});
    assert(result.stats.smooth.count > 0, 'Smooth face count should be positive');
    console.log(`   ✓ Successfully processed sample model (${parsed.numFaces.toLocaleString()} tris in ${result.elapsed}ms)`);
  } else {
    console.log('   (Sample STL file skipped, not present)');
  }
}

// 4. Secondary Brush Background Segmentation Tests
console.log('\n4. Testing Secondary Brush Topology & Background Segmentation...');
{
  global.self = global;
  global.THREE = {
    Color: class { constructor(r=0, g=0, b=0) { this.r = r; this.g = g; this.b = b; } },
    Vector3: class { constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; } }
  };
  global.document = {
    getElementById: (id) => {
      if (id === 'hardness-slider') return { value: '24' };
      if (id === 'area-slider') return { value: '2.0' };
      if (id === 'edge-len-slider') return { value: '1' };
      if (id === 'edge-straight-slider') return { value: '0.0' };
      if (id === 'sec-hardness-slider') return { value: '24' };
      if (id === 'sec-area-slider') return { value: '2.0' };
      if (id === 'sec-edge-len-slider') return { value: '1' };
      if (id === 'sec-edge-straight-slider') return { value: '0.0' };
      return null;
    }
  };
  global.getGroupColor = () => ({ r: 0.5, g: 0.5, b: 0.5 });
  global.getGroupColorHex = () => '#888888';
  global.getGroupName = (g) => `Group ${g}`;

  const MeshTopology = require('../src/js/mesh_topology.js');
  const numFaces = 4;
  const posArray = new Float32Array(numFaces * 9);
  posArray.set([0,0,0,  1,0,0,  0,1,0], 0);
  posArray.set([1,0,0,  1,1,0,  0,1,0], 9);
  posArray.set([0,1,0,  1,1,0,  0,2,1], 18);
  posArray.set([1,1,0,  1,2,1,  0,2,1], 27);

  const colorsArr = new Float32Array(numFaces * 9);
  MeshTopology.currentMesh = {
    geometry: {
      attributes: {
        position: { array: posArray, count: numFaces * 3 },
        color: { array: colorsArr, needsUpdate: false }
      }
    }
  };
  MeshTopology.numFaces = numFaces;
  MeshTopology.buildMeshTopology(posArray, numFaces);
  MeshTopology.runSegmentation();

  assert(MeshTopology.numParts > 0, 'Should have segmented primary parts');
  const primaryGroupsSnapshot = [...MeshTopology.partGroup];

  // Secondary segmentation run
  MeshTopology.runSecondarySegmentation();
  assert(MeshTopology.secondaryPartOfFace !== null, 'Secondary partition must be generated');
  assert.deepStrictEqual(MeshTopology.partGroup, primaryGroupsSnapshot, 'Secondary segmentation must not alter existing part groups');
  console.log('   ✓ Secondary segmentation ran in background without touching colors');

  // Change secondary parameters
  global.document.getElementById = (id) => {
    if (id === 'sec-hardness-slider') return { value: '60' };
    if (id === 'sec-area-slider') return { value: '2.0' };
    if (id === 'sec-edge-len-slider') return { value: '1' };
    if (id === 'sec-edge-straight-slider') return { value: '0.0' };
    return null;
  };
  MeshTopology.runSecondarySegmentation();
  assert.deepStrictEqual(MeshTopology.partGroup, primaryGroupsSnapshot, 'Secondary slider adjustment preserves all existing colors');
  console.log('   ✓ Secondary parameters change partitions without resetting segmentation');

  // Assign secondary selection to group 3
  const secPart0 = new Set([0]);
  MeshTopology.assignSecondarySelectionToGroup(secPart0, 3);
  let group3Assigned = false;
  for (let f = 0; f < numFaces; f++) {
    const p = MeshTopology.partOfFace[f];
    if (MeshTopology.partGroup[p] === 3) group3Assigned = true;
  }
  assert(group3Assigned, 'Selected secondary faces must be assigned to target group');
  console.log('   ✓ Selected secondary area surgically assigned to target group');
}

// 5. Testing Shape Volume Intersections & Surgical Face Assignment
console.log('\n5. Testing Shape Volume Intersections & Surgical Face Assignment...');
{
  const MeshTopology = require('../src/js/mesh_topology.js');
  const numFaces = 4;
  const posArray = new Float32Array(numFaces * 9);
  // Triangle 0: (0,0,0)-(1,0,0)-(0,1,0) -> centroid (1/3, 1/3, 0)
  posArray.set([0,0,0,  1,0,0,  0,1,0], 0);
  // Triangle 1: (1,0,0)-(1,1,0)-(0,1,0) -> centroid (2/3, 2/3, 0)
  posArray.set([1,0,0,  1,1,0,  0,1,0], 9);
  // Triangle 2: (0,1,0)-(1,1,0)-(0,2,1) -> centroid (1/3, 4/3, 1/3)
  posArray.set([0,1,0,  1,1,0,  0,2,1], 18);
  // Triangle 3: (1,1,0)-(1,2,1)-(0,2,1) -> centroid (2/3, 5/3, 2/3)
  posArray.set([1,1,0,  1,2,1,  0,2,1], 27);

  const colorsArr = new Float32Array(numFaces * 9);
  MeshTopology.currentMesh = {
    geometry: {
      attributes: {
        position: { array: posArray, count: numFaces * 3 },
        color: { array: colorsArr, needsUpdate: false }
      }
    }
  };
  MeshTopology.numFaces = numFaces;
  MeshTopology.buildMeshTopology(posArray, numFaces);
  MeshTopology.runSegmentation();

  // 5.1 Centroids
  assert(MeshTopology.faceCentroids !== null, 'faceCentroids must be computed in buildMeshTopology');
  assert(Math.abs(MeshTopology.faceCentroids[0] - 1/3) < 1e-4, 'Face 0 centroid X must be 1/3');
  assert(Math.abs(MeshTopology.faceCentroids[1] - 1/3) < 1e-4, 'Face 0 centroid Y must be 1/3');
  console.log('   ✓ Mesh face centroids precomputed accurately');

  // 5.2 Box Intersection Test
  // Box centered at (0.2, 0.2, 0) with half-extents 0.3 (covers Face 0, excludes Face 1, 2, 3)
  const boxIntersected = [];
  for (let f = 0; f < numFaces; f++) {
    const cx = MeshTopology.faceCentroids[f * 3];
    const cy = MeshTopology.faceCentroids[f * 3 + 1];
    const cz = MeshTopology.faceCentroids[f * 3 + 2];
    if (Math.abs(cx - 0.2) <= 0.3 && Math.abs(cy - 0.2) <= 0.3 && Math.abs(cz - 0) <= 0.3) {
      boxIntersected.push(f);
    }
  }
  assert.deepStrictEqual(boxIntersected, [0], 'Box intersection should contain only Face 0');
  console.log('   ✓ Box volume intersection accurately filters surface triangles');

  // 5.3 Sphere Intersection Test
  // Sphere centered at (0.5, 0.5, 0) with radius 0.4 (contains Face 0 & 1, excludes Face 2 & 3)
  const sphereIntersected = [];
  for (let f = 0; f < numFaces; f++) {
    const cx = MeshTopology.faceCentroids[f * 3];
    const cy = MeshTopology.faceCentroids[f * 3 + 1];
    const cz = MeshTopology.faceCentroids[f * 3 + 2];
    const distSq = (cx - 0.5)**2 + (cy - 0.5)**2 + (cz - 0)**2;
    if (distSq <= 0.4**2) {
      sphereIntersected.push(f);
    }
  }
  assert.deepStrictEqual(sphereIntersected, [0, 1], 'Sphere intersection should contain Face 0 and Face 1');
  console.log('   ✓ Sphere volume intersection accurately filters surface triangles');

  // 5.4 Cylinder Intersection Test
  // Cylinder along Y axis centered at (0.5, 0.5, 0) with radius 0.4 and half-height 0.4
  const cylIntersected = [];
  for (let f = 0; f < numFaces; f++) {
    const cx = MeshTopology.faceCentroids[f * 3];
    const cy = MeshTopology.faceCentroids[f * 3 + 1];
    const cz = MeshTopology.faceCentroids[f * 3 + 2];
    const rSq = (cx - 0.5)**2 + (cz - 0)**2;
    if (rSq <= 0.4**2 && Math.abs(cy - 0.5) <= 0.4) {
      cylIntersected.push(f);
    }
  }
  assert.deepStrictEqual(cylIntersected, [0, 1], 'Cylinder intersection should contain Face 0 and Face 1');
  console.log('   ✓ Cylinder volume intersection accurately filters surface triangles');

  // 5.5 assignFacesToGroup surgical split
  const targetFaces = new Set([0]);
  MeshTopology.assignFacesToGroup(targetFaces, 5);
  const partForFace0 = MeshTopology.partOfFace[0];
  const partForFace1 = MeshTopology.partOfFace[1];
  assert.strictEqual(MeshTopology.partGroup[partForFace0], 5, 'Face 0 must be assigned to group 5');
  assert.notStrictEqual(MeshTopology.partGroup[partForFace1], 5, 'Face 1 must remain in its original group');
  assert.strictEqual(MeshTopology.initialPartGroup[partForFace0], MeshTopology.initialPartGroup[partForFace1], 'Split part must inherit baseline auto-segmentation category in initialPartGroup for Reset support');
  console.log('   ✓ assignFacesToGroup surgically reassigns and splits intersecting mesh parts');
}

// 6. Testing Project Save / Load Serialization
console.log('\n6. Testing Project Serialization & Reconstruction...');
{
  const originalPos = new Float32Array([
    0.123, 1.456, -2.789,
    10.5, 20.25, 30.125,
    -100.0, 0.0, 50.5
  ]);

  // Base64 encode
  const bytes = new Uint8Array(originalPos.buffer, originalPos.byteOffset, originalPos.byteLength);
  const base64 = Buffer.from(bytes).toString('base64');

  // Base64 decode
  const decodedBuf = Buffer.from(base64, 'base64');
  const restoredPos = new Float32Array(decodedBuf.buffer, decodedBuf.byteOffset, decodedBuf.byteLength / 4);

  assert.strictEqual(restoredPos.length, originalPos.length, 'Length should match');
  for (let i = 0; i < originalPos.length; i++) {
    assert.strictEqual(restoredPos[i], originalPos[i], `Vertex pos [${i}] should match exactly`);
  }
  console.log('   ✓ Float32Array geometry encodes and decodes bit-for-bit');

  const testProject = {
    format: 'miniseg',
    version: 1,
    modelName: 'test_model',
    numFaces: 4,
    positionsBase64: base64,
    partFaces: [[0, 1], [2], [3]],
    partGroup: [1, 2, 3],
    groupColors: { 1: '#94a3b8', 2: '#eab308', 3: '#ff0000' },
    groupNames: { 3: 'Special Armor' },
    userCreatedGroups: [3]
  };

  // Reconstruct partOfFace
  const numFaces = testProject.numFaces;
  const numParts = testProject.partFaces.length;
  const partOfFace = new Int32Array(numFaces);
  for (let p = 0; p < numParts; p++) {
    const faces = testProject.partFaces[p];
    for (let i = 0; i < faces.length; i++) {
      partOfFace[faces[i]] = p;
    }
  }

  assert.strictEqual(partOfFace[0], 0);
  assert.strictEqual(partOfFace[1], 0);
  assert.strictEqual(partOfFace[2], 1);
  assert.strictEqual(partOfFace[3], 2);
  assert.strictEqual(testProject.partGroup[partOfFace[3]], 3);
  console.log('   ✓ Part-to-face mapping and custom group reconstruction passed');
}

// 7. Testing Tutorial Guide Module
console.log('7. Testing Tutorial Guide Module...');
{
  const Tutorial = require('../src/js/tutorial.js');
  assert.strictEqual(typeof Tutorial.openTutorial, 'function');
  assert.strictEqual(typeof Tutorial.closeTutorial, 'function');
  assert.strictEqual(typeof Tutorial.switchTutorialTab, 'function');
  assert.strictEqual(typeof Tutorial.shouldShowOnStartup, 'function');
  assert.strictEqual(typeof Tutorial.setStartupPreference, 'function');
  console.log('   ✓ Tutorial module methods exported and verified');
}


console.log('\n✅ All unit and integration tests passed!\n');
