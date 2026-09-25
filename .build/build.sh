#!/usr/bin/env bash
set -euo pipefail

echo "==> Validating project syntax and files..."
node -c src/surface_classifier.js
node -c src/js/*.js
node -c surface_classifier.js

echo "==> Running test suite..."
npm test

echo "==> Build check complete."
