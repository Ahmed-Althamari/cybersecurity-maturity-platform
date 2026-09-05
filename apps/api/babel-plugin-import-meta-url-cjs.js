// Rewrites `import.meta.url` to a CommonJS-safe equivalent so Jest (which
// transpiles NestJS 12's ESM-only packages to CJS — see babel.config.js) can
// load files that use it.
//
// We tried the third-party `babel-plugin-transform-import-meta` first, but it
// replaces `import.meta.url` with an expression that calls the bare `require`
// identifier. NestJS's own ESM packages (this exact pattern shows up in
// @nestjs/swagger's swagger-ui.js, for example) commonly do:
//
//   const require = createRequire(import.meta.url);
//
// which is valid in real ESM (there is no ambient `require` to shadow) but,
// once transpiled to CJS, means the file already has a local `const require`
// in scope for that entire block — including, per `let`/`const` TDZ rules,
// its own initializer. A replacement that itself calls `require(...)` inside
// that initializer resolves to the very same not-yet-initialized binding,
// producing "ReferenceError: Cannot access 'require' before initialization".
//
// This plugin sidesteps the collision entirely by using `module.require(...)`
// (a property access on the CJS `module` object, which nothing here shadows)
// instead of the bare `require` identifier.
module.exports = function importMetaUrlToCjs({ types: t }) {
  return {
    name: 'import-meta-url-to-cjs',
    visitor: {
      MetaProperty(path) {
        const { node } = path;
        if (node.meta.name !== 'import' || node.property.name !== 'meta') {
          return;
        }

        const parent = path.parentPath;
        if (!parent.isMemberExpression({ computed: false }) || parent.node.property.name !== 'url') {
          return;
        }

        // module.require('url').pathToFileURL(__filename).href
        const replacement = t.memberExpression(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.memberExpression(t.identifier('module'), t.identifier('require')), [t.stringLiteral('url')]),
              t.identifier('pathToFileURL'),
            ),
            [t.identifier('__filename')],
          ),
          t.identifier('href'),
        );
        parent.replaceWith(replacement);
      },
    },
  };
};
