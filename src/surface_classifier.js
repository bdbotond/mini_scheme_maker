#!/usr/bin/env node
/**
 * 3D Mesh Geometric Surface Classifier
 * Classifies 3D mesh surfaces into:
 *  1. Large Smooth Surfaces (Grey)
 *  2. Sharp / Thin Edges and Ridges (Red)
 *  3. Fine Detail / Textured Surfaces (Yellow)
 *
 * Vectorized with flat TypedArrays for fast execution on >100,000 vertices.
 *
 * Usage:
 *   node surface_classifier.js <path_to_stl_or_obj> [--out <output.ply>] [--angle <deg>] [--areaPct <val>]
 */

const fs = require('fs');
const path = require('path');
const { hexToRgb, rgbToLab, deltaE2000, findClosestPaint } = require('./js/color_utils.js');

function parseSTL(buf) {
  if (buf.length < 84) throw new Error("File too small to be a valid STL");

  // Detect ASCII STL: binary files never start with "solid" AND match the size formula.
  // ASCII files start with "solid " but their buf.length won't match 84 + n*50 where n
  // is the garbage uint32 at offset 80.
  const looksAscii = buf.slice(0, 5).toString('ascii').toLowerCase() === 'solid';
  const numFacesBin = buf.readUInt32LE(80);
  const isBinary = !looksAscii || buf.length === 84 + numFacesBin * 50;

  if (isBinary) {
    const numFaces = numFacesBin;
    if (buf.length < 84 + numFaces * 50) throw new Error("Binary STL truncated");
    const pos = new Float32Array(numFaces * 9);
    let offset = 84;
    for (let i = 0; i < numFaces; i++) {
      offset += 12; // skip face normal
      for (let v = 0; v < 3; v++) {
        pos[i * 9 + v * 3]     = buf.readFloatLE(offset);
        pos[i * 9 + v * 3 + 1] = buf.readFloatLE(offset + 4);
        pos[i * 9 + v * 3 + 2] = buf.readFloatLE(offset + 8);
        offset += 12;
      }
      offset += 2; // skip attribute byte count
    }
    return { pos, numFaces };
  } else {
    const text = buf.toString('utf8');
    const vertexMatches = text.match(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g);
    if (!vertexMatches) throw new Error("Failed to parse ASCII STL vertices");
    const numFaces = Math.floor(vertexMatches.length / 3);
    const pos = new Float32Array(numFaces * 9);
    let p = 0;
    for (let i = 0; i < numFaces * 3; i++) {
      const parts = vertexMatches[i].trim().split(/\s+/);
      pos[p++] = parseFloat(parts[1]);
      pos[p++] = parseFloat(parts[2]);
      pos[p++] = parseFloat(parts[3]);
    }
    return { pos, numFaces };
  }
}

