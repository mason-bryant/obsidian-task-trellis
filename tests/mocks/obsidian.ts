// Just enough of the Obsidian API for the adapter tests.
export class TFile {
  constructor(public path: string) {}
  get basename(): string { return this.path.split('/').pop()!.replace(/\.md$/, ''); }
  get extension(): string {
    return this.path.split('.').pop() ?? '';
  }
}

export const notices: string[] = [];

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export class Events {
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  on(name: string, cb: (...args: unknown[]) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), cb]);
    return { name, cb };
  }
  trigger(name: string, ...args: unknown[]) {
    for (const cb of this.handlers.get(name) ?? []) cb(...args);
  }
  offref(ref: { name: string; cb: (...args: unknown[]) => void }) {
    this.handlers.set(ref.name, (this.handlers.get(ref.name) ?? []).filter((cb) => cb !== ref.cb));
  }
}

/** Obsidian's workspace, with no view active. */
export class Workspace extends Events {
  getActiveViewOfType(): null { return null; }
}

export class TFolder { constructor(public path: string) {} }
export class Modal {}
export class Setting {}
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/');

// getAllTags combines already-parsed metadata; Markdown parsing belongs to Obsidian.
export function getAllTags(cache: { frontmatter?: Record<string, unknown>; tags?: { tag: string }[] }): string[] {
  const raw = cache.frontmatter?.tags;
  const frontmatter = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : [];
  return [...frontmatter.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.startsWith('#') ? tag : `#${tag}`),
    ...(cache.tags ?? []).map((tag) => tag.tag)];
}

export class Component { load() {} unload() {} }
export class ItemView {
  app: unknown;
  contentEl: HTMLElement;
  constructor(leaf: { app: unknown }) { this.app = leaf.app; this.contentEl = document.createElement('div'); }
}
export class FileView extends ItemView {}
export const MarkdownRenderer = { render: async () => {} };
export class Menu {}
export const setIcon = () => {};
export class Plugin {}
export class FuzzySuggestModal {}
export class WorkspaceLeaf {}
export class PluginSettingTab {}

// JSON is a YAML subset; migration fixtures use it to isolate the vault transaction tests.
export const parseYaml = (value: string): unknown => JSON.parse(value);
export const stringifyYaml = (value: unknown): string => JSON.stringify(value) + '\n';
