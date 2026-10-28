import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { projectStatuses, tags } from './config';

/**
 * Content collections.
 *
 * This file is the checklist for Markdown files. Astro reads every file in
 * the folders below and checks the frontmatter (the --- block at the top)
 * against the schema. A missing title or a misspelled tag fails the build
 * on purpose, so a broken note never becomes a blank page.
 *
 * The file lives at src/content.config.ts, next to the content folder,
 * not inside it. That path is what Astro 7 expects.
 *
 * Adding a post is just adding a file. You do not register the file here.
 * The glob pattern already picks up every .md and .mdx file in the folder.
 */

/**
 * A path on this site (`/covers/photo.jpg`) or a full http(s) URL.
 * `what` is only used in the error message.
 */
function optionalPath(what: string) {
  return z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://'),
      `Start ${what} with /, http://, or https://. Leave the field out if you have nothing to put here.`,
    )
    .optional();
}

/** A link on a project: a path on this site, or a full http(s) URL. */
const optionalLink = optionalPath('the link');

/**
 * Optional picture. Put the file in `public/` and use a path like
 * `/covers/photo.jpg`, or paste an https URL. Leave it out and the
 * site draws a pattern from the tags.
 */
const optionalCover = optionalPath('the cover');

const learning = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/learning',
  }),
  schema: z.object({
    title: z.string(),
    /** A calendar date, written YYYY-MM-DD. Newest notes are shown first. */
    date: z.coerce.date(),
    tags: z.array(z.enum(tags)).min(1),
    /**
     * course/source — the course, paper, video, or book the note came from.
     * The field name is `source`.
     */
    source: z.string(),
    summary: z.string(),
    /** Optional picture. Leave it out for a generated pattern. See `optionalCover`. */
    cover: optionalCover,
  }),
});

const projects = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/projects',
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.enum(tags)).min(1),
    status: z.enum(projectStatuses),
    /** Optional. Featured projects are listed on the home page. */
    featured: z.boolean().optional(),
    /** Optional. When set, newer dates are listed first. */
    date: z.coerce.date().optional(),
    /** Optional demo URL or a path such as /projects/my-tool#demo. */
    demo: optionalLink,
    /** Optional repository URL. */
    repo: optionalLink,
    /** Optional picture. Leave it out for a generated pattern. See `optionalCover`. */
    cover: optionalCover,
  }),
});

export const collections = { learning, projects };
