// NestJS 12's packages (@nestjs/common, @nestjs/core, etc.) ship as native ESM
// ("type": "module" in their package.json). Node's own require(esm) interop
// (Node >= 20.19 / >= 22.12) lets our CommonJS build `require()` them fine at
// runtime, but Jest's module loader compiles every file itself and doesn't
// get that interop for free — it hits `SyntaxError: Cannot use import
// statement outside a module` the moment it tries to load one directly.
//
// This babel config is used ONLY for the small, explicit set of ESM-only
// node_modules packages listed in jest.config.js's `transformIgnorePatterns`
// (see the comment there) — it transpiles their `import`/`export` syntax to
// CommonJS so Jest can load them like any other dependency. It intentionally
// does not touch our own source, which stays on ts-jest.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  // preset-env converts `import`/`export` to CJS but leaves `import.meta.url`
  // alone — there's no direct CJS equivalent for it, so left untouched it's a
  // syntax error in the transpiled output. Several Nest 12 packages use
  // `import.meta.url` (e.g. @nestjs/common's optional-package loader, used by
  // ValidationPipe et al. to lazily require class-validator/class-transformer;
  // @nestjs/swagger's swagger-ui.js). See babel-plugin-import-meta-url-cjs.js
  // for why this needs a purpose-built plugin rather than an off-the-shelf one.
  plugins: ['./babel-plugin-import-meta-url-cjs.js'],
};
