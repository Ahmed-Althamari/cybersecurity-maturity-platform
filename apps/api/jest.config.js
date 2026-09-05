// NestJS 12's own packages ship as native ESM (see babel.config.js for the
// full explanation). ESM_NODE_MODULES below is the exact, deliberately
// narrow set of packages in our dependency graph that are ESM-only as of
// this bump — everything else in node_modules keeps Jest's normal,
// untransformed (and much faster) default. If a future dependency bump adds
// another ESM-only package and tests start failing again with "Cannot use
// import statement outside a module", add it to this list rather than
// widening the pattern to all of node_modules.
const ESM_NODE_MODULES = [
  '@nestjs', // @nestjs/throttler is the one exception and is still CommonJS, but including it here is harmless
  '@standard-schema',
  'file-type',
  '@tokenizer',
  'strtok3',
  'token-types',
  'uint8array-extras',
];

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // babel.config.js lives in apps/api (one level above this file's rootDir
    // of apps/api/src), so its path is spelled out here rather than relying
    // on babel-jest's own upward config search finding it.
    '^.+\\.js$': ['babel-jest', { configFile: require.resolve('./babel.config.js') }],
  },
  transformIgnorePatterns: [`/node_modules/(?!(${ESM_NODE_MODULES.join('|')})/)`],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