function classifyMeshGeometry(pos, numFaces, options = {}) {
  const t0 = performance.now();

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const faceNormals = new Float32Array(numFaces * 3);
  const faceAreas = new Float32Array(numFaces);
  let totalArea = 0;

  // 1. Vectorized Normals, Areas & Bounds
  for (let f = 0; f < numFaces; f++) {
    const f9 = f * 9;
    const ax = pos[f9], ay = pos[f9 + 1], az = pos[f9 + 2];
    const bx = pos[f9 + 3], by = pos[f9 + 4], bz = pos[f9 + 5];
    const cx = pos[f9 + 6], cy = pos[f9 + 7], cz = pos[f9 + 8];

    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
    if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
    if (by < minY) minY = by; if (by > maxY) maxY = by;
    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;
    if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;

    const abX = bx - ax, abY = by - ay, abZ = bz - az;
    const acX = cx - ax, acY = cy - ay, acZ = cz - az;
    let nx = abY * acZ - abZ * acY;
    let ny = abZ * acX - abX * acZ;
    let nz = abX * acY - abY * acX;
    const crossLen = Math.hypot(nx, ny, nz);
    const a = 0.5 * crossLen;
    faceAreas[f] = a;
    totalArea += a;
    const inv = crossLen > 1e-7 ? 1 / crossLen : 0;
    faceNormals[f * 3] = nx * inv;
    faceNormals[f * 3 + 1] = ny * inv;
    faceNormals[f * 3 + 2] = nz * inv;
  }

  // 2. Fast Quantized Vertex Welding
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const scale = 200000 / extent;
  const vertMap = new Map();
  let nextVertId = 0;
  const faceVerts = new Int32Array(numFaces * 3);
  const vertPosList = [];

  for (let i = 0; i < numFaces * 3; i++) {
    const ix = BigInt(Math.round((pos[i * 3] - minX) * scale));
    const iy = BigInt(Math.round((pos[i * 3 + 1] - minY) * scale));
    const iz = BigInt(Math.round((pos[i * 3 + 2] - minZ) * scale));
    const vKey = (ix << 42n) | (iy << 21n) | iz;
    let vid = vertMap.get(vKey);
    if (vid === undefined) {
      vid = nextVertId++;
      vertMap.set(vKey, vid);
      vertPosList.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    faceVerts[i] = vid;
  }
  const uniqueVertPositions = new Float32Array(vertPosList);

  // 3. Edge Adjacency Graph with Dihedral Angles
  const edgeMap = new Map();
  const adjHead = new Int32Array(numFaces).fill(-1);
  const adjNext = new Int32Array(numFaces * 6);
  const adjTo = new Int32Array(numFaces * 6);
  const edgeAngle = new Float32Array(numFaces * 6);
  const meshEdges = [];
  let adjCount = 0;

  for (let f = 0; f < numFaces; f++) {
    const f3 = f * 3;
    const v0 = faceVerts[f3], v1 = faceVerts[f3 + 1], v2 = faceVerts[f3 + 2];
    const edges = [[v0, v1], [v1, v2], [v2, v0]];

    for (let e = 0; e < 3; e++) {
      const a = edges[e][0], b = edges[e][1];
      const u = a < b ? a : b, w = a < b ? b : a;
      const eKey = (BigInt(u) << 32n) | BigInt(w);
      const existing = edgeMap.get(eKey);
      if (existing !== undefined) {
        const dot = faceNormals[f * 3] * faceNormals[existing * 3] +
                    faceNormals[f * 3 + 1] * faceNormals[existing * 3 + 1] +
                    faceNormals[f * 3 + 2] * faceNormals[existing * 3 + 2];
        const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
        adjTo[adjCount] = existing; edgeAngle[adjCount] = angleDeg; adjNext[adjCount] = adjHead[f]; adjHead[f] = adjCount++;
        adjTo[adjCount] = f; edgeAngle[adjCount] = angleDeg; adjNext[adjCount] = adjHead[existing]; adjHead[existing] = adjCount++;
        meshEdges.push({ u, w, f1: existing, f2: f, angle: angleDeg });
      } else {
        edgeMap.set(eKey, f);
      }
    }
  }

  // 4. Auto-Calibration
  let edgeThreshold = options.angle;
  if (edgeThreshold === undefined) {
    const sampleStep = Math.max(1, Math.floor(numFaces / 3000));
    const sampledAngles = [];
    for (let f = 0; f < numFaces; f += sampleStep) {
      let maxA = 0;
      for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
        if (edgeAngle[e] > maxA) maxA = edgeAngle[e];
      }
      if (maxA > 5) sampledAngles.push(maxA);
    }
    sampledAngles.sort((a,b) => a - b);
    if (sampledAngles.length > 0) {
      const p80 = sampledAngles[Math.floor(sampledAngles.length * 0.80)];
      edgeThreshold = Math.max(20, Math.min(35, Math.round(p80)));
    } else {
      edgeThreshold = 24.0;
    }
  }

  // 5. Detect Sharp Feature Chains & Filter by Length / Straightness
  const minEdgeLen = options.minEdgeLen !== undefined ? options.minEdgeLen : 1;
  const minStraightness = options.straightness !== undefined ? options.straightness : 0.0;
  const isEdgeFace = new Uint8Array(numFaces);

  if (meshEdges.length > 0 && (minEdgeLen > 1 || minStraightness > 0)) {
    const sharpEdges = [];
    const vertSharpAdj = new Map();

    for (let i = 0; i < meshEdges.length; i++) {
      const me = meshEdges[i];
      if (me.angle >= edgeThreshold) {
        const edgeIdx = sharpEdges.length;
        sharpEdges.push(me);
        if (!vertSharpAdj.has(me.u)) vertSharpAdj.set(me.u, []);
        if (!vertSharpAdj.has(me.w)) vertSharpAdj.set(me.w, []);
        vertSharpAdj.get(me.u).push({ edgeIdx, otherV: me.w });
        vertSharpAdj.get(me.w).push({ edgeIdx, otherV: me.u });
      }
    }

    const visitedEdges = new Uint8Array(sharpEdges.length);

    for (let i = 0; i < sharpEdges.length; i++) {
      if (visitedEdges[i]) continue;

      const chainEdges = [];
      const q = [i];
      visitedEdges[i] = 1;
      let qi = 0;

      while (qi < q.length) {
        const currE = q[qi++];
        chainEdges.push(currE);
        const me = sharpEdges[currE];

        const nbsU = vertSharpAdj.get(me.u) || [];
        for (let k = 0; k < nbsU.length; k++) {
          const nextE = nbsU[k].edgeIdx;
          if (!visitedEdges[nextE]) {
            visitedEdges[nextE] = 1;
            q.push(nextE);
          }
        }

        const nbsW = vertSharpAdj.get(me.w) || [];
        for (let k = 0; k < nbsW.length; k++) {
          const nextE = nbsW[k].edgeIdx;
          if (!visitedEdges[nextE]) {
            visitedEdges[nextE] = 1;
            q.push(nextE);
          }
        }
      }

      if (chainEdges.length < minEdgeLen) continue;

      if (minStraightness > 0) {
        let arcLen = 0;
        const chainVerts = new Set();

        for (let k = 0; k < chainEdges.length; k++) {
          const me = sharpEdges[chainEdges[k]];
          chainVerts.add(me.u);
          chainVerts.add(me.w);
          const u3 = me.u * 3, w3 = me.w * 3;
          const dx = uniqueVertPositions[u3] - uniqueVertPositions[w3];
          const dy = uniqueVertPositions[u3+1] - uniqueVertPositions[w3+1];
          const dz = uniqueVertPositions[u3+2] - uniqueVertPositions[w3+2];
          arcLen += Math.hypot(dx, dy, dz);
        }

        if (arcLen > 1e-6) {
          let maxChord = 0;
          const vArr = Array.from(chainVerts);
          const step = Math.max(1, Math.floor(vArr.length / 40));
          for (let a = 0; a < vArr.length; a += step) {
            const va3 = vArr[a] * 3;
            const ax = uniqueVertPositions[va3], ay = uniqueVertPositions[va3+1], az = uniqueVertPositions[va3+2];
            for (let b = a + step; b < vArr.length; b += step) {
              const vb3 = vArr[b] * 3;
              const d = Math.hypot(ax - uniqueVertPositions[vb3], ay - uniqueVertPositions[vb3+1], az - uniqueVertPositions[vb3+2]);
              if (d > maxChord) maxChord = d;
            }
          }

          const straightness = Math.min(1.0, maxChord / arcLen);
          if (straightness < minStraightness) continue;
        }
      }

      for (let k = 0; k < chainEdges.length; k++) {
        const me = sharpEdges[chainEdges[k]];
        isEdgeFace[me.f1] = 1;
        isEdgeFace[me.f2] = 1;
      }
    }
  } else {
    for (let f = 0; f < numFaces; f++) {
      for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
        if (edgeAngle[e] >= edgeThreshold) {
          isEdgeFace[f] = 1;
          break;
        }
      }
    }
  }

  // 6. Local Multi-hop Curvature
  const faceCurvature = new Float32Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    let count = 0, devSum = 0;
    const fnx = faceNormals[f * 3], fny = faceNormals[f * 3 + 1], fnz = faceNormals[f * 3 + 2];
    for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
      const n = adjTo[e];
      devSum += (1.0 - (fnx * faceNormals[n * 3] + fny * faceNormals[n * 3 + 1] + fnz * faceNormals[n * 3 + 2]));
      count++;
    }
    faceCurvature[f] = count > 0 ? (devSum / count) : 0;
  }

  // 7. Enclosed Patch Extraction (non-edge faces only)
  const patchOfFace = new Int32Array(numFaces).fill(-1);
  const patchFaces = [];
  const queue = new Int32Array(numFaces);
  let numPatches = 0;

  for (let i = 0; i < numFaces; i++) {
    if (isEdgeFace[i] || patchOfFace[i] !== -1) continue;
    let qHead = 0, qTail = 0;
    queue[qTail++] = i;
    patchOfFace[i] = numPatches;
    const pList = [i];

    while (qHead < qTail) {
      const curr = queue[qHead++];
      for (let e = adjHead[curr]; e !== -1; e = adjNext[e]) {
        const neighbor = adjTo[e];
        if (!isEdgeFace[neighbor] && patchOfFace[neighbor] === -1) {
          patchOfFace[neighbor] = numPatches;
          queue[qTail++] = neighbor;
          pList.push(neighbor);
        }
      }
    }
    patchFaces.push(pList);
    numPatches++;
  }

  // 8. Classify non-edge patches: 0=Smooth (Grey), 1=Detail (Yellow)
  const faceCategory = new Uint8Array(numFaces); // default 0 (smooth)
  const patchCategory = new Uint8Array(numPatches);

  const smoothAreaThreshold = totalArea * (options.areaPct !== undefined ? (options.areaPct / 100) : 0.02);
  const minFacesMerge = options.mergeSize !== undefined ? options.mergeSize : 2;

  for (let p = 0; p < numPatches; p++) {
    const faces = patchFaces[p];
    let pArea = 0, pCurv = 0;
    for (let i = 0; i < faces.length; i++) {
      pArea += faceAreas[faces[i]];
      pCurv += faceCurvature[faces[i]];
    }
    pCurv = faces.length > 0 ? (pCurv / faces.length) : 0;

    let cat = 0;
    if (faces.length > minFacesMerge && pArea < smoothAreaThreshold &&
        (pCurv > 0.003 || faces.length >= 6)) {
      cat = 1; // Fine detail / textured
    }
    patchCategory[p] = cat;
    for (let i = 0; i < faces.length; i++) {
      faceCategory[faces[i]] = cat;
    }
  }

  // 9. Reclassify edge faces with iterative propagation and majority vote
  // Each edge face votes for whichever adjacent resolved patch has the most shared edges.
  // Already-resolved edge faces propagate their patch in subsequent iterations.
  let changed = true;
  while (changed) {
    changed = false;
    for (let f = 0; f < numFaces; f++) {
      if (!isEdgeFace[f] || patchOfFace[f] !== -1) continue;

      let bestPatch = -1, bestVotes = 0;
      for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
        const rp = patchOfFace[adjTo[e]];
        if (rp === -1) continue;
        let votes = 0;
        for (let e2 = adjHead[f]; e2 !== -1; e2 = adjNext[e2]) {
          if (patchOfFace[adjTo[e2]] === rp) votes++;
        }
        if (votes > bestVotes || (votes === bestVotes && patchFaces[rp].length > (bestPatch !== -1 ? patchFaces[bestPatch].length : 0))) {
          bestVotes = votes;
          bestPatch = rp;
        }
      }

      if (bestPatch !== -1) {
        patchOfFace[f] = bestPatch;
        patchFaces[bestPatch].push(f);
        faceCategory[f] = patchCategory[bestPatch];
        changed = true;
      }
    }
  }

  // Fallback for isolated unresolved edge faces
  let largestPatch = 0;
  for (let p = 1; p < numPatches; p++) {
    if (patchFaces[p].length > patchFaces[largestPatch].length) largestPatch = p;
  }
  for (let f = 0; f < numFaces; f++) {
    if (patchOfFace[f] === -1) {
      patchOfFace[f] = largestPatch;
      patchFaces[largestPatch].push(f);
      faceCategory[f] = patchCategory[largestPatch];
    }
  }

  const elapsed = (performance.now() - t0).toFixed(2);

  let smoothArea = 0, detailArea = 0;
  let smoothCount = 0, detailCount = 0;

  for (let f = 0; f < numFaces; f++) {
    const a = faceAreas[f];
    if (faceCategory[f] === 0) { smoothArea += a; smoothCount++; }
    else                        { detailArea += a; detailCount++; }
  }

  return {
    faceCategory,
    faceAreas,
    totalArea,
    elapsed,
    calibrated: { edgeThreshold, smoothAreaThreshold, minFacesMerge },
    stats: {
      smooth: { count: smoothCount, area: smoothArea, pct: (smoothArea / totalArea * 100).toFixed(1) },
      detail: { count: detailCount, area: detailArea, pct: (detailArea / totalArea * 100).toFixed(1) }
    }
  };
}

