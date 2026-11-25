/**
 * Serves hashed demo scripts. The file only exists inside this function.
 * A request without a valid invite cookie gets a refusal, not the script.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { denyIfLocked } from '../src/lib/invite';

const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'assets');

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const denied = await denyIfLocked(request, false);
  if (denied) return denied;

  const name = url.pathname.split('/').pop() ?? '';
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return new Response(null, { status: 404, headers: privateHeaders() });
  }

  const file = resolve(assetsDir, name);
  if (!file.startsWith(assetsDir + sep)) {
    return new Response(null, { status: 404, headers: privateHeaders() });
  }

  try {
    const bytes = await readFile(file);
    const type = name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(bytes, {
      headers: {
        ...privateHeaders(),
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: privateHeaders() });
  }
}

function privateHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
  };
}
