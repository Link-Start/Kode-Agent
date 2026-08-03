import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

const files = ['**/*.{js,ts,tsx}'];

// eslint-plugin-react-hooks v7 folds React Compiler migration rules into its
// recommended preset. Adopt the stable Hooks rules now; the compiler rules
// need a separate UI migration instead of being silently fixed by this gate.
// package.json holds the current exhaustive-deps warning ratchet (55).
const deferredReactCompilerRules = {
  'react-hooks/static-components': 'off',
  'react-hooks/use-memo': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/incompatible-library': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/globals': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/error-boundaries': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/set-state-in-render': 'off',
  'react-hooks/unsupported-syntax': 'off',
  'react-hooks/config': 'off',
  'react-hooks/gating': 'off',
};

const disabledRules = {
  'no-unused-vars': 'off',
  'no-empty-pattern': 'off',
  'no-undef': 'off',
  'no-mixed-spaces-and-tabs': 'off',
  'no-control-regex': 'off',
  'no-constant-condition': 'off',
  'no-extra-boolean-cast': 'off',
  'no-extra-semi': 'off',
  'no-redeclare': 'off',
  'no-inner-declarations': 'off',
  'no-case-declarations': 'off',
  'no-useless-escape': 'off',
  'no-prototype-builtins': 'off',
  'no-unassigned-vars': 'off',
  'no-useless-assignment': 'off',
  // Re-enabling preserve-caught-error requires threading `cause` through
  // ~29 existing throw sites; deferred to the error-handling cleanup phase.
  'preserve-caught-error': 'off',
  'require-yield': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
};

// Rules being tightened as part of code quality governance (P0-D3).
// These were previously disabled; enabling them helps catch real bugs.
const tightenedRules = {
  // Forbid empty catch blocks without an explanatory comment.
  // Use: catch { /* best-effort: <reason> */ } for intentional suppression.
  'no-empty': ['warn', { allowEmptyCatch: false }],
  // Flag useless catch blocks that just re-throw without adding context.
  'no-useless-catch': 'warn',
  // Detect unreachable code (dead code after return/throw/break).
  'no-unreachable': 'warn',
};

export default [
  {
    ignores: [
      '**/dist/**',
      'node_modules/**',
      'vendor/**',
      'coverage/**',
      'apps/server/static/**',
      '.temp/**',
      '.tmp/**',
      '.tmp-*/**',
      '.tmp-kode-config/**',
      'cli.js',
      'cli-acp.js',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    files,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooksPlugin.configs.flat.recommended.rules,
      ...deferredReactCompilerRules,
      ...disabledRules,
      ...tightenedRules,
    },
  },
];
