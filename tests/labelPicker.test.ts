// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLabels, type BoardLabel } from '../src/core/labels.ts';
import { renderLabelPicker, type LabelPickerHost } from '../src/ui/renderLabelPicker.ts';

let root: HTMLElement;
let host: LabelPickerHost;
let labels: BoardLabel[];
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
const check = (id: string) => root.querySelector<HTMLInputElement>(`[data-label-id="${id}"]`)!;
const input = (el: HTMLInputElement, value: string) => { el.value = value; el.dispatchEvent(new Event('input')); };
const edit = () => root.querySelector<HTMLButtonElement>('.tt-label-edit')!.click();
const submit = () => root.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();

beforeEach(() => {
  root = document.createElement('div'); document.body.replaceChildren(root);
  labels = defaultLabels();
  host = {
    icon: () => undefined,
    saveSelection: vi.fn(async () => undefined),
    saveLabel: vi.fn(async (label) => {
      labels = labels.some((l) => l.id === label.id) ? labels.map((l) => l.id === label.id ? label : l) : [...labels, label];
      return labels;
    }),
  };
  renderLabelPicker(root, labels, [], host);
});

describe('label picker', () => {
  it('saves multiple checked labels and unchecked labels without closing the picker', async () => {
    check('red').click(); await flush();
    check('blue').click(); await flush();
    check('red').click(); await flush();
    expect(host.saveSelection).toHaveBeenNthCalledWith(1, ['red']);
    expect(host.saveSelection).toHaveBeenNthCalledWith(2, ['red', 'blue']);
    expect(host.saveSelection).toHaveBeenNthCalledWith(3, ['blue']);
    expect(check('blue').checked).toBe(true);
  });

  it('searches unnamed colors and names while preserving selections', async () => {
    labels[0]!.name = 'Financial planning';
    renderLabelPicker(root, labels, ['red'], { ...host, showSearch: true });
    const search = root.querySelector<HTMLInputElement>('.tt-label-search')!;
    input(search, 'financial');
    expect(root.querySelectorAll('.tt-label-row')).toHaveLength(1);
    check('green').click(); await flush();
    input(search, 'red'); expect(check('red').checked).toBe(true);
    input(search, 'missing'); expect(root.textContent).toContain('No matching labels.');
    expect(host.saveSelection).toHaveBeenCalledWith(['red', 'green']);
  });

  it('edits a shared definition using its stable id and validates custom colors', async () => {
    edit();
    const [name, hex] = [...root.querySelectorAll<HTMLInputElement>('input')];
    input(name!, 'Financial planning'); input(hex!, 'invalid'); submit(); await flush();
    expect(host.saveLabel).not.toHaveBeenCalled();
    input(hex!, '#FC0'); submit(); await flush();
    expect(host.saveLabel).toHaveBeenCalledWith({ id: 'green', name: 'Financial planning', color: '#ffcc00' });
    expect(root.querySelector('.tt-label-swatch')!.textContent).toBe('Financial planning');
    expect(document.activeElement).toBe(check('green'));
  });

  it('cancels edits without changing definitions and can create an unnamed label', async () => {
    edit(); input(root.querySelector<HTMLInputElement>('input')!, 'Discard');
    root.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.click();
    expect(host.saveLabel).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.tt-label-create')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Red"]')!.click(); submit(); await flush();
    expect(labels).toHaveLength(7);
    expect(labels[6]).toMatchObject({ name: '', color: '#ae2e24' });
    expect(labels[6]!.id).toBe('1');
    expect(root.querySelectorAll('.tt-label-row')).toHaveLength(7);
  });

  it('rolls back a failed checkbox save and allows retry', async () => {
    vi.mocked(host.saveSelection).mockRejectedValueOnce(new Error('Task changed.'));
    check('red').click(); await flush();
    expect(check('red').checked).toBe(false);
    expect(root.querySelector('[role="alert"]')!.textContent).toBe('Task changed.');
    check('red').click(); await flush();
    expect(check('red').checked).toBe(true);
  });

  it('keeps an unsaved label draft after a failed definition write', async () => {
    vi.mocked(host.saveLabel).mockRejectedValueOnce(new Error('Save failed.'));
    edit(); input(root.querySelector<HTMLInputElement>('input')!, 'Urgent'); submit(); await flush();
    expect(root.querySelector<HTMLInputElement>('input')!.value).toBe('Urgent');
    expect(root.querySelector('[role="alert"]')!.textContent).toBe('Save failed.');
    submit(); await flush(); expect(labels[0]!.name).toBe('Urgent');
  });

  it('disables inputs during a write to prevent overlapping stale selections', async () => {
    let finish!: () => void;
    vi.mocked(host.saveSelection).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    check('red').click(); check('blue').click();
    expect(host.saveSelection).toHaveBeenCalledTimes(1);
    expect(check('blue').disabled).toBe(true);
    finish(); await flush(); expect(check('blue').disabled).toBe(false);
  });
});


