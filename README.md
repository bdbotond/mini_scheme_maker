# mini_scheme_maker

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/bdbotond)

> **Browser-based 3D mesh surface segmentor and miniature paint-scheme planner.**

Drop a `.STL`, `.OBJ`, or `.miniseg.json` file onto the viewer. The tool automatically segments the mesh into surface patches by dihedral-angle crease detection, classifies them into customizable paint groups (such as *Large Smooth Surfaces* and *Fine Detail / Textured*), and lets you interactively repaint and match physical hobby paints to plan colour schemes for miniatures.

---

> [!TIP]
> 📖 **New to Mini Scheme Maker?** Check out the comprehensive [TUTORIAL.md](file:///home/bdbotond/python/mini_segmentor/TUTORIAL.md) for step-by-step guides, hobby workflows, and tips!  
> When you open the application in your browser, an interactive **Tutorial Pop-up** also launches automatically with an overview of all tools and options (press <kbd>?</kbd> or click **Tutorial** anytime).

> [!NOTE]
> **Segmentation runs entirely in your browser (WebGL / Three.js).** No server or upload is required.  
> The CLI tool (`src/surface_classifier.js`) performs the same geometry analysis as a standalone Node.js script.

---

## Features

| Feature | Detail |
|---|---|
| **Interactive Tutorial** | Built-in startup walkthrough modal detailing all tools & options (<kbd>?</kbd> key) |
| **Auto-segmentation** | Crease-angle BFS flood fill + edge-chain length & straightness noise filters |
| **Auto-calibration** | Curvature distribution sampling to choose ideal edge thresholds automatically |
| **6 Selection & Paint Tools** | Brush · Secondary Brush · Box Select · Radius Select · Sub-Split · Shape 3D Volume |
| **Color Recommender** | Interactive color wheel generating Complementary, Triadic, & Analogous harmonies |
| **Custom Paint Groups** | Unlimited color groups with inline color pickers, renaming, & area distribution bar |
| **Miniature Paint Matching** | Perceptual CIEDE2000 ΔE matching against Citadel, Vallejo, Army Painter, Scale75, etc. |
| **Rich Exports** | Coloured PLY, OBJ, CSV palette, PNG screenshot, standalone HTML paint sheet, Project JSON |
| **Customization** | Dark & Light themes, independent mouse orbit/pan/zoom speeds, rebindable keybinds |

---

## Quick Start

```bash
# Serve locally (any static server works)
npx serve .
# then open http://localhost:3000 in a browser
```

Opening `index.html` directly from your file system (`file://`) **also works** in most modern browsers.

---

## Tools Available

| Tool | Shortcut | Description |
|---|---|---|
| **Surface Brush** | <kbd>P</kbd> | Click any segment to inspect faces and open the group reassignment popup. Hold <kbd>Shift</kbd> + Drag to paint surfaces continuously. Keys <kbd>1</kbd>–<kbd>9</kbd> switch brush colors. |
| **Secondary Brush** | <kbd>Alt+P</kbd> | Background fine-crease segmentation. Hover to preview delicate sub-regions; click to reassign the highlighted area without resetting model colors. |
| **Box Select** | <kbd>B</kbd> | 2D rectangular marquee. Drag over the viewport to select multiple segments at once, then map them all to the active brush. |
| **Radius Select** | <kbd>R</kbd> | Circular radial brush with adjustable pixel radius slider (10–100 px). Perfect for selecting clustered parts (limbs, weapons, pauldrons). |
| **Sub-Split** | <kbd>S</kbd> | Crease subdivision slicer. Hover over smooth surfaces to preview subtle crease boundaries; click to permanently carve a new independent segment. |
| **Shape 3D Volume** | <kbd>V</kbd> | 3D volumetric selector (Box, Sphere, Cylinder) with 3D gizmos (Move <kbd>W</kbd>, Rotate <kbd>E</kbd>, Scale <kbd>R</kbd>), Snap-to-Click, coordinate inputs, and Apply Color (<kbd>Enter</kbd>). |

---

## Options & Sidebar Panels Available

- **Paint Groups Panel:**
  - Dynamic palette list showing surface area distribution percentage.
  - Inline color picker & hex input for each group.
  - Inline group name editing (e.g. *"Power Armor Base"*, *"Trim Gold"*, *"Leather"*).
  - `+ Add` button for unlimited custom groups; `Reset` to revert to base auto-segmentation.
- **Color Harmony Recommender (🎨):**
  - Accessible via the artist palette button in the top bar.
  - Interactive color wheel with lightness slider and hex input.
  - Offers color theory harmonies: *Complementary*, *Analogous*, *Triadic*, *Split-Complementary*, and *Square*.
  - 1-click apply to Groups 1–3 on your miniature.
- **Miniature Paint Matching:**
  - Select paint manufacturers: *Warhammer / Citadel* (Base, Layer, Contrast, Shade), *Vallejo Model Color*, *Vallejo Game Color*, *The Army Painter*, *Scale75*, and more.
  - Perceptual CIEDE2000 ΔE distance calculation for authentic physical paint recommendations.
  - **Apply to Model** button snaps digital colours to authentic hobby paint swatch colours.
- **Edge Detection & Hardness Tuner:**
  - *Hardness Slider (10°–60°):* Dihedral break angle threshold between faces.
  - *Smooth Patch Min Area (0.2%–6.0%):* Minimum area % required for smooth category.
  - *Min Feature Edge Length (1–25 edges):* Suppresses crease noise shorter than N edges.
  - *Edge Straightness Filter (0.0–0.95):* Requires feature lines to satisfy chord-to-arc straightness.
  - *Auto-Calibrate & Re-Segment:* Instant geometry-based parameter optimization.
- **Contextual Tool Settings:**
  - Dynamically updates with controls for the active tool (Secondary brush sliders, Sub-split angle, Radius size, Shape type/transform/dimensions).
- **Export & Download:**
  - *Download View (PNG):* Snapshot of current 3D view with paint scheme.
  - *Export 3D (.ply):* Stanford PLY with per-vertex RGBA colors (Blender, slicers, ZBrush).
  - *Export 3D (.obj):* Wavefront OBJ with vertex color data.
  - *Export Colors (.csv):* Spreadsheet with group names, hex codes, triangle counts, and matched paints.
  - *Save Paint Sheet (HTML):* Standalone portable HTML painting guide with renders, color swatches, and paint recipes.
  - *Save Project (.miniseg.json):* Full project save file preserving mesh geometry, segmented parts, and paint assignments.
- **Preferences & Settings (⚙️):**
  - Dark and Light theme toggle.
  - Mouse sensitivity sliders for Orbit, Pan, and Zoom speeds.
  - Rebindable keyboard shortcuts for all tools.
- **Startup Tutorial Pop-up:**
  - Pops up on startup to introduce tools and options.
  - Checkbox to toggle startup behavior.
  - Reopen anytime with the top bar **Tutorial** button or by pressing <kbd>?</kbd>.

---

## Keyboard Shortcuts (defaults, rebindable)

| Key | Action |
|---|---|
| <kbd>P</kbd> | Surface Brush tool |
| <kbd>Alt+P</kbd> | Secondary Brush tool |
| <kbd>B</kbd> | Box Select |
| <kbd>R</kbd> | Radius Select |
| <kbd>S</kbd> | Sub-Split tool |
| <kbd>V</kbd> | Shape 3D Volume Select |
| <kbd>1</kbd>–<kbd>9</kbd> | Set active brush group (or assign selection) |
| <kbd>Shift</kbd> + Drag | Continuous paint with active brush |
| <kbd>W</kbd> / <kbd>E</kbd> / <kbd>R</kbd> | Move / Rotate / Scale Shape volume gizmo |
| <kbd>Enter</kbd> | Apply color to enclosed Shape volume faces |
| <kbd>Esc</kbd> | Deselect all / Close popup |
| <kbd>?</kbd> | Open Tutorial & Feature Guide |

---

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

---

## Project Layout

```
mini_segmentor/
├── index.html              # Single-page browser app
├── TUTORIAL.md             # Complete user guide & tutorial
├── README.md               # Project documentation
├── src/
│   ├── js/
│   │   ├── tutorial.js         # Tutorial popup modal & startup guide
│   │   ├── color_utils.js      # sRGB → CIE-Lab, CIEDE2000, group colours
│   │   ├── color_recommender.js# Color wheel & harmonic scheme generator
│   │   ├── shape_segmentor.js  # 3D volumetric selection (Box/Sphere/Cylinder)
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
│   │   └── viewer.css          # Dark/Light theme styles, tool UI, modals
│   └── surface_classifier.js   # Node.js CLI (geometry only, no viewer)
├── dep/                    # Vendored Three.js + paint databases
├── samples/                # Sample STL/OBJ and project files
├── test/
│   └── classifier.test.js
└── tools/
    └── benchmark.js
```

---

## Browser Compatibility

Requires WebGL 2.0 and `BigInt` support. Works in Chrome 74+, Firefox 68+, Edge 79+, Safari 15+.

---

## License

MIT
