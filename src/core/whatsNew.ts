import { parseBoardConfig } from './boardConfig.ts';
import { draftFromConfig, type DraftColorRule } from './boardDraft.ts';
import { LABEL_COLORS } from './labels.ts';

/** What a feature's button in Settings → Task Trellis → What’s new does. */
export type FeatureAction = { kind: 'create-board' | 'color-rules'; label: string };

/** A feature worth pointing out after an update, and in the settings for good. */
export type Feature = { version: string; name: string; description: string; action?: FeatureAction };

/**
 * Newest first. Each release that adds something users should try adds it here, with the release's
 * version, so the update shows it once (see docs/releasing.md).
 */
export const FEATURES: Feature[] = [
  {
    version: '1.4.0', name: 'Board templates',
    description: 'Create board can start a weekly planner, a project, an Eisenhower matrix, or an example board full of sample tasks to try things out.',
    action: { kind: 'create-board', label: 'Create board…' },
  },
  {
    version: '1.4.0', name: 'Patterns and opacity for color rules',
    description: 'Color rules can tint cards with stripes, dots, a grid or checks as well as solid color, at any opacity, and colors mix with hue, saturation and lightness sliders.',
    action: { kind: 'color-rules', label: 'Add suggested color rules…' },
  },
  {
    version: '1.3.0', name: 'Search cards',
    description: 'Type in Search cards…, or press Cmd/Ctrl+F on a board, to find cards by their text, note name or labels.',
  },
];

/** Orders `1.10.0` after `1.9.2`. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The features added after `seen`, up to the running version, to show once after an update. */
export function unseenFeatures(seen: string, version: string): Feature[] {
  return FEATURES.filter((f) => compareVersions(f.version, seen) > 0 && compareVersions(f.version, version) <= 0);
}

const SUGGESTED_COLOR_RULES = [
  { name: 'Overdue', color: LABEL_COLORS[3].color, pattern: 'stripes', due: ['overdue'] },
  { name: 'Due today', color: LABEL_COLORS[2].color, due: ['today'] },
  { name: 'High priority', color: LABEL_COLORS[4].color, pattern: 'dots', priority: ['highest', 'high'] },
];

/** Starter color rules for a board's settings draft, leaving out any whose name the board already uses. */
export function suggestedColorRules(existing: { name: string }[]): DraftColorRule[] {
  const taken = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  const rules = draftFromConfig(parseBoardConfig('Suggestions', { 'color-rules': SUGGESTED_COLOR_RULES }).config).colorRules;
  return rules.filter((r) => !taken.has(r.name.toLowerCase()));
}
