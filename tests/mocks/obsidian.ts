// Just enough of the Obsidian API for the adapter tests.
export class TFile {
  constructor(public path: string) {}
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
}
