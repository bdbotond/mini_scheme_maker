# Contributing to Mini-Segmentor

Thank you for considering contributing to Mini-Segmentor!

## Development Setup

1. Clone repository:
   ```bash
   git clone https://github.com/bdbotond/mini_scheme_maker.github.io.git
   cd mini_segmentor
   ```

2. Start local server:
   ```bash
   npm start
   ```

3. Run automated tests:
   ```bash
   npm test
   ```

4. Run performance benchmark:
   ```bash
   npm run benchmark
   ```

## Directory Architecture

- `src/`: Core source code (`src/css/`, `src/js/`, `src/surface_classifier.js`).
- `dep/`: Vendored client dependencies (Three.js, loaders, paint database).
- `test/`: Automated test suite.
- `tools/`: Developer automation and benchmarking scripts.
- `samples/`: Sample test 3D models.
