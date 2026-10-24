import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  { ignores: ['node_modules/**', 'main.js', 'dev/**', 'tests/**', 'scripts/**', '**/*.mjs', 'vitest.config.ts'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      'obsidianmd/ui/sentence-case': ['error', {
        brands: ['Task Trellis', 'Daily notes'],
        ignoreWords: ['Enter', 'Tasks'],
        // This placeholder contains literal case-sensitive paths, not prose.
        ignoreRegex: ['^templates\\nzzz_archived$'],
      }],
    },
  },
  {
    files: ['src/settings.ts'],
    // Declarative settings were introduced in 1.13.0; this plugin supports 1.8.7.
    rules: { 'obsidianmd/settings-tab/prefer-setting-definitions': 'off' },
  },
  {
    files: ['src/ui/renderBoard.ts', 'src/ui/renderBoardSettings.ts'],
    // These renderers also run in the standalone browser harness without Obsidian helpers.
    rules: { 'obsidianmd/prefer-create-el': 'off' },
  },
];
