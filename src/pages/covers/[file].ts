import type { APIRoute } from 'astro';
import askTheNotebook from '../../gated/covers/ask-the-notebook.svg?raw';
import classportalWeb from '../../gated/covers/classportal-web.svg?raw';
import followThePacket from '../../gated/covers/follow-the-packet.svg?raw';
import seeThinkMove from '../../gated/covers/see-think-move.svg?raw';
import { denyIfLocked } from '../../lib/invite';

export const prerender = false;

const files: Record<string, string> = {
  'see-think-move.svg': seeThinkMove,
  'ask-the-notebook.svg': askTheNotebook,
  'follow-the-packet.svg': followThePacket,
  'classportal-web.svg': classportalWeb,
};

/** Serves a demo or build cover only after the invite cookie checks out. */
export const GET: APIRoute = async (context) => {
  const denied = await denyIfLocked(context.request, import.meta.env.DEV);
  if (denied) return denied;

  const name = context.params.file;
  const svg = name ? files[name] : undefined;
  if (!svg) {
    return new Response(null, {
      status: 404,
      headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, no-store' },
    });
  }

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  });
};
