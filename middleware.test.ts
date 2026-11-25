import { afterEach, describe, expect, it } from 'vitest';
import { denyIfLocked, signInviteCookie } from './src/lib/invite';

const SECRET = '0123456789abcdef-local-test-secret';

afterEach(() => {
  delete process.env.INVITE_CODES;
  delete process.env.INVITE_COOKIE_SECRET;
  delete process.env.INVITE_DEV_UNLOCK;
});

describe('server gate', () => {
  it('sends a locked visitor from /demos to the unlock page', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const response = await denyIfLocked(new Request('https://ziyongwu.vercel.app/demos/see-think-move?x=1'), false);
    expect(response?.status).toBe(302);
    const location = new URL(response?.headers.get('location') ?? '');
    expect(location.origin).toBe('https://ziyongwu.vercel.app');
    expect(location.pathname).toBe('/unlock');
    expect(location.searchParams.get('next')).toBe('/demos/see-think-move?x=1');
    expect(response?.headers.get('x-robots-tag')).toBe('noindex');
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('does not open the gate when the dev override is set on the server', async () => {
    process.env.INVITE_DEV_UNLOCK = '1';
    const response = await denyIfLocked(new Request('https://ziyongwu.vercel.app/builds'), false);
    expect(response?.status).toBe(302);
  });

  it('stays locked when invite codes are unset', async () => {
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const response = await denyIfLocked(new Request('https://ziyongwu.vercel.app/demos'), false);
    expect(response?.status).toBe(302);
  });

  it('refuses a gated cover and lets a public cover through', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const blocked = await denyIfLocked(new Request('https://ziyongwu.vercel.app/covers/classportal-web.svg'), false);
    expect(blocked?.status).toBe(401);
    expect(await blocked?.text()).not.toContain('<svg');
    const allowed = await denyIfLocked(new Request('https://ziyongwu.vercel.app/covers/attention.svg'), false);
    expect(allowed).toBeNull();
  });

  it('refuses demo JavaScript without a cookie and allows it with one', async () => {
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const blocked = await denyIfLocked(new Request('https://ziyongwu.vercel.app/_astro/gated-invite.abc123.js'), false);
    expect(blocked?.status).toBe(401);
    const token = await signInviteCookie('alpha-harbor', SECRET);
    const allowed = await denyIfLocked(
      new Request('https://ziyongwu.vercel.app/_astro/gated-invite.abc123.js', {
        headers: { cookie: `invite=${token}` },
      }),
      false,
    );
    expect(allowed).toBeNull();
  });

  it('lets a valid cookie through to a demo page', async () => {
    process.env.INVITE_CODES = 'alpha-harbor,quiet-lantern';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const token = await signInviteCookie('quiet-lantern', SECRET);
    const response = await denyIfLocked(
      new Request('https://ziyongwu.vercel.app/demos', {
        headers: { cookie: `invite=${token}` },
      }),
      false,
    );
    expect(response).toBeNull();
  });

  it('ignores a cookie whose code was removed', async () => {
    const token = await signInviteCookie('retired-code', SECRET);
    process.env.INVITE_CODES = 'alpha-harbor';
    process.env.INVITE_COOKIE_SECRET = SECRET;
    const response = await denyIfLocked(
      new Request('https://ziyongwu.vercel.app/builds/classportal-web', {
        headers: { cookie: `invite=${token}` },
      }),
      false,
    );
    expect(response?.status).toBe(302);
  });

  it('does not touch the home page or the public stylesheet', async () => {
    const home = await denyIfLocked(new Request('https://ziyongwu.vercel.app/'), false);
    const css = await denyIfLocked(new Request('https://ziyongwu.vercel.app/_astro/BaseLayout.abc.css'), false);
    expect(home).toBeNull();
    expect(css).toBeNull();
  });
});
