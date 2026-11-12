import { getCollection, type CollectionEntry } from 'astro:content';
import { familyIds, usesCertification } from './certifications';

/**
 * Helpers for the content folders: notes, demos, and builds.
 * Pages call these instead of sorting posts themselves.
 */

export async function getLearningPosts(): Promise<CollectionEntry<'learning'>[]> {
  const posts = await getCollection('learning');
  return posts.sort((a, b) => {
    const byDate = b.data.date.getTime() - a.data.date.getTime();
    if (byDate !== 0) return byDate;
    return a.data.title.localeCompare(b.data.title);
  });
}

export async function getProjects(): Promise<CollectionEntry<'projects'>[]> {
  const projects = await getCollection('projects');
  return projects.sort((a, b) => {
    const byDate = (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0);
    if (byDate !== 0) return byDate;
    return a.data.title.localeCompare(b.data.title);
  });
}

/** Builds, in `order`, then most recently updated. */
export async function getBuilds(): Promise<CollectionEntry<'builds'>[]> {
  const builds = await getCollection('builds');
  return builds.sort((a, b) => {
    const byOrder = a.data.order - b.data.order;
    if (byOrder !== 0) return byOrder;
    const byUpdated = b.data.updated.getTime() - a.data.updated.getTime();
    if (byUpdated !== 0) return byUpdated;
    return a.data.title.localeCompare(b.data.title);
  });
}

/** Home page. A demo appears here when its frontmatter says `featured: true`. */
export async function getFeaturedProjects(): Promise<CollectionEntry<'projects'>[]> {
  const projects = await getProjects();
  return projects.filter((project) => project.data.featured === true && !isSampleProject(project));
}

/** Format examples stay on the site. They do not lead the home page. */
export function isSampleProject(project: CollectionEntry<'projects'>): boolean {
  return project.data.status === 'sample' || project.id.startsWith('sample-');
}

export function isSampleNote(post: CollectionEntry<'learning'>): boolean {
  return post.id.startsWith('sample-') || post.data.title.startsWith('[Sample]');
}

/**
 * Demos and notes that list this certificate, or a course nested under it.
 * Demos come back first. Direct matches come before work that only lists a course.
 */
export async function workBuiltOn(certId: string): Promise<{
  demos: CollectionEntry<'projects'>[];
  notes: CollectionEntry<'learning'>[];
}> {
  const ids = familyIds(certId);
  const [demos, notes] = await Promise.all([getProjects(), getLearningPosts()]);
  const directFirst = (value: string | readonly string[]) =>
    valueIncludes(value, certId) ? 0 : 1;
  return {
    demos: demos
      .filter((item) => usesCertification(item.data.certification, ids))
      .sort((a, b) => directFirst(a.data.certification) - directFirst(b.data.certification)),
    notes: notes
      .filter((item) => usesCertification(item.data.certification, ids))
      .sort((a, b) => directFirst(a.data.certification) - directFirst(b.data.certification)),
  };
}

function valueIncludes(value: string | readonly string[], id: string): boolean {
  return usesCertification(value, [id]);
}

/** How many demos and notes sit on this certificate, counting its courses. */
export async function workCounts(certId: string): Promise<{ demos: number; notes: number }> {
  const work = await workBuiltOn(certId);
  return { demos: work.demos.length, notes: work.notes.length };
}
