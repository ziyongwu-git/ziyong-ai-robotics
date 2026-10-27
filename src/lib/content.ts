import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * Helpers for the two content folders.
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

/** Home page. A project appears here when its frontmatter says `featured: true`. */
export async function getFeaturedProjects(): Promise<CollectionEntry<'projects'>[]> {
  const projects = await getProjects();
  return projects.filter((project) => project.data.featured === true);
}
