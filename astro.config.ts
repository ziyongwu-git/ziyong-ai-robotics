import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { site } from './src/config';

/**
 * Project settings Astro reads when you run dev or build.
 *
 * `site.url` (in src/config.ts) is the public address. The sitemap and the
 * RSS feed build their links from it. Change it after the first Vercel deploy.
 *
 * Most pages are still written ahead of time. Demos, builds, the unlock page,
 * and the demo covers are rendered when someone asks for them, so a missing
 * invite cookie never receives that HTML. The Vercel adapter publishes those
 * routes. Do not turn on ISR: it would cache a page after the first visitor.
 */
export default defineConfig({
  site: site.url,
  output: 'static',
  adapter: vercel(),
  integrations: [
    mdx(),
    react(),
    sitemap({
      filter: (page) =>
        !page.includes('/projects') &&
        !page.includes('/learning/certifications') &&
        !page.includes('/demos') &&
        !page.includes('/builds') &&
        !page.includes('/unlock'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replaceAll('\\', '/');
            if (
              normalized.includes('/src/components/demos/') ||
              normalized.includes('/node_modules/@xyflow/') ||
              normalized.includes('/node_modules/@dagrejs/') ||
              normalized.includes('/node_modules/dagre/')
            ) {
              return 'gated-invite';
            }
          },
        },
      },
    },
  },
});
