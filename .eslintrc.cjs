/**
 * DataNova ESLint configuration
 *
 * Extends @typescript-eslint/recommended — sensible defaults for a TS codebase.
 * React-specific rules live in packages/web/.eslintrc.cjs (extends this one).
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    browser: false,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: false },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  ignorePatterns: [
    '**/dist/**',
    '**/node_modules/**',
    '**/*.d.ts',
    '**/*.d.ts.map',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    'packages/web/src/vite-env.d.ts',
  ],
  rules: {
    // Allow underscore-prefixed unused args (e.g. async (_id, params))
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    // Don't force `unknown` over `any` — codebase intentionally uses `any` in tool args
    '@typescript-eslint/no-explicit-any': 'off',
    // Allow non-null assertions in tests and after explicit checks
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Console is allowed (logger migration in P1-11)
    'no-console': 'off',
    // Empty interfaces are sometimes useful for type aliases
    '@typescript-eslint/no-empty-interface': 'off',
    // Consistent type imports — allow both styles
    '@typescript-eslint/consistent-type-imports': 'off',
    // Allow empty catch blocks (idiomatic in Node 18+)
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Allow mixed tabs and spaces (legacy files use tabs in some places)
    'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
    // Allow irregular whitespace in source files (legacy strings)
    'no-irregular-whitespace': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['scripts/**/*.{js,ts}', '**/*.config.{js,ts}', '**/*.config.cjs'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
      env: { node: true },
    },
  ],
};