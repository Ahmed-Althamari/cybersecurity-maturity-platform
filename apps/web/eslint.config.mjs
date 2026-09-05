// Flat config, scoped to apps/web only -- eslint-config-next@16 dropped legacy
// eslintrc support entirely (it's a flat-config-only export), so this app can't
// share the repo root's .eslintrc.json/eslint 8 setup the way apps/api still does.
// Rule overrides below mirror that root config's intent for this workspace.
import security from 'eslint-plugin-security';
import nextConfig from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '.next/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'jest.config.js',
      'eslint.config.mjs',
    ],
  },
  ...nextConfig,
  {
    // @typescript-eslint is only registered (by eslint-config-next's own
    // 'next/typescript' entry) for these globs -- referencing its rules
    // outside that scope fails with "could not find plugin".
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // New in the react-hooks v7 pulled in by this Next 16 bump (previously
      // only had rules-of-hooks/exhaustive-deps). Flags the standard
      // set-loading-flag-then-fetch pattern used throughout this app's
      // data-fetching effects; downgraded to match exhaustive-deps' own
      // advisory (not blocking) severity rather than rewriting that pattern.
      'react-hooks/set-state-in-effect': 'warn',
      'import/order': [
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
