/**
 * Polyfill so Vite/Vitest can start on Node < 19.
 * Vite's config uses: import crypto from "node:crypto"; crypto.getRandomValues(...)
 * Node's crypto module gets getRandomValues so the ESM import sees it.
 * Load with: NODE_OPTIONS='--require=./vitest-crypto-polyfill.cjs' vitest run
 */
const nodeCrypto = require("crypto");

if (typeof nodeCrypto.getRandomValues !== "function") {
  nodeCrypto.getRandomValues = function getRandomValues(arr) {
    const bytes = nodeCrypto.randomBytes(arr.length);
    arr.set(bytes);
    return arr;
  };
}
if (typeof nodeCrypto.hash !== "function") {
  nodeCrypto.hash = function hash(algorithm, data, encoding) {
    return nodeCrypto.createHash(algorithm).update(data).digest(encoding);
  };
}

const getRandomValues = nodeCrypto.getRandomValues;
const cryptoPolyfill = {
  getRandomValues,
  randomUUID: typeof nodeCrypto.randomUUID === "function" ? nodeCrypto.randomUUID : undefined,
};

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto = Object.assign(globalThis.crypto || {}, cryptoPolyfill);
}
if (typeof global !== "undefined" && (!global.crypto || typeof global.crypto.getRandomValues !== "function")) {
  global.crypto = Object.assign(global.crypto || {}, cryptoPolyfill);
}
