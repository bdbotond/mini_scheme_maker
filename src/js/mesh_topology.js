/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Mesh Topology, Spatial Hashing, and Surface Segmentation BFS
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
    root.MeshTopology = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const COLOR_HOVER = typeof THREE !== 'undefined' ? new THREE.Color(0.0, 0.9, 1.0) : null;    // Bright Electric Cyan
  const COLOR_SELECTED = typeof THREE !== 'undefined' ? new THREE.Color(1.0, 1.0, 1.0) : null; // Radiant Pure White
  const COLOR_DIMMED = typeof THREE !== 'undefined' ? new THREE.Color("#262933") : null;

  // State
  let currentMesh = null;
  let loadedFileName = "model";
  let numFaces = 0;
  let totalMeshArea = 0;

  // Topology TypedArrays
  let faceNormals = null;      // Float32Array (numFaces * 3)
  let faceAreas = null;        // Float32Array (numFaces)
  let faceMaxAngle = null;     // Float32Array (numFaces)

  // Edge Graph
  let adjHead = null;          // Int32Array (numFaces)
  let adjNext = null;          // Int32Array (numFaces * 6)
  let adjTo = null;            // Int32Array (numFaces * 6)
  let edgeAngle = null;        // Float32Array (numFaces * 6)
  let meshEdges = null;        // Array of { u, w, f1, f2, angle }
  let uniqueVertPositions = null; // Float32Array (numUniqueVerts * 3)

  // Connected Surface Parts & Groups
  let partOfFace = null;       // Int32Array (numFaces) - maps each face to its connected part ID
  let partFaces = [];          // Array of Array<number> for each part ID
  let partGroup = null;        // Int32Array (numParts) - group assigned to each part (1, 2, 3, 4...)
  let initialPartGroup = null; // Int32Array (numParts) - original auto classification
  let numParts = 0;

  let partCenters = null;      // Float32Array (numParts * 3)
  let partNormals = null;      // Float32Array (numParts * 3)

  let subSplitHoverFace = -1;
  let subSplitHoverFaces = null;
  let subSplitHoverParentPart = -1;

  function computePartSpatialData() {
    if (!currentMesh || numParts === 0) return;
    const pos = currentMesh.geometry.attributes.position.array;
    partCenters = new Float32Array(numParts * 3);
    partNormals = new Float32Array(numParts * 3);

    for (let p = 0; p < numParts; p++) {
      const faces = partFaces[p];
      let cx = 0, cy = 0, cz = 0;
      let nx = 0, ny = 0, nz = 0;
      const count = faces ? faces.length : 0;
      for (let i = 0; i < count; i++) {
        const f = faces[i];
        const f9 = f * 9;
        cx += (pos[f9] + pos[f9 + 3] + pos[f9 + 6]) / 3;
        cy += (pos[f9 + 1] + pos[f9 + 4] + pos[f9 + 7]) / 3;
        cz += (pos[f9 + 2] + pos[f9 + 5] + pos[f9 + 8]) / 3;
        nx += faceNormals[f * 3];
        ny += faceNormals[f * 3 + 1];
        nz += faceNormals[f * 3 + 2];
      }
      if (count > 0) {
        partCenters[p * 3] = cx / count;
        partCenters[p * 3 + 1] = cy / count;
        partCenters[p * 3 + 2] = cz / count;
        const len = Math.hypot(nx, ny, nz) || 1;
        partNormals[p * 3] = nx / len;
        partNormals[p * 3 + 1] = ny / len;
        partNormals[p * 3 + 2] = nz / len;
      }
    }
  }

  // 1. Normalized Bounding-Box 3D Spatial Hashing & Topology
  function buildMeshTopology(posArray, count) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    faceNormals = new Float32Array(count * 3);
    faceAreas = new Float32Array(count);
    totalMeshArea = 0;

    for (let f = 0; f < count; f++) {
      const f9 = f * 9;
      const ax = posArray[f9], ay = posArray[f9+1], az = posArray[f9+2];
      const bx = posArray[f9+3], by = posArray[f9+4], bz = posArray[f9+5];
      const cx = posArray[f9+6], cy = posArray[f9+7], cz = posArray[f9+8];

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
      totalMeshArea += a;

      const inv = crossLen > 1e-7 ? 1 / crossLen : 0;
      faceNormals[f * 3] = nx * inv;
      faceNormals[f * 3 + 1] = ny * inv;
      faceNormals[f * 3 + 2] = nz * inv;
    }

    // Normalized bounding-box 3D spatial hashing (64-bit BigInt keys)
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scale = 200000 / extent;
    const vertMap = new Map();
    let nextVertId = 0;
    const faceVerts = new Int32Array(count * 3);
    const vertPosList = [];

    for (let i = 0; i < count * 3; i++) {
      const px = posArray[i * 3], py = posArray[i * 3 + 1], pz = posArray[i * 3 + 2];
      const ix = BigInt(Math.round((px - minX) * scale));
      const iy = BigInt(Math.round((py - minY) * scale));
      const iz = BigInt(Math.round((pz - minZ) * scale));
      const vKey = (ix << 42n) | (iy << 21n) | iz;
      let vid = vertMap.get(vKey);
      if (vid === undefined) {
        vid = nextVertId++;
        vertMap.set(vKey, vid);
        vertPosList.push(px, py, pz);
      }
      faceVerts[i] = vid;
    }
    uniqueVertPositions = new Float32Array(vertPosList);

    // Flat typed arrays (adjHead, adjNext, adjTo, edgeAngle) + undirected edge registry
    const edgeMap = new Map();
    adjHead = new Int32Array(count).fill(-1);
    adjNext = new Int32Array(count * 6);
    adjTo = new Int32Array(count * 6);
    edgeAngle = new Float32Array(count * 6);
    meshEdges = [];
    let adjCount = 0;

    for (let f = 0; f < count; f++) {
      const f3 = f * 3;
      const v0 = faceVerts[f3], v1 = faceVerts[f3+1], v2 = faceVerts[f3+2];
      const edges = [[v0, v1], [v1, v2], [v2, v0]];

      for (let e = 0; e < 3; e++) {
        const a = edges[e][0], b = edges[e][1];
        const u = a < b ? a : b, w = a < b ? b : a;
        const eKey = (BigInt(u) << 32n) | BigInt(w);
        const existingFace = edgeMap.get(eKey);
        if (existingFace !== undefined) {
          const dot = faceNormals[f*3]*faceNormals[existingFace*3] +
                      faceNormals[f*3+1]*faceNormals[existingFace*3+1] +
                      faceNormals[f*3+2]*faceNormals[existingFace*3+2];
          const clampedDot = Math.max(-1, Math.min(1, dot));
          const angleDeg = Math.acos(clampedDot) * (180 / Math.PI);

          adjTo[adjCount] = existingFace; edgeAngle[adjCount] = angleDeg; adjNext[adjCount] = adjHead[f]; adjHead[f] = adjCount++;
          adjTo[adjCount] = f; edgeAngle[adjCount] = angleDeg; adjNext[adjCount] = adjHead[existingFace]; adjHead[existingFace] = adjCount++;

          meshEdges.push({ u, w, f1: existingFace, f2: f, angle: angleDeg });
        } else {
          edgeMap.set(eKey, f);
        }
      }
    }

    faceMaxAngle = new Float32Array(count);
    for (let f = 0; f < count; f++) {
      let maxA = 0;
      for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
        if (edgeAngle[e] > maxA) maxA = edgeAngle[e];
      }
      faceMaxAngle[f] = maxA;
    }
  }

  // 2. Crease-Angle BFS & Connected Component Segmentation
  function runSegmentation() {
    if (!faceMaxAngle || numFaces === 0 || !currentMesh) return;

    const edgeThreshEl = document.getElementById('hardness-slider');
    const areaPctEl = document.getElementById('area-slider');
    const edgeThresh = edgeThreshEl ? parseFloat(edgeThreshEl.value) : 24;
    const areaPct = areaPctEl ? parseFloat(areaPctEl.value) : 2.0;
    const smoothAreaThreshold = totalMeshArea * (areaPct / 100);

    const edgeLenEl = document.getElementById('edge-len-slider');
    const edgeStraightEl = document.getElementById('edge-straight-slider');
    const minEdgeLen = edgeLenEl ? (parseInt(edgeLenEl.value, 10) || 1) : 3;
    const minStraightness = edgeStraightEl ? (parseFloat(edgeStraightEl.value) || 0.0) : 0.0;

    // 1. Detect edge faces using edge chain following & straightness filtering
    const isEdgeFace = new Uint8Array(numFaces);

    if (meshEdges && meshEdges.length > 0 && (minEdgeLen > 1 || minStraightness > 0)) {
      const sharpEdges = [];
      const vertSharpAdj = new Map();

      for (let i = 0; i < meshEdges.length; i++) {
        const me = meshEdges[i];
        if (me.angle >= edgeThresh) {
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

        if (minStraightness > 0 && uniqueVertPositions) {
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
          if (edgeAngle[e] >= edgeThresh) { isEdgeFace[f] = 1; break; }
        }
      }
    }

    // 2. BFS: partition non-edge faces
    partOfFace = new Int32Array(numFaces).fill(-1);
    const queue = new Int32Array(numFaces);
    numParts = 0;
    const partArea = [];
    partFaces = [];

    for (let f = 0; f < numFaces; f++) {
      if (isEdgeFace[f] || partOfFace[f] !== -1) continue;
      let qHead = 0, qTail = 0;
      queue[qTail++] = f;
      partOfFace[f] = numParts;
      let pArea = 0;
      const pFaceList = [];

      while (qHead < qTail) {
        const curr = queue[qHead++];
        pArea += faceAreas[curr];
        pFaceList.push(curr);
        for (let e = adjHead[curr]; e !== -1; e = adjNext[e]) {
          const n = adjTo[e];
          if (!isEdgeFace[n] && partOfFace[n] === -1) {
            partOfFace[n] = numParts;
            queue[qTail++] = n;
          }
        }
      }
      partArea.push(pArea);
      partFaces.push(pFaceList);
      numParts++;
    }

    // 3. Classify non-edge parts
    partGroup = [];
    initialPartGroup = [];
    for (let p = 0; p < numParts; p++) {
      const g = partArea[p] >= smoothAreaThreshold ? 1 : 2;
      partGroup.push(g);
      initialPartGroup.push(g);
    }

    // 4. Per-triangle vote-based edge absorption
    let changed = true;
    while (changed) {
      changed = false;
      for (let f = 0; f < numFaces; f++) {
        if (!isEdgeFace[f] || partOfFace[f] !== -1) continue;

        let bestPart = -1, bestVotes = 0;
        for (let e = adjHead[f]; e !== -1; e = adjNext[e]) {
          const rp = partOfFace[adjTo[e]];
          if (rp === -1) continue;
          let votes = 0;
          for (let e2 = adjHead[f]; e2 !== -1; e2 = adjNext[e2]) {
            if (partOfFace[adjTo[e2]] === rp) votes++;
          }
          if (votes > bestVotes || (votes === bestVotes && partArea[rp] > partArea[bestPart])) {
            bestVotes = votes; bestPart = rp;
          }
        }

        if (bestPart !== -1) {
          partOfFace[f] = bestPart;
          partFaces[bestPart].push(f);
          partArea[bestPart] += faceAreas[f];
          changed = true;
        }
      }
    }

    // 5. Fallback: isolated faces
    let biggestPart = 0;
    for (let p = 1; p < numParts; p++) {
      if (partArea[p] > partArea[biggestPart]) biggestPart = p;
    }
    for (let f = 0; f < numFaces; f++) {
      if (partOfFace[f] === -1) {
        partOfFace[f] = biggestPart;
        partFaces[biggestPart].push(f);
      }
    }

    const statParts = document.getElementById('stat-parts');
    if (statParts) statParts.textContent = numParts.toLocaleString();

    computePartSpatialData();
    clearSubSplitPreview();
    if (typeof selectedPartIds !== 'undefined' && selectedPartIds) selectedPartIds.clear();
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
    if (typeof closeGroupPopup === 'function') closeGroupPopup();
    fullColorMesh();
    if (typeof updateLiveStats === 'function') updateLiveStats();
  }

  function autoCalibrateAndSegment() {
    if (!faceMaxAngle || numFaces === 0) return;

    const sampleStep = Math.max(1, Math.floor(numFaces / 3000));
    const sampledAngles = [];
    for (let f = 0; f < numFaces; f += sampleStep) {
      const a = faceMaxAngle[f];
      if (a > 5) sampledAngles.push(a);
    }
    sampledAngles.sort((a,b) => a - b);

    let autoAngle = 24;
    if (sampledAngles.length > 0) {
      const p80 = sampledAngles[Math.floor(sampledAngles.length * 0.80)];
      autoAngle = Math.max(20, Math.min(32, Math.round(p80)));
    }

    const hs = document.getElementById('hardness-slider');
    const hv = document.getElementById('hardness-val');
    const as = document.getElementById('area-slider');
    const av = document.getElementById('area-val');

    if (hs) hs.value = autoAngle;
    if (hv) hv.textContent = autoAngle + '°';
    if (as) as.value = 2.0;
    if (av) av.textContent = '2.0%';

    runSegmentation();
  }

  function clearSubSplitPreview() {
    if (subSplitHoverFaces && subSplitHoverFaces.length > 0 && subSplitHoverParentPart !== -1) {
      writeFaceSliceColor(subSplitHoverFaces, subSplitHoverParentPart, 'base');
    }
    subSplitHoverFace = -1;
    subSplitHoverFaces = null;
    subSplitHoverParentPart = -1;
  }

  function computeSubPatchAtFace(seedFace, subAngle) {
    if (!currentMesh || seedFace < 0 || seedFace >= numFaces || !partOfFace) return null;
    const parentPart = partOfFace[seedFace];
    if (parentPart < 0 || parentPart >= numParts) return null;

    const parentFaceList = partFaces[parentPart];
    if (!parentFaceList || parentFaceList.length <= 1) {
      return { parentPart, faces: [seedFace] };
    }

    const inParent = new Uint8Array(numFaces);
    for (let i = 0; i < parentFaceList.length; i++) {
      inParent[parentFaceList[i]] = 1;
    }

    const visited = new Uint8Array(numFaces);
    const subFaces = [];
    const q = [seedFace];
    visited[seedFace] = 1;
    let qi = 0;

    const seedNx = faceNormals[seedFace * 3];
    const seedNy = faceNormals[seedFace * 3 + 1];
    const seedNz = faceNormals[seedFace * 3 + 2];
    const maxSeedDevRad = Math.min(Math.PI * 0.45, (subAngle * Math.PI / 180) * 2.5);
    const minSeedDot = Math.cos(maxSeedDevRad);

    while (qi < q.length) {
      const curr = q[qi++];
      subFaces.push(curr);
      for (let e = adjHead[curr]; e !== -1; e = adjNext[e]) {
        const nb = adjTo[e];
        if (inParent[nb] && !visited[nb] && edgeAngle[e] < subAngle) {
          const dotSeed = seedNx * faceNormals[nb * 3] +
                          seedNy * faceNormals[nb * 3 + 1] +
                          seedNz * faceNormals[nb * 3 + 2];
          if (dotSeed >= minSeedDot) {
            visited[nb] = 1;
            q.push(nb);
          }
        }
      }
    }

    return { parentPart, faces: subFaces };
  }

  function writeFaceSliceColor(faceIndices, parentPartId, mode) {
    if (!currentMesh || !faceIndices || faceIndices.length === 0) return;
    const colorAttr = currentMesh.geometry.attributes.color;
    const colorsArr = colorAttr.array;

    let col;
    if (mode === 'hover') {
      col = COLOR_HOVER;
    } else if (mode === 'selected') {
      col = COLOR_SELECTED;
    } else {
      const g = (parentPartId >= 0 && parentPartId < numParts) ? partGroup[parentPartId] : 1;
      col = getGroupColor(g);
      if (typeof isolatedCategory !== 'undefined' && isolatedCategory !== -1 && g !== isolatedCategory) {
        col = COLOR_DIMMED;
      }
    }

    for (let i = 0; i < faceIndices.length; i++) {
      const f9 = faceIndices[i] * 9;
      for (let v = 0; v < 3; v++) {
        colorsArr[f9 + v*3] = col.r;
        colorsArr[f9 + v*3 + 1] = col.g;
        colorsArr[f9 + v*3 + 2] = col.b;
      }
    }
    colorAttr.needsUpdate = true;
  }

  function fullColorMesh() {
    if (!currentMesh) return;
    const colorAttr = currentMesh.geometry.attributes.color;
    const colorsArr = colorAttr.array;

    for (let p = 0; p < numParts; p++) {
      const g = partGroup[p];
      let col = getGroupColor(g);

      if (typeof isolatedCategory !== 'undefined' && isolatedCategory !== -1 && g !== isolatedCategory) {
        col = COLOR_DIMMED;
      }

      if (typeof selectedPartIds !== 'undefined' && selectedPartIds && selectedPartIds.has(p)) {
        col = COLOR_SELECTED;
      }

      const faces = partFaces[p];
      for (let i = 0; i < faces.length; i++) {
        const f9 = faces[i] * 9;
        for (let v = 0; v < 3; v++) {
          colorsArr[f9 + v*3] = col.r;
          colorsArr[f9 + v*3 + 1] = col.g;
          colorsArr[f9 + v*3 + 2] = col.b;
        }
      }
    }
    colorAttr.needsUpdate = true;
  }

  function writePartSliceColor(partId, mode) {
    if (!currentMesh || partId < 0 || partId >= numParts) return;
    const colorAttr = currentMesh.geometry.attributes.color;
    const colorsArr = colorAttr.array;

    let col;
    if (mode === 'selected') {
      col = COLOR_SELECTED;
    } else if (mode === 'hover') {
      col = COLOR_HOVER;
    } else {
      const g = partGroup[partId];
      col = getGroupColor(g);
      if (typeof isolatedCategory !== 'undefined' && isolatedCategory !== -1 && g !== isolatedCategory) {
        col = COLOR_DIMMED;
      }
    }

    const faces = partFaces[partId];
    for (let i = 0; i < faces.length; i++) {
      const f9 = faces[i] * 9;
      for (let v = 0; v < 3; v++) {
        colorsArr[f9 + v*3] = col.r;
        colorsArr[f9 + v*3 + 1] = col.g;
        colorsArr[f9 + v*3 + 2] = col.b;
      }
    }
    colorAttr.needsUpdate = true;
  }

  return {
    COLOR_HOVER,
    COLOR_SELECTED,
    COLOR_DIMMED,
    get currentMesh() { return currentMesh; },
    set currentMesh(v) { currentMesh = v; },
    get loadedFileName() { return loadedFileName; },
    set loadedFileName(v) { loadedFileName = v; },
    get numFaces() { return numFaces; },
    set numFaces(v) { numFaces = v; },
    get totalMeshArea() { return totalMeshArea; },
    set totalMeshArea(v) { totalMeshArea = v; },
    get faceNormals() { return faceNormals; },
    set faceNormals(v) { faceNormals = v; },
    get faceAreas() { return faceAreas; },
    set faceAreas(v) { faceAreas = v; },
    get faceMaxAngle() { return faceMaxAngle; },
    set faceMaxAngle(v) { faceMaxAngle = v; },
    get adjHead() { return adjHead; },
    get adjNext() { return adjNext; },
    get adjTo() { return adjTo; },
    get edgeAngle() { return edgeAngle; },
    get meshEdges() { return meshEdges; },
    get uniqueVertPositions() { return uniqueVertPositions; },
    get partOfFace() { return partOfFace; },
    set partOfFace(v) { partOfFace = v; },
    get partFaces() { return partFaces; },
    set partFaces(v) { partFaces = v; },
    get partGroup() { return partGroup; },
    set partGroup(v) { partGroup = v; },
    get initialPartGroup() { return initialPartGroup; },
    set initialPartGroup(v) { initialPartGroup = v; },
    get numParts() { return numParts; },
    set numParts(v) { numParts = v; },
    get partCenters() { return partCenters; },
    set partCenters(v) { partCenters = v; },
    get partNormals() { return partNormals; },
    set partNormals(v) { partNormals = v; },
    get subSplitHoverFace() { return subSplitHoverFace; },
    set subSplitHoverFace(v) { subSplitHoverFace = v; },
    get subSplitHoverFaces() { return subSplitHoverFaces; },
    set subSplitHoverFaces(v) { subSplitHoverFaces = v; },
    get subSplitHoverParentPart() { return subSplitHoverParentPart; },
    set subSplitHoverParentPart(v) { subSplitHoverParentPart = v; },
    computePartSpatialData,
    buildMeshTopology,
    runSegmentation,
    autoCalibrateAndSegment,
    clearSubSplitPreview,
    computeSubPatchAtFace,
    writeFaceSliceColor,
    writePartSliceColor,
    fullColorMesh
  };
});
