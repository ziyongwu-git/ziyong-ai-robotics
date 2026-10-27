import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { site } from './src/config';

/**
 * Project settings Astro reads when you run dev or build.
 *
 * `site.url` (in src/config.ts) is the public address. The sitemap and the
 * RSS feed build their links from it. Change it after the first Vercel deploy.
 *
 * `output: 'static'` writes ordinary HTML, CSS, and a little JavaScript into
 * the dist/ folder. Vercel can host that folder without a running server.
 * You only need a Vercel adapter later if a page has to run code on request.
 */
export default defineConfig({
  site: site.url,
  output: 'static',
  integrations: [mdx(), react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
