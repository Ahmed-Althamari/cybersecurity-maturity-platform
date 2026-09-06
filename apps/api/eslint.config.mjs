// Flat config, migrated off the legacy .eslintrc.json this app used to share
// with the repo root -- ESLint 10 (this bump) requires flat config with no
// fallback. eslint-plugin-import doesn't support ESLint 10 yet (peer caps at
// ^9, same lag eslint-plugin-react has for apps/web's own ESLint pin), so
// import/order here comes from eslint-plugin-import-x, an actively
// maintained fork created for exactly this kind of ESLint-version lag --
// same rule, registered under the `import-x` plugin name instead of `import`.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    plugins: { security, 'import-x': importX },
    rules: {
      ...security.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc' },
          'newlines-between': 'always',
        },
      ],
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
];
