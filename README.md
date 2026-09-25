# mini_scheme_maker

> **Browser-based 3D mesh surface segmentor and miniature paint-scheme planner.**

Drop a `.STL` or `.OBJ` file onto the viewer. The tool automatically segments the mesh into surface patches by dihedral-angle crease detection, classifies them as *Large Smooth Surfaces* or *Fine Detail / Textured*, then lets you interactively repaint those groups to plan colour schemes for miniatures.

---

> [!NOTE]
> **Segmentation runs entirely in the browser (WebGL / Three.js).** No server is required.
> The CLI tool (`src/surface_classifier.js`) performs the same geometry analysis as a standalone Node.js script, but it does **not** connect to or control the browser viewer.

---

## Features

| Feature | Detail |
|---|---|
| Auto-segmentation | Crease-angle BFS + edge-chain length & straightness filters |
| Auto-calibration | Samples the mesh to pick an appropriate edge threshold |
| 4 selection tools | Brush · Box · Radius · Sub-Split |
| Custom paint groups | Unlimited colour groups; inline colour picker + name edit |
| Paint matching | CIEDE2000 ΔE matching to 10 + miniature paint ranges |
| Exports | Coloured PLY, OBJ, CSV palette, PNG snapshot, standalone HTML paint sheet |
| Settings | Dark / Light theme, orbit / pan / zoom speed, rebindable keys |

## Quick Start

```bash
# Serve locally (any static server works)
npx serve .
# then open http://localhost:3000 in a browser
```

Open `index.html` directly from the file system (`file://`) **also works** for most browsers.

## Usage (Browser)

1. **Open Model** — click the button or drag a `.STL` / `.OBJ` file onto the canvas.
2. The mesh is segmented automatically. Grey patches = large smooth surfaces; yellow = fine detail.
3. **Tune segmentation** with the sliders in the right panel (*Edge Detection & Hardness Tuner*).
4. **Re-assign segments:**
   - **Brush (P):** Click a segment to select it → popup appears → choose a group. `Shift+Drag` to paint directly.
   - **Box Select (B):** Drag a rectangle over the model; all segments inside are selected.
   - **Radius Select (R):** Click/drag a circle; segments within the radius are selected.
   - **Sub-Split (S):** Hover over a surface to preview a finer crease patch; click to split it off as its own segment.
5. **Paint Groups** panel — rename groups, change colours, and see closest matching miniature paints.
6. **Export** — download the coloured mesh, colour palette CSV, or a paint-reference HTML page.

### Keyboard Shortcuts (defaults, rebindable)

| Key | Action |
|---|---|
| `P` | Brush tool |
| `B` | Box Select |
| `R` | Radius Select |
| `S` | Sub-Split |
| `1`–`9` | Set active brush group (or assign selection) |
| `Esc` | Deselect all |

## Usage (CLI — geometry classification only)

The Node.js CLI classifies a mesh and optionally writes a coloured PLY. It does **not** open a viewer.

```bash
node src/surface_classifier.js <mesh.stl> [options]

Options:
  --angle <deg>         Dihedral crease threshold (auto-calibrated if omitted)
  --areaPct <pct>       Min smooth-patch area as % of total (default: 2.0)
  --merge <n>           Min face count to absorb tiny patches (default: 2)
  --minEdgeLen <n>      Ignore crease chains shorter than N edges (default: 1)
  --straightness <0-1>  Min chord/arc ratio for crease chains (default: 0 = off)
  --paint-brand <file>  Match paints from dep/paints/<file>.json (e.g. Warhammer_Colour)
  --out <output.ply>    Write coloured PLY file
```

**Example:**
```bash
node src/surface_classifier.js samples/SG_Assault_r_3_head.stl --out head_out.ply
```

## Project Layout

```
mini_segmentor/
├── index.html              # Single-page browser app
├── src/
│   ├── js/
│   │   ├── color_utils.js      # sRGB → CIE-Lab, CIEDE2000, group colours
│   │   ├── mesh_topology.js    # BFS segmentation, vertex welding, face colouring
│   │   ├── paint_manager.js    # Paint-brand loading, paint-groups panel UI
│   │   ├── exporters.js        # PLY / OBJ / CSV / PNG / HTML export
│   │   ├── scene.js            # Three.js scene, camera, lights, controls
│   │   ├── selection.js        # Part picking, box/radius select, brush paint
│   │   ├── popup.js            # Part-reassignment popup
│   │   ├── gizmo.js            # Orientation cube + camera snap
│   │   ├── settings.js         # Theme, speed, keybinds, localStorage
│   │   ├── file_loader.js      # STL/OBJ file parsing, drag-drop
│   │   └── app.js              # Bootstrap: animation loop, slider wiring
│   ├── css/
│   │   └── viewer.css
│   └── surface_classifier.js   # Node.js CLI (geometry only, no viewer)
├── dep/                    # Vendored Three.js + paint databases
├── samples/                # Sample STL/OBJ files
├── test/
│   └── classifier.test.js
└── tools/
    └── benchmark.js
```

## Browser Compatibility

Requires WebGL 2.0 and `BigInt` support. Works in Chrome 74+, Firefox 68+, Edge 79+, Safari 15+.

## License

MIT
