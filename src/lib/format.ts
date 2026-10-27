import type { ProjectStatus } from '../config';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date as "Oct 25, 2026" using the UTC calendar day from the frontmatter. */
export function formatDate(date: Date): string {
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** YYYY-MM-DD for <time datetime>. */
export function isoDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function tagLabel(tag: string): string {
  if (tag === 'ai') return 'AI';
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

const statusLabels: Record<ProjectStatus, string> = {
  idea: 'Idea',
  'in-progress': 'In progress',
  shipped: 'Shipped',
  sample: 'Sample',
};

export function statusLabel(status: ProjectStatus): string {
  return statusLabels[status];
}
