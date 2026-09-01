const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/e2e/'],
  // .next/standalone (see next.config.js's output: "standalone") duplicates
  // package.json and other files into the build output, which otherwise
  // trips jest-haste-map's module-naming-collision warning.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/pages/(.*)$': '<rootDir>/pages/$1',
    '^@/styles/(.*)$': '<rootDir>/styles/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = createJestConfig(customJestConfig);
