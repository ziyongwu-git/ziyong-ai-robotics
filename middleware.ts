/**
 * Vercel Routing Middleware.
 *
 * This runs before static files and before the cache. Astro's own middleware
 * does not see files in `public/` or hashed files under `/_astro`, so demo
 * JavaScript and a few covers are checked here. Pages under /demos and /builds
 * are also checked again inside the server render.
 *
 * `dev` is hard-coded false. INVITE_DEV_UNLOCK cannot open the gate on Vercel.
 */
import { next } from '@vercel/functions';
import { GATE_MATCHER, denyIfLocked } from './src/lib/invite';

export const config = {
  matcher: [...GATE_MATCHER],
};

export default async function proxy(request: Request): Promise<Response> {
  const denied = await denyIfLocked(request, false);
  if (denied) return denied;
  return next();
}
