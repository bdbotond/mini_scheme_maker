#!/usr/bin/env node
/**
 * Root executable shim forwarding to src/surface_classifier.js
 */
const classifier = require('./src/surface_classifier.js');
if (require.main === module) {
  classifier.runCLI();
}
module.exports = classifier;
