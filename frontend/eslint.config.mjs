import vueTsConfig from '@vue/eslint-config-typescript'

export default [
  {
    ignores: ['dist', 'node_modules'],
  },
  ...vueTsConfig({ rootDir: import.meta.dirname }),
  {
    files: ['**/*.{ts,tsx,vue,mjs}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
