// Integration tests talk to a real backend over HTTP and Socket.IO, so they are plain CommonJS
// files and need no ESM flags. The older unit tests in test/ use node:test and run separately.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.cjs'],
  globalSetup: '<rootDir>/__tests__/globalSetup.cjs',
  globalTeardown: '<rootDir>/__tests__/globalTeardown.cjs',
  testTimeout: 20000,
  // One backend and one in-memory database are shared, so files run one after another.
  maxWorkers: 1,
};
