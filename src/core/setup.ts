import { destinationFor, type BoardConfig, type NewTaskDestination } from './boardConfig.ts';
import { taskMatchesBoard, type Frontmatter } from './filters.ts';

/** Read-only advice: never create notes or silently weaken a board's filters. */
export function destinationAdvice(config: BoardConfig, fallback: NewTaskDestination, context: {
  dailyAvailable: boolean;
  excluded(path: string): boolean;
  metadata(path: string): { frontmatter?: Frontmatter; tags: string[] };
}): string[] {
  const destination = destinationFor(config, fallback);
  if (destination.kind === 'daily') return context.dailyAvailable
    ? ['New tasks go to today’s daily note. Its properties and the task’s tags must satisfy this board’s filters.']
    : ['Daily notes is disabled. Enable it in Obsidian’s core plugins, or choose a specific note below.'];
  if (!destination.note.trim()) return ['Choose a note path, such as Tasks/Inbox.md, before adding your first task.'];
  const path = destination.note.endsWith('.md') ? destination.note : `${destination.note}.md`;
  if (context.excluded(path)) return ['This destination is excluded from indexing. Choose a note outside the boards folder and plugin-wide excluded folders.'];
  const metadata = context.metadata(path);
  const visible = taskMatchesBoard({ path, tags: [] }, config, metadata.frontmatter, metadata.tags);
  return visible ? [`New tasks will be saved in ${path}.`]
    : [`A plain task saved in ${path} would be hidden by this board’s filters. Review Filters, choose a matching note, or include the required tags in your task.`];
}
