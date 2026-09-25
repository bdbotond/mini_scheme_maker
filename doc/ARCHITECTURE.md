# Architecture & Directory Conventions

Mini-Segmentor is structured according to the canonical GitHub directory hierarchy:

```
mini_segmentor/
├── .build/                   # Containerization and build verification scripts
│   ├── Dockerfile
│   └── build.sh
├── .config/                  # Local and machine-specific tool settings
│   └── settings.json
├── .github/                  # Community metadata, issue templates, CI workflows
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── workflows/
│   │   └── ci.yml
│   ├── CODEOWNERS
│   ├── CODE_OF_CONDUCT.md
│   ├── CONTRIBUTING.md
│   ├── FUNDING.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── SECURITY.md
├── dep/                      # Local vendored dependencies and assets (Three.js, Paint catalogs)
│   ├── OBJLoader.js
│   ├── OrbitControls.js
│   ├── STLLoader.js
│   ├── three.min.js
│   └── paints/
├── doc/                      # Extended technical documentation & architectural specifications
│   ├── ALGORITHMS.md
│   └── ARCHITECTURE.md
├── res/                      # Static binary resources & classified sample outputs
│   ├── head_classified.ply
│   └── person_classified.ply
├── samples/                  # Minimal reproducible reference 3D models (.stl)
├── src/                      # Clean application source code
│   ├── css/
│   │   └── viewer.css        # Responsive WebGL UI styling
│   ├── js/
│   │   ├── app.js            # Scene runtime, camera, controls, event bus
│   │   ├── color_utils.js    # Color science (sRGB, CIE-Lab, CIEDE2000)
│   │   ├── exporters.js      # PLY, OBJ, CSV, and HTML exporters
│   │   ├── mesh_topology.js  # 3D spatial hashing, adjacency graph, BFS
│   │   └── paint_manager.js  # Miniature paint catalog & coverage matching
│   └── surface_classifier.js # Node.js CLI & core algorithm module
├── test/                     # Unit, integration, and performance regression tests
│   └── classifier.test.js
├── tools/                    # Developer tooling and benchmark runners
│   └── benchmark.js
├── .gitattributes
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTORS.md
├── index.html                # Lightweight entrypoint for GitHub Pages / browser
├── LICENSE
├── package.json
├── README.md
└── SUPPORT.md
```

## Modular Layering

1. **Core Math & Color Science (`src/js/color_utils.js`)**:
   Provides isomorphic RGB, CIE-Lab, and CIEDE2000 color difference computations, reusable in both Node.js and browser environments.

2. **Geometric Topology & Segmentation (`src/js/mesh_topology.js`)**:
   Constructs normalized 64-bit spatial hashing for triangle vertices, evaluates dihedral angles along shared edges, and executes connected component BFS.

3. **Paint Catalog & Management (`src/js/paint_manager.js`)**:
   Manages miniature paint manufacturer databases, computing minimum perceptual color distance ($\Delta E_{00}$) to suggest real hobby paints.

4. **3D Exporters (`src/js/exporters.js`)**:
   Zero-dependency exporters generating binary Little-Endian Stanford PLY, Wavefront OBJ with vertex colors, CSV spreadsheets, and standalone HTML paint reference sheets.

5. **Client Presentation (`src/js/app.js` & `src/css/viewer.css`)**:
   Drives Three.js WebGL rendering, studio lighting, mouse/touch event routing, tool mode state machines, and settings persistence.
