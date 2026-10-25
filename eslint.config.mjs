import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  { ignores: ['node_modules/**', 'main.js', 'dev/**', 'tests/**', 'scripts/**', '**/*.mjs', 'vitest.config.ts'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      'obsidianmd/ui/sentence-case': ['error', {
        brands: ['Task Trellis', 'Daily notes'],
        ignoreWords: ['Enter', 'Tasks', 'Alt', 'Up', 'Down', 'Home'],
        // Literal paths and hexadecimal color samples are not prose.
        ignoreRegex: ['^templates\\nzzz_archived$', '^#[A-Fa-f0-9]{6}$'],
      }],
    },
  },
  {
    files: ['src/settings.ts'],
    // Retain the tested imperative settings UI and compile against the narrower 1.8.7 API types.
    rules: { 'obsidianmd/settings-tab/prefer-setting-definitions': 'off' },
  },
  {
    files: ['src/ui/renderBoard.ts', 'src/ui/renderBoardSettings.ts', 'src/ui/renderLabelPicker.ts', 'src/ui/editorHeader.ts', 'src/ui/columnResize.ts'],
    // These renderers also run in the standalone browser harness without Obsidian helpers.
    rules: { 'obsidianmd/prefer-create-el': 'off' },
  },
];
