/**
 * Runs on the server for pages that are rendered on demand.
 * Prerendered pages never reach this file. Demos and builds are on demand,
 * so a request without a valid cookie is redirected before HTML is rendered.
 */
import { defineMiddleware } from 'astro:middleware';
import { denyIfLocked, gateDecision, isGatedAsset, isGatedPage, normalizePath } from './lib/invite';

export const onRequest = defineMiddleware(async (context, next) => {
  // Public pages are prerendered. Do not touch the request there: headers
  // are not available at build time, and those pages are not gated.
  if (gateDecision(context.url.pathname, false) !== 'allow') {
    const denied = await denyIfLocked(context.request, import.meta.env.DEV);
    if (denied) return denied;
  }

  const response = await next();
  const path = normalizePath(context.url.pathname);
  if (isGatedPage(path) || isGatedAsset(path) || path === '/unlock') {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  return response;
});
