#!/usr/bin/env node
/**
 * Developer Benchmark Tool
 * Benchmarks parsing & surface classification throughput across sample meshes
 */

const fs = require('fs');
const path = require('path');
const { parseSTL, classifyMeshGeometry } = require('../src/surface_classifier.js');

const samplesDir = path.join(__dirname, '..', 'samples');
const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.stl'));

console.log(`🚀 Benchmarking Mini-Segmentor (${files.length} sample meshes)...\n`);

for (const file of files) {
  const filePath = path.join(samplesDir, file);
  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  // Skip extremely large test files > 50MB in quick benchmark
  if (stat.size > 50 * 1024 * 1024) {
    console.log(`⏩ ${file} (${sizeMB} MB) - Skipped in quick benchmark`);
    continue;
  }

  const tParse0 = performance.now();
  const buf = fs.readFileSync(filePath);
  const { pos, numFaces } = parseSTL(buf);
  const tParse = (performance.now() - tParse0).toFixed(1);

  const tClass0 = performance.now();
  const res = classifyMeshGeometry(pos, numFaces, {});
  const tClass = (performance.now() - tClass0).toFixed(1);

  console.log(`📦 ${file} (${sizeMB} MB)`);
  console.log(`   Faces: ${numFaces.toLocaleString()} | Parse: ${tParse} ms | Classification: ${tClass} ms`);
  console.log(`   Smooth: ${res.stats.smooth.pct}% | Detail: ${res.stats.detail.pct}%\n`);
}

console.log('🏁 Benchmark complete.');
