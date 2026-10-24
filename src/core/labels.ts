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


// Compatibility reads only. New assignments are always ordinary Obsidian tags.
const LEGACY_RE = /<!-- tt-labels:([\p{L}\p{N}_-]+):([a-z0-9_,-]+) -->/gu;
const LABEL_TAG_RE = /(^|\s)#tt\/([\p{L}\p{N}_-]+)\/label\/([a-z0-9_-]+)(?=[^\p{L}\p{N}_/-]|$)/giu;

export function taskLabels(line: string, slug: string): string[] {
  const wanted = slug.toLowerCase();
  const tags = [...line.matchAll(LABEL_TAG_RE)].filter((m) => m[2]!.toLowerCase() === wanted)
    .map((m) => m[3]!.toLowerCase());
  return [...new Set([...tags, ...[...line.matchAll(LEGACY_RE)]
    .filter((m) => m[1]!.toLowerCase() === wanted).flatMap((m) => m[2]!.split(',').filter(Boolean))])];
}

export function stripLegacyTaskLabels(line: string): string { return line.replace(LEGACY_RE, ''); }

/** Labels use colored bars on cards, but remain real tags for search and filtering. */
export function stripTaskLabels(line: string): string {
  return stripLegacyTaskLabels(line).replace(LABEL_TAG_RE, '$1');
}

/** A short, permanent id, unique within its board; names and colors can change freely. */
export function newLabelId(labels: BoardLabel[]): string {
  let id: string;
  do { id = `l${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`; }
  while (labels.some((label) => label.id === id));
  return id;
}

/** Only replaces this board's labels; other boards, fields, placement tags and block ids survive. */
export function setTaskLabels(line: string, slug: string, ids: string[]): string {
  if (!/^[\p{L}\p{N}_-]+$/u.test(slug) || ids.some((id) => !/^[a-z0-9_-]+$/.test(id))) {
    throw new Error('Invalid board or label id.');
  }
  if (!/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s+)/.test(line)) throw new Error('Not a task line.');
  const wanted = slug.toLowerCase();
  let clean = line.replace(/<!-- tt-labels:([\p{L}\p{N}_-]+):([a-z0-9_,-]+) --> ?/gu,
    (match, board: string) => board.toLowerCase() === wanted ? '' : match);
  clean = clean.replace(LABEL_TAG_RE, (match, _lead: string, board: string) => board.toLowerCase() === wanted ? '' : match);
  if (!ids.length) return clean;
  const tags = [...new Set(ids)].map((id) => `#tt/${wanted}/label/${id}`).join(' ');
  // Keep labels after Tasks fields and before placement tags and block ids.
  const tail = /(?:\s+(?:#tt\/[\p{L}\p{N}_/-]+|\^[A-Za-z0-9-]+))+\s*$/u.exec(clean);
  const at = tail?.index ?? clean.trimEnd().length;
  return `${clean.slice(0, at)} ${tags}${clean.slice(at)}`;
}
