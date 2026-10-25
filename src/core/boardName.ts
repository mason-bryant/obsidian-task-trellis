/** Portable filenames that remain unambiguous in Obsidian links. */
export function boardNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Enter a board name.';
  if (/[\\/:?*"<>|#^[\]]/.test(name) || [...name].some((ch) => ch.charCodeAt(0) < 32)) return 'Board names cannot contain \\ / : ? * " < > | # ^ [ ] or control characters.';
  if (/[. ]$/.test(value) || name === '.' || name === '..') return 'Board names cannot end with a dot or space.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return 'Choose a name that is not reserved by Windows.';
  return null;
}
