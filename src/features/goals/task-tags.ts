import type { Goal, TaskTag } from '../../core/domain';

export const TASK_TAGS: { value: TaskTag; label: string }[] = [
  { value: 'work', label: '#работа' },
  { value: 'rest', label: '#отдых' },
  { value: 'home', label: '#дом' },
];

export function taskTagLabel(tag: Goal['tag']): string | null {
  return TASK_TAGS.find((item) => item.value === tag)?.label ?? null;
}

export function filterTasksByTag(tasks: Goal[], tag: TaskTag | null | 'all'): Goal[] {
  return tag === 'all' ? tasks : tasks.filter((task) => (task.tag ?? null) === tag);
}
