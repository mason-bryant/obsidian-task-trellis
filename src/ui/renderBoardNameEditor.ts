import { boardNameError } from '../core/boardName.ts';
import { isComposing, uiElement } from './dom.ts';
import { renderEditorHeader } from './editorHeader.ts';
import type { RenamePreview } from '../obsidian/BoardTagRename.ts';

export type TagMigration = { preview(name: string): Promise<RenamePreview>; apply(): Promise<void> };

/** A separate editor keeps the draft intact when the board redraws behind it. */
export function renderBoardNameEditor(body: HTMLElement, headerRoot: HTMLElement, name: string,
  icon: (el: HTMLElement, name: string) => void, save: (name: string) => Promise<void>, close: () => void, migration?: TagMigration): void {
  const doc = body.ownerDocument;
  const label = uiElement(doc, 'label'); label.className = 'tt-board-name-field';
  const caption = uiElement(doc, 'span'); caption.textContent = 'Board name';
  const input = uiElement(doc, 'input'); input.type = 'text'; input.value = name;
  input.setAttribute('aria-label', 'Board name');
  const help = uiElement(doc, 'p'); help.textContent = 'Task tags and label assignments stay unchanged. Shortcuts using the old board name need to be updated.';
  const error = uiElement(doc, 'p'); error.className = 'tt-note tt-note--warning'; error.setAttribute('role', 'alert'); error.hidden = true;
  label.append(caption, input); body.replaceChildren(label, help, error);
  const option = uiElement(doc, 'label'); option.className = 'tt-rename-option';
  const migrate = uiElement(doc, 'input'); migrate.type = 'checkbox';
  const optionText = uiElement(doc, 'span'); optionText.textContent = 'Also rename board tags';
  option.append(migrate, optionText);
  const previewButton = uiElement(doc, 'button'); previewButton.type = 'button'; previewButton.textContent = 'Preview tag changes';
  const previewBox = uiElement(doc, 'section'); previewBox.className = 'tt-rename-preview'; previewBox.setAttribute('aria-live', 'polite');
  const progress = uiElement(doc, 'p'); progress.className = 'tt-rename-progress'; progress.hidden = true;
  progress.setAttribute('role', 'status'); progress.setAttribute('aria-atomic', 'true');
  if (migration) body.insertBefore(option, error);
  if (migration) body.insertBefore(previewButton, error);
  body.append(progress, previewBox); previewButton.hidden = true;
  let reviewed = false;
  const invalidate = () => {
    reviewed = false; previewBox.replaceChildren(); previewButton.hidden = !migrate.checked;
    help.textContent = migrate.checked
      ? 'Preview all affected notes before applying. Shortcuts, saved searches and custom board hotkeys using the old name or tag prefix need updating. Keep other devices idle until sync finishes.'
      : 'Task tags and label assignments stay unchanged. Shortcuts using the old board name need to be updated.';
    saveButton.setAttribute('aria-label', migrate.checked ? 'Preview tag changes' : 'Save board name');
  };
  input.addEventListener('input', invalidate); migrate.addEventListener('change', invalidate);
  let busy = false;
  const submit = async () => {
    if (busy) return;
    const invalid = boardNameError(input.value);
    error.hidden = true; input.removeAttribute('aria-invalid');
    if (invalid) { error.textContent = invalid; error.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    busy = true; input.readOnly = true; migrate.disabled = true; previewButton.disabled = true; header.setBusy(true);
    const previewing = !!migration && migrate.checked && !reviewed;
    const message = previewing ? 'Previewing tag changes…' : migrate.checked ? 'Applying changes…' : 'Saving board name…';
    progress.hidden = false; progress.textContent = message;
    saveButton.classList.add('tt-rename-saving');
    const idleLabel = saveButton.getAttribute('aria-label')!;
    saveButton.setAttribute('aria-label', message);
    if (previewing) previewButton.textContent = message;
    try {
      if (migration && migrate.checked && !reviewed) {
        const preview = await migration.preview(input.value.trim());
        const title = uiElement(doc, 'p'); title.textContent = `#tt/${preview.oldSlug}/ → #tt/${preview.newSlug}/`;
        const summary = uiElement(doc, 'p'); summary.textContent = `${preview.tagCount} task tag changes across ${preview.paths.length} notes (including board settings).`;
        const list = uiElement(doc, 'ul');
        for (const path of preview.paths) { const item = uiElement(doc, 'li'); item.textContent = path; list.append(item); }
        const recovery = uiElement(doc, 'p'); recovery.textContent = 'A recovery copy of these notes will be saved in Task Trellis recovery before applying. Use the “restore board rename” command to restore it. Later edits can require manual recovery.';
        previewBox.replaceChildren(title, summary, list, recovery);
        if (preview.referencePaths.length) {
          const warning = uiElement(doc, 'p'); warning.textContent = `Other references to check manually (queries, prose or note properties): ${preview.referencePaths.join(', ')}`;
          previewBox.append(warning);
        }
        reviewed = true; saveButton.setAttribute('aria-label', 'Rename board and tags');
        const confirm = uiElement(doc, 'p'); confirm.textContent = 'Review the list, then choose the green checkmark to rename the board and its tags.'; previewBox.append(confirm);
      } else {
        if (migration && migrate.checked) await migration.apply();
        else await save(input.value.trim());
        close();
      }
    }
    catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : 'Could not rename the board. Please try again.';
      error.hidden = false; reviewed = false;
      saveButton.setAttribute('aria-label', migrate.checked ? 'Preview tag changes' : 'Save board name');
    } finally {
      busy = false; input.readOnly = false; migrate.disabled = false; previewButton.disabled = false; header.setBusy(false);
      progress.hidden = true; progress.textContent = ''; saveButton.classList.remove('tt-rename-saving');
      previewButton.textContent = 'Preview tag changes';
      if (saveButton.getAttribute('aria-label') === message) saveButton.setAttribute('aria-label', idleLabel);
    }
  };
  const header = renderEditorHeader(headerRoot, 'Rename board', icon, () => void submit(), close, 'Save board name');
  const saveButton = headerRoot.querySelector<HTMLButtonElement>('.tt-editor-save')!;
  previewButton.onclick = () => { reviewed = false; void submit(); };
  input.addEventListener('keydown', (event) => {
    if (!isComposing(event) && event.key === 'Enter') { event.preventDefault(); void submit(); }
  });
  input.focus(); input.select();
}
