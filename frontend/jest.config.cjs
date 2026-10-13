// Runs the real src/main.js in jsdom against a fake socket. The Vite-only parts of the source
// (import.meta, CSS imports) are handled by the transform and the mappers below.
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  transform: { '\.js$': '<rootDir>/__tests__/helpers/transform.cjs' },
  moduleNameMapper: {
    '\.css$': '<rootDir>/__tests__/helpers/style.cjs',
    '^socket\.io-client$': '<rootDir>/__tests__/helpers/fakeSocketIo.cjs',
  },
};
