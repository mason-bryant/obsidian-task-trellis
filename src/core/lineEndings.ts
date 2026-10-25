/** Rejoin edited lines without normalizing the untouched prefix/suffix of a note. */
export function joinEditedLines(content: string, next: string[]): string {
  const before = content.split(/\r?\n/);
  const endings = content.match(/\r?\n/g) ?? [];
  const fallback = endings[0] ?? '\n';
  let prefix = 0;
  while (prefix < before.length && prefix < next.length && before[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < next.length - prefix && before[before.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return next.map((line, i) => {
    if (i === next.length - 1) return line;
    const oldIndex = i < prefix ? i : i >= next.length - suffix ? before.length - next.length + i : -1;
    return line + (oldIndex >= 0 ? endings[oldIndex] ?? fallback : fallback);
  }).join('');
}

/** Replace a task line without changing any other line's separator. */
export function replaceNoteLine(content: string, at: number, replacement: string[]): string {
  const lines = content.split(/\r?\n/);
  const endings = content.match(/\r?\n/g) ?? [];
  const start = lines.slice(0, at).reduce((n, line, i) => n + line.length + (endings[i]?.length ?? 0), 0);
  const end = start + lines[at]!.length;
  return content.slice(0, start) + replacement.join(endings[at] ?? endings[0] ?? '\n') + content.slice(end);
}
