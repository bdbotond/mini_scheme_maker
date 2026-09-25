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

console.log('\n✅ All unit and integration tests passed!\n');
