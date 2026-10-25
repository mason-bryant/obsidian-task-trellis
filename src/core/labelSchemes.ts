import { LABEL_COLORS, normalizeLabelColor, type BoardLabel } from './labels.ts';

export type LabelScheme = { id: string; name: string; colors: string[] };
export type PreviousScheme = Record<string, string>;
export type LabelSchemeState = { labels: BoardLabel[]; previous: PreviousScheme };

const scheme = (id: string, name: string, colors: string): LabelScheme =>
  ({ id, name, colors: colors.split(' ').map((hex) => `#${hex.toLowerCase()}`) });

export const LABEL_SCHEMES: LabelScheme[] = [
  { id: 'trellis', name: 'Trellis', colors: LABEL_COLORS.map((c) => c.color) },
  scheme('tableau-balanced', 'Tableau balanced', '4E79A7 F28E2C E15759 76B7B2 59A14F AF7AA1'),
  scheme('tableau-classic', 'Tableau classic', '1F77B4 FF7F0E 2CA02C D62728 9467BD 8C564B'),
  scheme('botanical', 'Botanical', '47785E A5B985 D6AF5C C5795F 6E8A9E 9C7A97'),
  scheme('mediterranean', 'Mediterranean', '236A8C 4DA9A2 D9B44A D57650 8B6FA8 A6B86D'),
  scheme('retro-pop', 'Retro pop', '207E86 E3B43E D66A3E 9D536A 668B53 63699E'),
  scheme('jewel-box', 'Jewel box', '087F8C 32734D B5840A B6384B 7655A3 2957A4'),
  scheme('neon-studio', 'Neon studio', '39BD87 BBD43A F2A93B EF6581 A579E8 479DE8'),
  scheme('sorbet', 'Sorbet', '8FC9B0 C5D68D F1D286 F2AE94 D9A4C2 A7BCE3'),
  scheme('velvet', 'Velvet', '355D81 754E8A A94E78 B4804B 47786B 7E874E'),
  scheme('modern-primary', 'Modern primary', '3069AD D5AE26 C74E48 40886C 885FA2 D17C37'),
];

export function parsePreviousScheme(raw: unknown): PreviousScheme {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).flatMap(([id, value]) => {
    const color = typeof value === 'string' ? normalizeLabelColor(value) : null;
    return /^[a-z0-9_-]+$/.test(id) && color ? [[id, color]] : [];
  }));
}

/** Read latest state at write time. Snapshots follow stable IDs, never names or positions. */
export function applyLabelScheme(current: LabelSchemeState, id: string): LabelSchemeState {
  const chosen = LABEL_SCHEMES.find((s) => s.id === id);
  if (!chosen && id !== 'previous') throw new Error('Unknown color scheme.');
  const labels = current.labels.map((label, index) => ({ ...label, color: chosen
    ? chosen.colors[index % chosen.colors.length]!
    : Object.prototype.hasOwnProperty.call(current.previous, label.id) ? current.previous[label.id]! : label.color }));
  if (labels.every((label, i) => label.color === current.labels[i]!.color)) return current;
  return { labels, previous: Object.fromEntries(current.labels.map((l) => [l.id, l.color])) };
}
