const nextJest = require('next/jest');

// next/jest handles the SWC transform, CSS/image mocks, and env-var loading the same way
// `next dev`/`next build` do, so component tests see the app the same way it actually runs.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/test-e2e/'],
  // Without this, Jest's haste module map also scans build output and warns about a naming
  // collision between the real package.json and the one turbo/Next's own `.next/standalone`
  // output copies alongside it — the build artifacts were never something to run tests against.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
};

module.exports = createJestConfig(customJestConfig);
