import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '../config';

/** RSS feed for the learning log, published at /rss.xml. */
export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error('Set url in src/config.ts so the RSS feed can build absolute links.');
  }

  const posts = await getCollection('learning');
  const sorted = posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return rss({
    title: `${site.name} — Learning log`,
    description: 'Notes on AI, robotics, and data.',
    site: context.site,
    customData: '<language>en-us</language>',
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      categories: [...post.data.tags],
      link: `/learning/${post.id}/`,
    })),
  });
}
