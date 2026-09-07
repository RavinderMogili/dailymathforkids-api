export default {
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  // tests/live/ makes real network calls (integration.test.js also makes
  // real writes) and must never run as part of the default `npm test` —
  // see tests/live/liveGuard.js and `npm run test:live`.
  testPathIgnorePatterns: ['/node_modules/', '/tests/live/'],
};
