/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Exporters: PNG Snapshot, Stanford PLY, Wavefront OBJ, CSV Palette, Standalone HTML
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.Exporters = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function downloadViewPNG() {
    if (!currentMesh || numFaces === 0) {
      showToast("Please load a 3D model first.", "warning");
      return;
    }

    if (typeof clearSubSplitPreview === 'function') clearSubSplitPreview();
    const hadHover = typeof hoveredPartId !== 'undefined' ? hoveredPartId : -1;
    const hadSelected = typeof selectedPartIds !== 'undefined' ? new Set(selectedPartIds) : new Set();
    if (hadHover !== -1) writePartSliceColor(hadHover, 'base');
    hadSelected.forEach(pId => writePartSliceColor(pId, 'base'));

    renderer.render(scene, camera);

    renderer.domElement.toBlob((blob) => {
      hadSelected.forEach(pId => writePartSliceColor(pId, 'selected'));
      if (hadHover !== -1 && !hadSelected.has(hadHover)) writePartSliceColor(hadHover, 'hover');
      renderer.render(scene, camera);

      if (!blob) return;
      const baseName = (loadedFileName || 'model').replace(/\.[^/.]+$/, '');
      const link = document.createElement('a');
      const blobUrl = URL.createObjectURL(blob);
      link.href = blobUrl;
      link.download = `${baseName}_view.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      showToast(`Saved view snapshot: ${baseName}_view.png`, "success");
    }, 'image/png');
  }

  function exportColoredPLY() {
    if (!currentMesh || numFaces === 0) {
      showToast("Please load a 3D model first.", "warning");
      return;
    }
    const geom = currentMesh.geometry;
    const pos = geom.attributes.position.array;
    const numVertices = numFaces * 3;

    const header = `ply\nformat binary_little_endian 1.0\ncomment Exported from 3D Surface Segmentor\nelement vertex ${numVertices}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${numFaces}\nproperty list uchar int vertex_index\nend_header\n`;

    const headerBytes = new TextEncoder().encode(header);
    const vertexByteLength = 15; // 3 * float32 (12) + 3 * uchar (3)
    const faceByteLength = 13;   // 1 * uchar (1) + 3 * int32 (12)

    const totalBytes = headerBytes.byteLength + (numVertices * vertexByteLength) + (numFaces * faceByteLength);
    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    const u8View = new Uint8Array(buffer);
    u8View.set(headerBytes, 0);

    let offset = headerBytes.byteLength;

    for (let f = 0; f < numFaces; f++) {
      const pId = partOfFace ? partOfFace[f] : 0;
      const g = (partGroup && pId >= 0 && pId < numParts) ? partGroup[pId] : 1;
      const c = getGroupColor(g);
      const r = Math.round(Math.min(1, Math.max(0, c.r)) * 255);
      const gr = Math.round(Math.min(1, Math.max(0, c.g)) * 255);
      const b = Math.round(Math.min(1, Math.max(0, c.b)) * 255);

      const f9 = f * 9;
      for (let v = 0; v < 3; v++) {
        view.setFloat32(offset, pos[f9 + v * 3], true);
        view.setFloat32(offset + 4, pos[f9 + v * 3 + 1], true);
        view.setFloat32(offset + 8, pos[f9 + v * 3 + 2], true);
        view.setUint8(offset + 12, r);
        view.setUint8(offset + 13, gr);
        view.setUint8(offset + 14, b);
        offset += 15;
      }
    }

    for (let f = 0; f < numFaces; f++) {
      const base = f * 3;
      view.setUint8(offset, 3);
      view.setInt32(offset + 1, base, true);
      view.setInt32(offset + 5, base + 1, true);
      view.setInt32(offset + 9, base + 2, true);
      offset += 13;
    }

    const baseName = (loadedFileName || 'model').replace(/\.[^/.]+$/, '');
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    link.href = blobUrl;
    link.download = `${baseName}_classified.ply`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    showToast(`Exported PLY: ${baseName}_classified.ply`, "success");
  }

  function exportColoredOBJ() {
    if (!currentMesh || numFaces === 0) {
      showToast("Please load a 3D model first.", "warning");
      return;
    }
    const geom = currentMesh.geometry;
    const pos = geom.attributes.position.array;
    const chunks = [];
    chunks.push("# Exported from 3D Surface Segmentor\n");

    const batchSize = 500000;
    let vStr = "";
    for (let f = 0; f < numFaces; f++) {
      const pId = partOfFace ? partOfFace[f] : 0;
      const g = (partGroup && pId >= 0 && pId < numParts) ? partGroup[pId] : 1;
      const c = getGroupColor(g);
      const cr = c.r.toFixed(4);
      const cg = c.g.toFixed(4);
      const cb = c.b.toFixed(4);

      const f9 = f * 9;
      for (let v = 0; v < 3; v++) {
        vStr += `v ${pos[f9 + v*3].toFixed(4)} ${pos[f9 + v*3 + 1].toFixed(4)} ${pos[f9 + v*3 + 2].toFixed(4)} ${cr} ${cg} ${cb}\n`;
      }
      if (vStr.length > batchSize) {
        chunks.push(vStr);
        vStr = "";
      }
    }
    if (vStr) chunks.push(vStr);

    let fStr = "";
    for (let f = 0; f < numFaces; f++) {
      const base = f * 3 + 1;
      fStr += `f ${base} ${base + 1} ${base + 2}\n`;
      if (fStr.length > batchSize) {
        chunks.push(fStr);
        fStr = "";
      }
    }
    if (fStr) chunks.push(fStr);

    const baseName = (loadedFileName || 'model').replace(/\.[^/.]+$/, '');
    const blob = new Blob(chunks, { type: 'text/plain' });
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    link.href = blobUrl;
    link.download = `${baseName}_classified.obj`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    showToast(`Exported OBJ: ${baseName}_classified.obj`, "success");
  }

  function exportColorsCSV() {
    if (!currentMesh || numFaces === 0) {
      showToast('Please load a 3D model first.', 'warning');
      return;
    }
    const paints = loadedPaintBrands.get(currentSelectedBrandFile) || [];
    const mfr = (currentSelectedBrandFile || '').replace(/_/g,' ').replace('.json','');

    let csv = 'Group,Name,Hex,Coverage%,Faces,Manufacturer,ManufacturerColor\r\n';
    const allGroups = [1, 2, ...Array.from(userCreatedGroups).filter(g=>g>2).sort((a,b)=>a-b)];

    for (const g of allGroups) {
      const colHex = getGroupColorHex(g);
      const name = getGroupName(g, false);
      let faceCount = 0, areaSum = 0;
      for (let p = 0; p < numParts; p++) {
        if (partGroup[p] === g) {
          faceCount += partFaces[p] ? partFaces[p].length : 0;
          if (faceAreas && partFaces[p]) {
            for (let i = 0; i < partFaces[p].length; i++) areaSum += faceAreas[partFaces[p][i]];
          }
        }
      }
      const pct = totalMeshArea > 0 ? (areaSum / totalMeshArea * 100).toFixed(1) : '0';
      let paintName = '', paintHex = '';
      if (paints.length > 0) {
        const match = findClosestPaint(colHex, paints);
        if (match) { paintName = match.paint.name; paintHex = match.paint.hex; }
      }
      csv += `${g},"${name.replace(/"/g,'""')}",${colHex},${pct},${faceCount},"${mfr.replace(/"/g,'""')}","${paintName.replace(/"/g,'""')} ${paintHex}"\r\n`;
    }

    const baseName = (loadedFileName || 'model').replace(/\.[^/.]+$/, '');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    link.href = blobUrl;
    link.download = `${baseName}_colors.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    showToast(`Exported CSV: ${baseName}_colors.csv`, 'success');
  }

  function saveViewHTML() {
    if (!currentMesh || numFaces === 0) {
      showToast('Please load a 3D model first.', 'warning');
      return;
    }

    if (typeof clearSubSplitPreview === 'function') clearSubSplitPreview();
    const hadHover = typeof hoveredPartId !== 'undefined' ? hoveredPartId : -1;
    const hadSelected = typeof selectedPartIds !== 'undefined' ? new Set(selectedPartIds) : new Set();
    if (hadHover !== -1) writePartSliceColor(hadHover, 'base');
    hadSelected.forEach(p => writePartSliceColor(p, 'base'));
    renderer.render(scene, camera);
    const imgDataUrl = renderer.domElement.toDataURL('image/png');
    hadSelected.forEach(p => writePartSliceColor(p, 'selected'));
    if (hadHover !== -1 && !hadSelected.has(hadHover)) writePartSliceColor(hadHover, 'hover');
    renderer.render(scene, camera);

    const paints = loadedPaintBrands.get(currentSelectedBrandFile) || [];
    const mfr = (currentSelectedBrandFile || '').replace(/_/g,' ').replace('.json','');
    const allGroups = [1, 2, ...Array.from(userCreatedGroups).filter(g=>g>2).sort((a,b)=>a-b)];
    const baseName = (loadedFileName||'model').replace(/\.[^/.]+$/, '');

    let rowsHtml = '';
    for (const g of allGroups) {
      const colHex = getGroupColorHex(g);
      const name = getGroupName(g, false);
      let areaSum = 0;
      for (let p = 0; p < numParts; p++) {
        if (partGroup[p] === g && faceAreas && partFaces[p])
          for (let i = 0; i < partFaces[p].length; i++) areaSum += faceAreas[partFaces[p][i]];
      }
      const pct = totalMeshArea > 0 ? (areaSum / totalMeshArea * 100).toFixed(1) : '0';

      let paintRow = '';
      if (paints.length > 0) {
        const match = findClosestPaint(colHex, paints);
        if (match) {
          paintRow = `<div style="font-size:11px;color:#888;margin-top:3px;display:flex;align-items:center;gap:5px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${match.paint.hex};display:inline-block;border:1px solid #ccc"></span>
            ${escapeHtml(mfr)}: ${escapeHtml(match.paint.name)} <span style="color:#aaa">${match.paint.hex}</span>
          </div>`;
        }
      }

      rowsHtml += `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #eee;">
          <span style="width:24px;height:24px;border-radius:4px;background:${colHex};display:inline-block;flex-shrink:0;border:1px solid #ccc;margin-top:2px"></span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#222">${escapeHtml(name)} <span style="font-size:11px;color:#888;font-weight:400">${colHex}</span></div>
            <div style="font-size:11px;color:#666">Coverage: ${pct}%</div>
            ${paintRow}
          </div>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(baseName)} – Paint Reference</title>
<style>
  body { margin:0; font-family: -apple-system, sans-serif; background:#fafafa; color:#222; }
  .wrap { display:flex; min-height:100vh; }
  .canvas-col { flex:1; background:#1a1a1a; display:flex; align-items:center; justify-content:center; padding:24px; }
  .canvas-col img { max-width:100%; max-height:90vh; border-radius:8px; }
  .sidebar { width:280px; background:#fff; border-left:1px solid #e5e7eb; padding:20px; overflow-y:auto; }
  h1 { font-size:16px; font-weight:700; margin:0 0 16px; color:#111; }
</style>
</head>
<body>
<div class="wrap">
  <div class="canvas-col"><img src="${imgDataUrl}" alt="Model view"></div>
  <div class="sidebar">
    <h1>${escapeHtml(baseName)}</h1>
    ${rowsHtml}
  </div>
</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    link.href = blobUrl;
    link.download = `${baseName}_paint_reference.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    showToast(`Saved paint sheet: ${baseName}_paint_reference.html`, 'success');
  }

  return {
    downloadViewPNG,
    exportColoredPLY,
    exportColoredOBJ,
    exportColorsCSV,
    saveViewHTML
  };
});