function runCLI(args = process.argv.slice(2)) {
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log("Usage: node surface_classifier.js <mesh.stl> [--angle <deg>] [--areaPct <val>] [--merge <size>] [--paint-brand <brand.json>] [--out <output.ply>]");
    process.exit(0);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--angle') options.angle = parseFloat(args[++i]);
    else if (args[i] === '--areaPct') options.areaPct = parseFloat(args[++i]);
    else if (args[i] === '--merge') options.mergeSize = parseInt(args[++i], 10);
    else if (args[i] === '--minEdgeLen') options.minEdgeLen = parseInt(args[++i], 10);
    else if (args[i] === '--straightness') options.straightness = parseFloat(args[++i]);
    else if (args[i] === '--paint-brand') options.paintBrand = args[++i];
    else if (args[i] === '--out') options.outFile = args[++i];
  }

  console.log(`Loading mesh: ${path.basename(filePath)}...`);
  const buf = fs.readFileSync(filePath);
  const { pos, numFaces } = parseSTL(buf);
  console.log(`Parsed ${numFaces.toLocaleString()} triangles (${(numFaces * 3).toLocaleString()} vertices).`);

  const result = classifyMeshGeometry(pos, numFaces, options);

  console.log(`\nClassification completed in ${result.elapsed} ms:`);
  console.log(`Parameters: Dihedral Angle Threshold = ${result.calibrated.edgeThreshold}°, Merge Size = ${result.calibrated.minFacesMerge} faces`);
  console.log(`------------------------------------------------------------`);
  console.log(`  1. Large Smooth Surfaces (Grey)   : ${result.stats.smooth.pct}% area (${result.stats.smooth.count.toLocaleString()} faces)`);
  console.log(`  2. Fine Detail / Textured (Yellow): ${result.stats.detail.pct}% area (${result.stats.detail.count.toLocaleString()} faces)`);
  console.log(`------------------------------------------------------------`);

  if (options.paintBrand) {
    let brandFile = options.paintBrand;
    if (!brandFile.endsWith('.json')) brandFile += '.json';
    let jsonPath = path.join(__dirname, '..', 'dep', 'paints', brandFile);
    if (!fs.existsSync(jsonPath)) jsonPath = path.join(__dirname, '..', 'vendor', 'paints', brandFile);

    if (fs.existsSync(jsonPath)) {
      try {
        const brandData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const paints = brandData.paints || [];
        console.log(`\nMatched Miniature Paints (${brandData.displayName || brandFile}):`);

        const smoothMatch = findClosestPaint('#94a3b8', paints);
        if (smoothMatch) {
          console.log(`  Group 1 (Smooth #94a3b8) : ${smoothMatch.paint.name} (${smoothMatch.paint.hex}, ΔE ${smoothMatch.dE.toFixed(1)})`);
        }

        const detailMatch = findClosestPaint('#eab308', paints);
        if (detailMatch) {
          console.log(`  Group 2 (Detail #eab308) : ${detailMatch.paint.name} (${detailMatch.paint.hex}, ΔE ${detailMatch.dE.toFixed(1)})`);
        }
        console.log(`------------------------------------------------------------`);
      } catch (err) {
        console.error(`Error reading paint brand file ${jsonPath}: ${err.message}`);
      }
    } else {
      console.warn(`Paint brand file not found: ${jsonPath}`);
    }
  }

  if (options.outFile) {
    console.log(`Exporting colored mesh to ${options.outFile}...`);
    const COLORS = [
      [148, 163, 184], // Smooth: Slate Grey
      [234, 179, 8]    // Detail: Yellow
    ];
    let plyHeader = `ply\nformat ascii 1.0\nelement vertex ${numFaces * 3}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${numFaces}\nproperty list uchar int vertex_index\nend_header\n`;
    const out = fs.createWriteStream(options.outFile);
    out.write(plyHeader);

    for (let f = 0; f < numFaces; f++) {
      const cat = result.faceCategory[f];
      const rgb = COLORS[cat];
      const f9 = f * 9;
      for (let v = 0; v < 3; v++) {
        out.write(`${pos[f9 + v*3].toFixed(4)} ${pos[f9 + v*3 + 1].toFixed(4)} ${pos[f9 + v*3 + 2].toFixed(4)} ${rgb[0]} ${rgb[1]} ${rgb[2]}\n`);
      }
    }
    for (let f = 0; f < numFaces; f++) {
      const base = f * 3;
      out.write(`3 ${base} ${base+1} ${base+2}\n`);
    }
    out.end();
    console.log("Export complete.");
  }
}

if (require.main === module) {
  runCLI();
}

module.exports = { parseSTL, classifyMeshGeometry, hexToRgb, rgbToLab, deltaE2000, findClosestPaint, runCLI };

