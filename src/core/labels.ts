/** Stable ids keep assignments intact when a board label is renamed or recolored. */
export type BoardLabel = { id: string; name: string; color: string };

export const LABEL_COLORS = [
  { name: 'Green', color: '#216e4e' },
  { name: 'Yellow', color: '#7f5f01' },
  { name: 'Orange', color: '#974f0c' },
  { name: 'Red', color: '#ae2e24' },
  { name: 'Purple', color: '#803fa5' },
  { name: 'Blue', color: '#1558bc' },
] as const;

export function defaultLabels(): BoardLabel[] {
  return LABEL_COLORS.map(({ name, color }) => ({ id: name.toLowerCase(), name: '', color }));
}

export function normalizeLabelColor(value: string): string | null {
  const hex = value.trim();
  if (/^#[a-f\d]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[a-f\d]{3}$/i.test(hex)) return `#${[...hex.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  return null;
}

export function parseLabels(raw: unknown, warnings: string[]): BoardLabel[] {
  if (raw === undefined) return defaultLabels();
  if (!Array.isArray(raw)) {
    warnings.push('Labels must be a list; showing the default labels.');
    return defaultLabels();
  }
  const labels: BoardLabel[] = [];
  for (const item of raw as unknown[]) {
    const value = item as Partial<BoardLabel> | null;
    const color = typeof value?.color === 'string' ? normalizeLabelColor(value.color) : null;
    if (!value || typeof value.id !== 'string' || !/^[a-z0-9_-]+$/.test(value.id) ||
      typeof value.name !== 'string' || !color || labels.some((l) => l.id === value.id)) {
      warnings.push('An invalid or duplicate label was ignored.');
      continue;
    }
    labels.push({ id: value.id, name: value.name.trim(), color });
  }
  return labels;
}

export function labelDescription(label: BoardLabel): string {
  const color = LABEL_COLORS.find((c) => c.color === label.color)?.name ?? label.color.toUpperCase();
  return label.name ? `${color}: ${label.name}` : color;
}

/** Choose text with WCAG contrast of at least 4.5:1 on any opaque hex background. */
export function labelTextColor(color: string): string {
  const rgb = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

// Hidden Markdown comments, not Obsidian tags: label changes cannot change board filter matches.
const LABEL_RE = /<!-- tt-labels:([\p{L}\p{N}_-]+):([a-z0-9_,-]+) -->/gu;

export function taskLabels(line: string, slug: string): string[] {
  return [...new Set([...line.matchAll(LABEL_RE)]
    .filter((m) => m[1] === slug).flatMap((m) => m[2]!.split(',').filter(Boolean)))];
}

export function stripTaskLabels(line: string): string {
  return line.replace(LABEL_RE, '');
}

/** Only replaces this board's labels; other boards, fields, placement tags and block ids survive. */
export function setTaskLabels(line: string, slug: string, ids: string[]): string {
  if (!/^[\p{L}\p{N}_-]+$/u.test(slug) || ids.some((id) => !/^[a-z0-9_-]+$/.test(id))) {
    throw new Error('Invalid board or label id.');
  }
  const clean = line.replace(/ ?<!-- tt-labels:([\p{L}\p{N}_-]+):([a-z0-9_,-]+) -->/gu,
    (match, board: string) => board === slug ? '' : match);
  if (!ids.length) return clean;
  const marker = `<!-- tt-labels:${slug}:${[...new Set(ids)].join(',')} -->`;
  // Keep task metadata at the end, where the Tasks plugin expects it.
  const start = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s+)/.exec(clean);
  if (!start) throw new Error('Not a task line.');
  return clean.slice(0, start[0].length) + marker + ' ' + clean.slice(start[0].length);
}