it('keeps header actions disabled during an external-header save, then allows retry', async () => {
  const header = document.createElement('div'); document.body.prepend(header);
  let reject!: (reason: Error) => void;
  vi.mocked(host.saveLabel).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  renderLabelPicker(root, labels, [], { ...host, header });
  edit(); input(root.querySelector<HTMLInputElement>('input')!, 'Keep my draft');
  const save = header.querySelector<HTMLButtonElement>('.tt-editor-save')!;
  const cancel = header.querySelector<HTMLButtonElement>('.tt-editor-cancel')!;
  save.click(); save.click(); cancel.click();
  expect(host.saveLabel).toHaveBeenCalledTimes(1);
  expect(save.disabled).toBe(true); expect(cancel.disabled).toBe(true);
  reject(new Error('Try again')); await flush();
  expect(save.disabled).toBe(false); expect(cancel.disabled).toBe(false);
  expect(root.querySelector<HTMLInputElement>('input')!.value).toBe('Keep my draft');
  save.click(); await flush();
  expect(labels[0]!.name).toBe('Keep my draft');
  expect(header.querySelector('.tt-editor-save')).toBeNull();
});


it('hides search by default while keeping labels available, and restores the preference when reopened', () => {
  expect(root.querySelector('.tt-label-search')).toBeNull();
  expect(root.querySelectorAll('.tt-label-row')).toHaveLength(6);
  renderLabelPicker(root, labels, [], { ...host, showSearch: true });
  expect(root.querySelector('.tt-label-search')).not.toBeNull();
  renderLabelPicker(root, labels, [], { ...host, showSearch: false });
  expect(root.querySelector('.tt-label-search')).toBeNull();
  expect(root.querySelectorAll('.tt-label-row')).toHaveLength(6);
});

it('previews schemes, cancels without saving, and preserves assignments when applying/restoring', async () => {
  const { applyLabelScheme } = await import('../src/core/labelSchemes.ts');
  let state = { labels, previous: {} };
  host.saveScheme = vi.fn(async id => { state = applyLabelScheme(state,id); return state; });
  renderLabelPicker(root,labels,['red'],host);
  const open = () => root.querySelector<HTMLButtonElement>('.tt-label-schemes-button')!.click();
  open();
  expect(root.querySelector<HTMLButtonElement>('[aria-label="Previous scheme"]')!.disabled).toBe(true);
  root.querySelector<HTMLButtonElement>('[aria-label="Botanical"]')!.click();
  expect(host.saveScheme).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.click();
  expect(host.saveScheme).not.toHaveBeenCalled();
  open(); root.querySelector<HTMLButtonElement>('[aria-label="Botanical"]')!.click(); submit(); await flush();
  expect(check('red').checked).toBe(true);
  expect(host.saveSelection).not.toHaveBeenCalled();
  expect(state.labels[0]!.color).toBe('#47785e');
  open(); root.querySelector<HTMLButtonElement>('[aria-label="Previous scheme"]')!.click(); submit(); await flush();
  expect(state.labels).toEqual(defaultLabels());
});

it('retains the scheme preview after a failed write and prevents overlapping writes', async () => {
  const { applyLabelScheme } = await import('../src/core/labelSchemes.ts');
  let reject!: (reason: Error) => void;
  host.saveScheme = vi.fn().mockImplementationOnce(()=>new Promise((_r,fail)=>{reject=fail})).mockImplementation(async id=>applyLabelScheme({labels,previous:{}},id));
  renderLabelPicker(root,labels,[],host);
  root.querySelector<HTMLButtonElement>('.tt-label-schemes-button')!.click();
  root.querySelector<HTMLButtonElement>('[aria-label="Velvet"]')!.click(); submit(); submit();
  expect(host.saveScheme).toHaveBeenCalledTimes(1);
  reject(new Error('Disk unavailable')); await flush();
  expect(root.querySelector('[role="alert"]')!.textContent).toBe('Disk unavailable');
  expect(root.querySelector('[aria-label="Velvet"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector<HTMLButtonElement>('[aria-label="Previous scheme"]')!.disabled).toBe(true);
  submit(); await flush();
  expect(root.querySelector('.tt-label-schemes-button')).not.toBeNull();
});
