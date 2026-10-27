import type { APIRoute } from 'astro';

/** Tells crawlers they may read the site, and where the sitemap lives. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
