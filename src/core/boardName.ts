/** Portable filenames that remain unambiguous in Obsidian links. */
export function boardNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Enter a board name.';
  if (/[\\/:?*"<>|#^[\]]/.test(name) || [...name].some((ch) => ch.charCodeAt(0) < 32)) return 'Board names cannot contain \\ / : ? * " < > | # ^ [ ] or control characters.';
  if (/[. ]$/.test(value) || name === '.' || name === '..') return 'Board names cannot end with a dot or space.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return 'Choose a name that is not reserved by Windows.';
  return null;
}

/** The path of a note named `name` in the same folder as the note at `path`. */
export function siblingPath(path: string, name: string): string {
  return `${path.slice(0, path.lastIndexOf('/') + 1)}${name}.md`;
}

/** The first free name for a copy of a board: House copy, then House copy 2 and so on. */
export function copyName(name: string, taken: (name: string) => boolean): string {
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${name} copy` : `${name} copy ${n}`;
    if (!taken(next)) return next;
  }
}
