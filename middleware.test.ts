import { afterEach, describe, expect, it, vi } from 'vitest';
import { signInviteCookie } from './src/lib/invite';

vi.mock('@vercel/functions', () => ({
  next: vi.fn(() => new Response(null, { status: 204, headers: { 'x-middleware-next': '1' } })),
}));

const SECRET = '0123456789abcdef-local-test-secret';

async function loadProxy() {
  vi.resetModules();
  return import('./middleware');
}

afterEach(() => {
  delete process.env.INVITE_CODES;
  delete process.env.INVITE_COOKIE_SECRET;
  delete process.env.INVITE_DEV_UNLOCK;
});

describe('Vercel routing middleware', () => {
  it('sends a locked visitor from /demos to the unlock page', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const { default: proxy } = await loadProxy();
    const response = await proxy(new Request('https://ziyongwu.vercel.app/demos/see-think-move?x=1'));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://ziyongwu.vercel.app');
    expect(location.pathname).toBe('/unlock');
    expect(location.searchParams.get('next')).toBe('/demos/see-think-move?x=1');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('does not open the gate when the dev override is set on the server', async () => {
    process.env.INVITE_DEV_UNLOCK = '1';
    const { default: proxy } = await loadProxy();
    const response = await proxy(new Request('https://ziyongwu.vercel.app/builds'));
    expect(response.status).toBe(302);
  });

  it('stays locked when invite codes are unset', async () => {
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const { default: proxy } = await loadProxy();
    const response = await proxy(new Request('https://ziyongwu.vercel.app/demos'));
    expect(response.status).toBe(302);
  });

  it('refuses a gated cover and lets a public cover through', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const { default: proxy } = await loadProxy();
    const blocked = await proxy(new Request('https://ziyongwu.vercel.app/covers/classportal-web.svg'));
    expect(blocked.status).toBe(401);
    expect(await blocked.text()).not.toContain('<svg');
    const allowed = await proxy(new Request('https://ziyongwu.vercel.app/covers/attention.svg'));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses demo JavaScript without a cookie and serves it with one', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const { default: proxy } = await loadProxy();
    const blocked = await proxy(new Request('https://ziyongwu.vercel.app/_astro/gated-invite.abc123.js'));
    expect(blocked.status).toBe(401);
    const token = await signInviteCookie('alpha-harbor', SECRET);
    const allowed = await proxy(
      new Request('https://ziyongwu.vercel.app/_astro/gated-invite.abc123.js', {
        headers: { cookie: `invite=${token}` },
      }),
    );
    expect(allowed.status).toBe(204);
  });

  it('lets a valid cookie through to a demo page', async () => {
    process.env.INVITE_CODES = 'alpha-harbor,quiet-lantern';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const token = await signInviteCookie('quiet-lantern', SECRET);
    const { default: proxy } = await loadProxy();
    const response = await proxy(
      new Request('https://ziyongwu.vercel.app/demos', {
        headers: { cookie: `invite=${token}` },
      }),
    );
    expect(response.status).toBe(204);
  });

  it('ignores a cookie whose code was removed', async () => {
    const token = await signInviteCookie('retired-code', SECRET);
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const { default: proxy } = await loadProxy();
    const response = await proxy(
      new Request('https://ziyongwu.vercel.app/builds/classportal-web', {
        headers: { cookie: `invite=${token}` },
      }),
    );
    expect(response.status).toBe(302);
  });

  it('does not touch the home page', async () => {
    const { default: proxy } = await loadProxy();
    const response = await proxy(new Request('https://ziyongwu.vercel.app/'));
    expect(response.status).toBe(204);
  });
});
