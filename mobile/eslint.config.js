// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Formatting is Prettier's job (npm run format); turn off conflicting style rules.
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'expo-env.d.ts'],
  },
]);
