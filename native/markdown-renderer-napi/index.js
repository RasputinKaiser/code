'use strict';

let nativeModule;

try {
  nativeModule = require('./dist/markdown-renderer-napi.node');
} catch {
  nativeModule = null;
}

function renderFencedCode(code, options) {
  if (!nativeModule || typeof nativeModule.renderFencedCode !== 'function') {
    return null;
  }
  return nativeModule.renderFencedCode(code, options);
}

module.exports = {
  renderFencedCode,
};
