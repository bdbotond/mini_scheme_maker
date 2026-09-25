# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-25

### Refactored
- Modularized monolithic `index.html` (3,960 lines) into structured files:
  - `src/css/viewer.css` (UI styling)
  - `src/js/color_utils.js` (isomorphic color conversion & CIEDE2000 math)
  - `src/js/mesh_topology.js` (spatial hashing & dihedral BFS segmentation)
  - `src/js/paint_manager.js` (miniature paint catalog matching)
  - `src/js/exporters.js` (PLY, OBJ, CSV, and HTML view exporters)
  - `src/js/app.js` (main runtime, tools, gizmo, and viewport management)
- Migrated vendored assets from `vendor/` to canonical `dep/`.
- Relocated CLI classifier to `src/surface_classifier.js` with root compatibility shim.
- Relocated static mesh outputs to `res/`.

### Added
- Standard GitHub community infrastructure (`.github/workflows/ci.yml`, issue templates, PR template, CODEOWNERS, SECURITY.md).
- Automated test suite (`test/classifier.test.js`) with binary STL and CIEDE2000 validation.
- Developer benchmark tool (`tools/benchmark.js`).
- Build and containerization scripts (`.build/Dockerfile`, `.build/build.sh`).
- Project configuration defaults (`.config/settings.json`).
- Architectural and algorithmic documentation (`doc/ARCHITECTURE.md`, `doc/ALGORITHMS.md`).

## [1.0.0] - 2026-09-24

### Added
- Fast 3D mesh surface classifier with vectorized TypedArrays.
- Interactive WebGL segmentor with brush, box, and radius selection modes.
- Miniature acrylic paint matching with CIEDE2000 delta E calculations.
- Stanford PLY and Wavefront OBJ color exports.
