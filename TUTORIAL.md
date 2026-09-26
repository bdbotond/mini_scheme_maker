# Mini Scheme Maker — Complete Guide & Tutorial

> **Interactive 3D Miniature Paint-Scheme Planner & Surface Segmentor**  
> Plan, segment, repaint, and match genuine physical miniature paints directly in your browser.

---

## Table of Contents

1. [Introduction & Core Concepts](#1-introduction--core-concepts)
2. [Quick-Start Walkthrough](#2-quick-start-walkthrough)
3. [Interface Overview](#3-interface-overview)
4. [Selection & Painting Tools](#4-selection--painting-tools)
   - [Surface Brush (`P`)](#surface-brush-p)
   - [Secondary Brush (`Alt+P`)](#secondary-brush-altp)
   - [Box Area Select (`B`)](#box-area-select-b)
   - [Radius Area Select (`R`)](#radius-area-select-r)
   - [Sub-Split Tool (`S`)](#sub-split-tool-s)
   - [Shape 3D Volume Select (`V`)](#shape-3d-volume-select-v)
5. [Panels & Configuration Options](#5-panels--configuration-options)
   - [Paint Groups & Palette Management](#paint-groups--palette-management)
   - [Color Harmony Recommender (🎨)](#color-harmony-recommender-)
   - [Miniature Paint Matching (CIEDE2000 ΔE)](#miniature-paint-matching-ciede2000-δe)
   - [Edge Detection & Hardness Tuner](#edge-detection--hardness-tuner)
   - [Contextual Tool Settings](#contextual-tool-settings)
   - [Export & Download Options](#export--download-options)
   - [Preferences & Settings (⚙️)](#preferences--settings-️)
   - [Startup Tutorial Pop-up](#startup-tutorial-pop-up)
6. [Viewport Navigation & Camera Controls](#6-viewport-navigation--camera-controls)
7. [Keyboard Shortcuts Cheat Sheet](#7-keyboard-shortcuts-cheat-sheet)
8. [Practical Hobby Workflows](#8-practical-hobby-workflows)

---

## 1. Introduction & Core Concepts

When painting miniatures (tabletop wargames, display figurines, scale models, or RPG heroes), choosing a balanced colour scheme is one of the hardest steps. Testing colour ideas physically with real paints often means stripping paint or repainting multiple times.

**Mini Scheme Maker** solves this by running real-time geometric segmentation and colour planning entirely in your browser using WebGL and Three.js — no server or account required.

### How Automatic Segmentation Works

1. **Topology Analysis:** The mesh is processed into an edge-manifold representation where neighboring triangles share boundary edges.
2. **Dihedral Angle Detection:** The angle between adjacent triangle normal vectors is calculated. Angles exceeding the **Edge Detection Hardness** threshold (e.g. 24°) are recognized as crease boundaries.
3. **Breadth-First Search (BFS) Flood Fill:** Connected triangles bounded by crease lines are grouped into distinct continuous surface patches (*parts*).
4. **Surface Classification:**
   - **Group 1: Large Smooth Surfaces (Slate Grey `#94a3b8`)** — Patches whose surface area exceeds the *Smooth Patch Min Area* threshold (e.g., armor plates, cloth capes, flat shields).
   - **Group 2: Fine Detail / Textured (Yellow `#eab308`)** — Smaller, intricate patches (e.g., buckles, bolts, leather straps, emblems, hair/fur).

---

## 2. Quick-Start Walkthrough

Follow these 6 steps to plan your first miniature:

1. **Load Your Model:**
   - Click the **Open Model** button in the top left or drag and drop a `.STL`, `.OBJ`, or `.miniseg.json` file onto the canvas.
2. **Review Auto-Segmentation:**
   - The mesh is segmented immediately. Notice how armor plates and large flat areas become grey, while textured details become yellow.
3. **Calibrate Crease Detection:**
   - In the right-hand sidebar, look at the **Edge Detection & Hardness Tuner**.
   - Click **Auto-Calibrate** to let the geometry analyzer sample crease angles and calculate the best settings for your model.
4. **Recolour With Painting Tools:**
   - Activate the **Surface Brush (<kbd>P</kbd>)** and click any segment to reassign it via the popup menu, or hold <kbd>Shift</kbd> and drag across surfaces to paint directly.
   - Use <kbd>1</kbd>–<kbd>9</kbd> on your keyboard to switch active colours instantly.
   - Use **Box Select (<kbd>B</kbd>)** or **Radius Select (<kbd>R</kbd>)** to select multiple components (such as entire limbs or weapons) and map them to your active colour at once.
5. **Harmonize & Match Paints:**
   - Click the **Color Recommender (🎨)** icon in the top bar to generate complementary, analogous, or triadic colour schemes.
   - In the **Paint Matching** panel, select your paint manufacturer (Citadel, Vallejo, Army Painter, Scale75, etc.).
   - Click **Apply to Model** to snap digital hex colours to real physical hobby paints.
6. **Export Your Scheme:**
   - Export a **Save Paint Sheet (HTML)** to view on a tablet while you paint at your hobby desk.
   - Export **3D (.ply / .obj)** with embedded vertex colours to view in Blender or 3D print slicers.
   - Save your project with **Save Project (.miniseg.json)** so you can reload and tweak it anytime.

---

## 3. Interface Overview

The interface consists of four primary areas:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Open Model]   [P] [Alt+P] [B] [R] [S] [V]  [Brush #]   Model Tris  🎨 ❓ ⚙️│  <- Top Bar
├──────────────────────────────────────────────────────┬─────────────────┤
│                                                      │ [Selection Bar] │
│                                                      │                 │
│                                                      │  Paint Groups   │
│                                                      │  (Distribution) │
│                                                      │                 │
│                   3D Viewport                        │  Paint Matching │
│                                                      │                 │
│              (Interactive Canvas)                    │  Edge Tuner /   │
│                                                      │  Auto-Calibrate │
│                                                      │                 │
│                                                      │  Tool Settings  │
│                                                      │                 │
│                                          [Gizmo]     │  Export Options │
└──────────────────────────────────────────────────────┴─────────────────┘
```

1. **Top Bar:** Model file loader, 6 tool selectors with keybinds, active brush indicator, live model statistics (name, triangles, parts, surface area), Color Recommender button (🎨), Tutorial button (❓), and Settings (⚙️).
2. **3D Viewport:** Interactive WebGL canvas supporting orbit, pan, zoom, surface highlighting, and an orientation cube gizmo.
3. **Selection Action Bar:** Appears whenever multiple surface parts are selected, allowing one-click mapping or deselection.
4. **Right Sidebar Panels:** Unified controls for paint groups, brand matching, edge detection sliders, contextual tool parameters, and file exports.

---

## 4. Selection & Painting Tools

### Surface Brush (`P`)
*The primary inspection and interactive painting tool.*

- **Single Click:** Click on any surface segment to select it. Triangle count is displayed in a badge, and the reassignment popup opens to choose Group 1, Group 2, or any custom paint group.
- **Shift + Drag Painting:** Hold <kbd>Shift</kbd> and drag your mouse across the model to continuously paint every surface segment you touch with the active brush colour.
- **Quick Switch:** Press number keys <kbd>1</kbd> through <kbd>9</kbd> to set your active brush colour without taking your hands off the mouse.

---

### Secondary Brush (`Alt+P`)
*Non-destructive background segmentation for isolating delicate sub-regions.*

- Runs an independent background segmentation pass with its own dedicated dihedral angle, patch area, edge chain length, and straightness parameters.
- **Hover Preview:** Hover over any area to see a real-time cyan outline of the fine-crease sub-patch.
- **Click to Assign:** Click the highlighted sub-region to reassign only that portion to your target group without altering the rest of your model's paint assignments.

---

### Box Area Select (`B`)
*2D rectangular marquee selection for grouping multiple parts simultaneously.*

- Click and drag a 2D bounding rectangle across the 3D viewport.
- Any surface segments whose projected screen coordinates fall within the rectangle are selected together.
- Use the **Map Selected to Active Brush** button in the sidebar or press keys <kbd>1</kbd>–<kbd>9</kbd> to recolour all selected parts in a single step.

---

### Radius Area Select (`R`)
*Circular radial selection brush for localized clusters.*

- Displays a circular cursor ring over the 3D model.
- Click or drag across surfaces to select all segments within the radius.
- Adjust the circle radius (10 px to 100 px) in the **Contextual Tool Parameters** panel.
- Perfect for selecting complex organic clusters like shoulder pads, heads, weapon mounts, or backpacks.

---

### Sub-Split Tool (`S`)
*Surgical crease subdivider for carving fine details out of larger patches.*

- When you have a large smooth surface containing subtle raised details (e.g. an insignia on a breastplate or knee guard), Sub-Split lets you isolate it without changing the global segmentation.
- **Hover Preview:** Hover over the model to see a preview of the sub-patch based on the **Sub-surface Split Angle** slider.
- **Click to Carve:** Click the hovered area to permanently split it into an independent surface segment and open the group assignment popup.

---

### Shape 3D Volume Select (`V`)
*True 3D geometric volumetric selection and cutting.*

- Spawns an interactive 3D geometric volume directly in the scene:
  - **Box:** Ideal for planar slices, weapons, bases, and split color schemes (e.g. halved space marine armor).
  - **Sphere:** Ideal for radial details, shoulders, heads, or spell effects.
  - **Cylinder:** Ideal for limbs, cloaks, banners, gun barrels, and cylindrical accessories.
- **3D Transform Modes:**
  - Press <kbd>W</kbd> for Move / Translate gizmo.
  - Press <kbd>E</kbd> for Rotate gizmo.
  - Press <kbd>R</kbd> for Scale / Resize gizmo.
- **Snap to Click:** Click the **🎯 Snap to Click** button, then click anywhere on your miniature. The center of the 3D shape instantly snaps to that exact point on the surface.
- **Live Intersection Readout:** The panel shows the exact number of mesh triangles inside the 3D shape in real time.
- **Apply Color (<kbd>Enter</kbd>):** Click **Apply Color** or press <kbd>Enter</kbd> to assign all enclosed triangles to your active brush group. Triangles straddling the boundary are surgically partitioned into distinct parts.

---

## 5. Panels & Configuration Options

### Paint Groups & Palette Management

The Paint Groups panel gives you full creative control over your colour scheme:
- **Distribution Bar:** A color-coded proportional bar at the top displays the percentage of total surface area occupied by each group.
- **Color Swatches:** Click any group's colour square to open the browser colour picker or input custom hex values.
- **Renaming:** Click any group name to edit it inline (e.g. rename *Group 3* to *"Power Sword Glow"*).
- **Add New Group (`+ Add`):** Create an unlimited number of custom paint groups. Each new group receives an automatically distinct hue.
- **Reset Base Groups:** Restores all mesh face assignments back to the initial auto-segmentation categories (Group 1 Smooth and Group 2 Detail).

---

### Color Harmony Recommender (🎨)

Accessible via the artist palette icon (🎨) in the top navigation bar:
- **Color Wheel Canvas:** Click or drag on the interactive colour wheel to choose a primary base colour.
- **Lightness Slider:** Adjust saturation and lightness values.
- **Direct Hex Code Entry:** Enter an exact `#RRGGBB` hex code and press Enter.
- **Harmonic Scheme Suggestions:**
  - **Complementary:** Opposite hues for bold, high-contrast focal points.
  - **Analogous:** Adjacent hues for natural, smooth transitions.
  - **Triadic:** Balanced triangular triad for rich, comic or heroic tabletop aesthetics.
  - **Split-Complementary:** High contrast with reduced visual tension.
  - **Square / Tetradic:** Four-point harmonies for complex multicomponent miniatures.
- **1-Click Application:** Click **✓ Apply to Groups 1–3** to instantly apply the generated harmonic triad across your model.

---

### Miniature Paint Matching (CIEDE2000 ΔE)

Mini Scheme Maker bridges digital 3D models and real-world physical painting racks:
- **Comprehensive Brand Libraries:** Select paint manufacturers from the dropdown, including:
  - *Citadel / Warhammer Colour* (Base, Layer, Contrast, Shade)
  - *Vallejo Model Color* & *Vallejo Game Color*
  - *The Army Painter Warpaints*
  - *Scale75 Scalecolor*
  - *Pro Acryl*, *AK Interactive*, *Reaper Master Series*, and more.
- **CIEDE2000 Delta E ($\Delta E$):** Uses the CIE standard perceptual difference formula. Unlike naive RGB distance, $\Delta E$ models human eye sensitivity across different hue and chroma bands:
  - $\Delta E \le 1.0$: Visually indistinguishable to the human eye.
  - $\Delta E \le 3.0$: Close visual match on miniatures.
  - $\Delta E > 5.0$: Noticeably different shade.
- **Apply to Model:** Snaps all digital group colors to their closest authentic physical miniature paint swatch and updates the 3D model in real time.

---

### Edge Detection & Hardness Tuner

Control the underlying geometric crease detection:
- **Edge Detection Hardness (10°–60°):** Dihedral break angle between adjacent triangle normal vectors. Lower angles (e.g. 15°) split more surfaces into separate patches; higher angles (e.g. 35°) keep gently curved surfaces merged together.
- **Smooth Patch Min Area (0.2%–6.0%):** Threshold percentage of total mesh surface area. Patches smaller than this value are categorized as Fine Detail / Textured (Group 2, Yellow).
- **Min Feature Edge Length (1–25 edges):** Suppresses geometric noise by ignoring crease chains shorter than $N$ connected edges.
- **Edge Straightness Filter (0.0–0.95):** Calculates the ratio of chord distance to arc length along crease lines. Higher values require creases to follow straight edges, filtering out jagged organic noise.
- **Auto-Calibrate:** Computes a statistical distribution of dihedral angles across your specific model and automatically configures optimal threshold values.
- **Re-Segment:** Re-executes the global BFS segmentation pass using current slider values.

---

### Contextual Tool Settings

Located beneath the Edge Detection panel, this area dynamically changes depending on the currently selected tool:
- **Secondary Brush:** Secondary hardness, min area, edge length, and straightness sliders.
- **Sub-Split:** Live sub-surface split angle slider.
- **Radius Select:** Circular selection radius slider in pixels.
- **Shape Tool:** Shape selector (Box, Sphere, Cylinder), Gizmo mode (Move, Rotate, Scale), exact numerical X/Y/Z coordinate inputs for position, dimensions, and rotation degrees, Snap to Click button, and Reset Shape button.

---

### Export & Download Options

Share, 3D print, and document your paint scheme:
- **Download View (PNG):** Captures a high-resolution screenshot of the current 3D view with transparent background.
- **Export 3D (.ply):** Stanford PLY mesh format with embedded per-vertex RGBA colour data. Directly importable into **Blender**, **ZBrush**, **MeshMixer**, and 3D printing slicers (e.g. Bambu Studio, PrusaSlicer, Lychee).
- **Export 3D (.obj):** Wavefront OBJ mesh with vertex colour extensions.
- **Export Colors (.csv):** Spreadsheet containing group IDs, names, hex codes, triangle counts, surface area percentages, and matched miniature paint names and SKUs.
- **Save Paint Sheet (HTML):** Generates a portable, standalone HTML file with an embedded miniature render, interactive color palette swatches, and a complete shopping and recipe list. You can email or air-drop this file to your phone or tablet to reference while painting at your hobby bench!
- **Save Project (.miniseg.json):** Full project serialization saving the 3D geometry, partition boundaries, custom groups, and paint assignments. Reopen via **Open Model** or drag-and-drop to pick up right where you left off.

---

### Preferences & Settings (⚙️)

Click the gear icon (⚙️) in the top-right corner:
- **Theme:** Toggle between **Dark Theme** (default) and **Light Theme**.
- **Mouse Sensitivity:** Configure independent sensitivity multipliers for **Orbit Speed**, **Pan Speed**, and **Zoom Speed**.
- **Keyboard Shortcuts Rebinding:** Click any tool's keybind button, then press your desired key combination to rebind it. Settings are stored persistently in browser `localStorage`.

---

### Startup Tutorial Pop-up

When you open the page for the first time, an interactive **Tutorial & Feature Guide** modal pops up automatically:
- Offers organized tabs for Quick Start, Tools, Options, and Shortcuts.
- Includes a **"Show tutorial when opening page"** checkbox at the bottom.
- You can reopen the tutorial guide at any time by clicking the **Tutorial** button in the top bar or pressing the <kbd>?</kbd> key.

---

## 6. Viewport Navigation & Camera Controls

| Action | Control | Description |
|---|---|---|
| **Orbit / Rotate** | Left Click + Drag | Rotates the camera around the miniature's center point |
| **Pan / Translate** | Right Click + Drag | Shifts the camera horizontally and vertically |
| **Zoom** | Scroll Wheel / Pinch | Zooms in or out towards cursor position |
| **Snap Camera** | Click Gizmo Cube | Click Top, Bottom, Front, Back, Left, or Right on the orientation cube in the top right to snap to exact orthogonal views |

---

## 7. Keyboard Shortcuts Cheat Sheet

| Key | Tool / Action | Description |
|---|---|---|
| <kbd>P</kbd> | Surface Brush | Primary inspection and paint tool |
| <kbd>Alt+P</kbd> | Secondary Brush | Background fine-crease segmentation and selection |
| <kbd>B</kbd> | Box Select | 2D rectangular marquee selection |
| <kbd>R</kbd> | Radius Select | Circular radial area selection |
| <kbd>S</kbd> | Sub-Split | Crease subdivision slicer |
| <kbd>V</kbd> | Shape Tool | 3D geometric volume select and painter |
| <kbd>1</kbd> – <kbd>9</kbd> | Quick Group | Set active brush color or assign current selection |
| <kbd>Shift</kbd> + Drag | Continuous Paint | Paint surfaces directly under mouse cursor in Brush mode |
| <kbd>W</kbd> | Move Gizmo | Switch Shape gizmo to Translation / Move mode |
| <kbd>E</kbd> | Rotate Gizmo | Switch Shape gizmo to Rotation mode |
| <kbd>R</kbd> | Scale Gizmo | Switch Shape gizmo to Scale / Dimension mode |
| <kbd>Enter</kbd> | Apply Color | Color all faces enclosed inside the 3D Shape volume |
| <kbd>Esc</kbd> | Clear / Close | Deselect all selected parts; close active popups |
| <kbd>?</kbd> | Tutorial Guide | Open the interactive Tutorial & Feature Guide popup |

---

## 8. Practical Hobby Workflows

### Workflow A: The "Slapchop" / Contrast Paint Planner
1. Load your `.STL` miniature.
2. Run **Auto-Calibrate** to isolate armor plates from chainmail, leather straps, and pouches.
3. Open **Color Recommender (🎨)** and pick a main army armor colour (e.g. deep royal blue).
4. Apply a Triadic harmony to set contrasting secondary colours for capes and weapon casings.
5. In **Miniature Paint Matching**, select **Warhammer Colour** and filter for Contrast/Speedpaint equivalents.
6. Export the **HTML Paint Sheet** and open it on your phone beside your painting desk.

### Workflow B: Halved & Quartered Space Marine Chapters
1. Select the **Shape Tool (<kbd>V</kbd>)**.
2. Select **Box** shape mode.
3. Use the Move (<kbd>W</kbd>) and Scale (<kbd>R</kbd>) gizmos to align the box to cover exactly the left half of the space marine.
4. Press <kbd>1</kbd> to set your chapter's primary colour (e.g. Dark Angels Green).
5. Press <kbd>Enter</kbd> to apply colour to the entire left half.
6. Translate the box to the right half, press <kbd>2</kbd> (e.g. Bone White), and press <kbd>Enter</kbd>.
7. Switch to **Brush (<kbd>P</kbd>)** to paint the aquila chest emblem in Gold.

### Workflow C: Custom Color Matching for Existing Armies
1. If you already have a physical miniature painted and want to plan a matching squad:
2. Open **Color Recommender**, type the hex code or select the hue of your physical army.
3. Use **CIEDE2000 Paint Matching** to verify which commercial paints match your existing models.
4. Use **Box Select (<kbd>B</kbd>)** to test alternative squad sergeant helmet or shoulder trim colours.
5. Export the coloured **.PLY** mesh into Blender or your slicer for full 3D documentation!

---

*Mini Scheme Maker runs 100% locally in your browser. Happy painting!*
