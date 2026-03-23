module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/helpers/**/*.test.js',
    '<rootDir>/routes/**/*.test.js',
  ],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  testTimeout: 15000,
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  // Run sequentially — integration tests share a single test database
  maxWorkers: 1,
  // Force exit after tests complete (test DB pool keeps event loop open)
  forceExit: true,
};
