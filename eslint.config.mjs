import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  { ignores: ['node_modules/**', 'main.js', 'dev/harness.js', 'tests/**', 'scripts/**', '**/*.mjs', 'vitest.config.ts'] },
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
];
