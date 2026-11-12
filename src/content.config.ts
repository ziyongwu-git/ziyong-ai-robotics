import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { buildStatuses, projectStatuses, tags } from './config';
import { certificationField } from './lib/certification-field';

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
    /**
     * Required. A DeepLearning.AI id from src/data/certifications.ts,
     * or a list of them. An A2A and MCP note uses a2a-agent2agent-protocol.
     * The build fails if this is missing or is not one of those ids.
     */
    certification: certificationField('Note'),
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
    /** Optional. Featured demos are listed on the home page. */
    featured: z.boolean().optional(),
    /** Optional. When set, newer dates are listed first. */
    date: z.coerce.date().optional(),
    /**
     * Required. A DeepLearning.AI id from src/data/certifications.ts,
     * or a list of them. The build fails if this is missing or unknown.
     */
    certification: certificationField('Demo'),
    /** Optional demo URL or a path such as /demos/my-tool#demo. */
    demo: optionalLink,
    /** Optional repository URL. */
    repo: optionalLink,
    /** Optional picture. Leave it out for a generated pattern. See `optionalCover`. */
    cover: optionalCover,
  }),
});

/**
 * Shipped products. Separate from demos and notes.
 *
 * A build does not take `certification`. Demos and notes still require it.
 * The public URL is `/builds/<file-name>`. Keep a filename stable once it
 * is published. `order` lists smaller numbers first.
 *
 * `started` is the month the work began, written as YYYY-MM-01. The page
 * shows that month. `updated` is the calendar day of the latest rewrite.
 */
const builds = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/builds',
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(buildStatuses),
    /** Month the work began. Use the first of that month: YYYY-MM-01. */
    started: z.coerce.date(),
    /** Calendar day of the latest rewrite, shown in full on the page. */
    updated: z.coerce.date(),
    /** Optional live app. A path on this site, or an http(s) URL. */
    liveUrl: optionalPath('the live URL'),
    stack: z.array(z.string().min(1)).min(1),
    /** Optional picture. Leave it out for a generated pattern. See `optionalCover`. */
    cover: optionalCover,
    /** Smaller numbers are listed first. */
    order: z.number().int(),
  }),
});

export const collections = { learning, projects, builds };
