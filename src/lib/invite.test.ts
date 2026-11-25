import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_WINDOW_MS,
  FAILURE_DELAY_MS,
  INVITE_COOKIE,
  INVITE_MAX_AGE_SECONDS,
  MAX_ATTEMPTS,
  clearIpFailures,
  evaluateUnlock,
  gateDecision,
  inviteCodeMatches,
  inviteConfigFromEnv,
  ipFailureCount,
  parseInviteCodes,
  readAttemptAsync,
  rememberIpFailure,
  resetIpFailures,
  safeNext,
  signInviteCookie,
  timingSafeEqual,
  verifyInviteCookie,
  type InviteConfig,
} from './invite';

const SECRET = '0123456789abcdef-local-test-secret';
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);

function config(overrides: Partial<InviteConfig> = {}): InviteConfig {
  return {
    codes: ['alpha-harbor', 'quiet-lantern'],
    secret: SECRET,
    devUnlock: false,
    ...overrides,
  };
}

describe('parseInviteCodes', () => {
  it('splits, trims, and drops blanks', () => {
    expect(parseInviteCodes(' alpha-harbor, quiet-lantern , ,')).toEqual(['alpha-harbor', 'quiet-lantern']);
  });

  it('is empty when unset', () => {
    expect(parseInviteCodes(undefined)).toEqual([]);
    expect(parseInviteCodes('')).toEqual([]);
    expect(parseInviteCodes('   ,  ')).toEqual([]);
  });

  it('drops a code that is too long to be intentional', () => {
    expect(parseInviteCodes(`${'a'.repeat(201)},ok-code`)).toEqual(['ok-code']);
  });
});

describe('inviteConfigFromEnv', () => {
  it('fails closed when the secret is missing or short', () => {
    expect(inviteConfigFromEnv({ INVITE_CODES: 'alpha-harbor' }, false).secret).toBeNull();
    expect(inviteConfigFromEnv({ INVITE_CODES: 'alpha-harbor', INVITE_COOKIE_SECRET: 'short' }, false).secret).toBeNull();
  });

  it('allows the dev override only for astro dev', () => {
    const env = { INVITE_DEV_UNLOCK: '1' };
    expect(inviteConfigFromEnv(env, true).devUnlock).toBe(true);
    expect(inviteConfigFromEnv(env, false).devUnlock).toBe(false);
    expect(inviteConfigFromEnv({ INVITE_DEV_UNLOCK: 'true' }, true).devUnlock).toBe(false);
    expect(inviteConfigFromEnv({ INVITE_DEV_UNLOCK: '1 ' }, true).devUnlock).toBe(false);
  });
});

describe('invite codes', () => {
  it('matches one of several codes and rejects the others', async () => {
    expect(await inviteCodeMatches('quiet-lantern', ['alpha-harbor', 'quiet-lantern'])).toBe(true);
    expect(await inviteCodeMatches('nope', ['alpha-harbor', 'quiet-lantern'])).toBe(false);
    expect(await inviteCodeMatches('  alpha-harbor  ', ['alpha-harbor'])).toBe(true);
  });

  it('fails closed when no codes are configured', async () => {
    expect(await inviteCodeMatches('alpha-harbor', [])).toBe(false);
    expect(await inviteCodeMatches('', ['alpha-harbor'])).toBe(false);
  });

  it('is case sensitive', async () => {
    expect(await inviteCodeMatches('Alpha-Harbor', ['alpha-harbor'])).toBe(false);
  });
});

describe('signed cookie', () => {
  it('round-trips a valid code and keeps the raw code out of the cookie', async () => {
    const token = await signInviteCookie('alpha-harbor', SECRET, NOW);
    expect(token).toBeTruthy();
    expect(token).not.toContain('alpha-harbor');
    expect(await verifyInviteCookie(token!, config(), NOW + 1000)).toBe(true);
  });

  it('rejects a tampered payload, a bad signature, and the wrong secret', async () => {
    const token = (await signInviteCookie('alpha-harbor', SECRET, NOW))!;
    const [version, body, sig] = token.split('.');
    expect(await verifyInviteCookie(`${version}.${body}.${sig!.slice(0, -2)}aa`, config(), NOW)).toBe(false);
    expect(await verifyInviteCookie(`${version}.aaaa.${sig}`, config(), NOW)).toBe(false);
    expect(await verifyInviteCookie(token, config({ secret: `${SECRET}-other` }), NOW)).toBe(false);
  });

  it('expires and refuses a lifetime longer than about 30 days', async () => {
    const token = (await signInviteCookie('alpha-harbor', SECRET, NOW))!;
    expect(await verifyInviteCookie(token, config(), NOW + INVITE_MAX_AGE_SECONDS * 1000 + 5000)).toBe(false);
    const forged = token.split('.');
    const payload = JSON.parse(Buffer.from(forged[1]!, 'base64url').toString());
    payload.exp = NOW + 10 * 365 * 24 * 60 * 60 * 1000;
    forged[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(await verifyInviteCookie(forged.join('.'), config(), NOW)).toBe(false);
  });

  it('stops working when that code is removed and keeps working for the other code', async () => {
    const alpha = (await signInviteCookie('alpha-harbor', SECRET, NOW))!;
    const quiet = (await signInviteCookie('quiet-lantern', SECRET, NOW))!;
    const revoked = config({ codes: ['quiet-lantern'] });
    expect(await verifyInviteCookie(alpha, revoked, NOW + 1000)).toBe(false);
    expect(await verifyInviteCookie(quiet, revoked, NOW + 1000)).toBe(true);
  });

  it('fails closed when production has no codes, even with a previously signed cookie', async () => {
    const token = (await signInviteCookie('alpha-harbor', SECRET, NOW))!;
    expect(await verifyInviteCookie(token, config({ codes: [] }), NOW + 1000)).toBe(false);
    expect(await verifyInviteCookie(token, config({ secret: null }), NOW + 1000)).toBe(false);
  });

  it('does not sign with a short secret', async () => {
    expect(await signInviteCookie('alpha-harbor', 'short', NOW)).toBeNull();
  });
});

describe('safeNext', () => {
  it('keeps ordinary same-site paths, including a hash and a query', () => {
    expect(safeNext(null)).toBe('/demos');
    expect(safeNext('')).toBe('/demos');
    expect(safeNext('/demos')).toBe('/demos');
    expect(safeNext('/demos/')).toBe('/demos/');
    expect(safeNext('/builds/classportal-web')).toBe('/builds/classportal-web');
    expect(safeNext('/demos/see-think-move?x=1#demo')).toBe('/demos/see-think-move?x=1#demo');
    expect(safeNext('  /learning  ')).toBe('/learning');
  });

  it('rejects open redirects and header injection', () => {
    const blocked = [
      'https://evil.com',
      'http://evil.com/demos',
      '//evil.com',
      '///evil.com',
      '/\\evil.com',
      '\\\\evil.com',
      'https://ziyongwu.vercel.app/demos',
      'javascript:alert(1)',
      '/%2f%2fevil.com',
      '/%5c%5cevil.com',
      '/demos/%0d%0aLocation:%20https://evil.com',
      '/demos\nSet-Cookie: invite=nope',
      `/${'a'.repeat(600)}`,
      '/demos/\u0000evil',
      '/%09/evil.com',
    ];
    for (const value of blocked) {
      expect(safeNext(value), value).toBe('/demos');
    }
  });

  it('normalizes a same-site traversal to a path on this site', () => {
    expect(safeNext('/demos/../learning')).toBe('/learning');
  });
});

describe('gateDecision', () => {
  it('redirects locked demo and build pages and denies their files', () => {
    expect(gateDecision('/demos', false)).toBe('redirect');
    expect(gateDecision('/demos/', false)).toBe('redirect');
    expect(gateDecision('/demos/see-think-move', false)).toBe('redirect');
    expect(gateDecision('/builds', false)).toBe('redirect');
    expect(gateDecision('/builds/classportal-web/', false)).toBe('redirect');
    expect(gateDecision('/covers/see-think-move.svg', false)).toBe('deny');
    expect(gateDecision('/_astro/gated-invite.abc123.js', false)).toBe('deny');
    expect(gateDecision('/_astro/gated/style.css', false)).toBe('deny');
    expect(gateDecision('/_astro/TabletopVla.abc123.js', false)).toBe('deny');
    expect(gateDecision('/_astro/client.abc123.js', false)).toBe('deny');
  });

  it('lets an unlocked visitor through and leaves public files alone', () => {
    expect(gateDecision('/demos/see-think-move', true)).toBe('allow');
    expect(gateDecision('/covers/see-think-move.svg', true)).toBe('allow');
    expect(gateDecision('/covers/attention.svg', false)).toBe('allow');
    expect(gateDecision('/_astro/BaseLayout.abc123.css', false)).toBe('allow');
    expect(gateDecision('/', false)).toBe('allow');
    expect(gateDecision('/learning/how-agents-talk', false)).toBe('allow');
    expect(gateDecision('/unlock', false)).toBe('allow');
    expect(gateDecision('/demonstration', false)).toBe('allow');
    expect(gateDecision('/build', false)).toBe('allow');
  });
});

describe('unlock attempts', () => {
  it('sets a cookie for a good code and does not include the code', async () => {
    const result = await evaluateUnlock({
      code: 'quiet-lantern',
      nextParam: '/builds/classportal-web',
      config: config(),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.next).toBe('/builds/classportal-web');
    expect(result.cookie).not.toContain('quiet-lantern');
    expect(await verifyInviteCookie(result.cookie, config(), NOW + 1000)).toBe(true);
  });

  it('sends a bad next path back to the demos index', async () => {
    const result = await evaluateUnlock({
      code: 'alpha-harbor',
      nextParam: 'https://evil.com',
      config: config(),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.next).toBe('/demos');
  });

  it('delays a wrong code and counts the try', async () => {
    const result = await evaluateUnlock({
      code: 'nope',
      nextParam: '/demos',
      config: config(),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    expect(result).toMatchObject({ kind: 'bad', error: 'mismatch', delayMs: FAILURE_DELAY_MS });
    if (result.kind !== 'bad') return;
    const attempt = await readAttemptAsync(result.attemptCookie, SECRET, NOW);
    expect(attempt?.count).toBe(1);
  });

  it('does not reveal that a later code is correct once the limit is reached', async () => {
    let token: string | null = null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const bad = await evaluateUnlock({
        code: `wrong-${i}`,
        nextParam: '/demos',
        config: config(),
        attemptToken: token,
        ipFailures: 0,
        now: NOW + i,
      });
      expect(bad.kind).toBe('bad');
      if (bad.kind === 'bad') token = bad.attemptCookie;
    }
    const blocked = await evaluateUnlock({
      code: 'alpha-harbor',
      nextParam: '/demos',
      config: config(),
      attemptToken: token,
      ipFailures: 0,
      now: NOW + 20,
    });
    expect(blocked).toMatchObject({ kind: 'bad', error: 'rate' });
  });

  it('also stops when this server has already seen too many failures for an address', async () => {
    const result = await evaluateUnlock({
      code: 'alpha-harbor',
      nextParam: '/demos',
      config: config(),
      attemptToken: null,
      ipFailures: MAX_ATTEMPTS,
      now: NOW,
    });
    expect(result).toMatchObject({ kind: 'bad', error: 'rate' });
  });

  it('fails closed when the secret is not configured', async () => {
    const result = await evaluateUnlock({
      code: 'alpha-harbor',
      nextParam: '/demos',
      config: config({ secret: null, codes: ['alpha-harbor'] }),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    expect(result).toMatchObject({ kind: 'bad', error: 'mismatch', attemptCookie: null });
  });

  it('treats a visit with no code as the form', async () => {
    const result = await evaluateUnlock({
      code: null,
      nextParam: null,
      config: config(),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    expect(result).toEqual({ kind: 'form', next: '/demos' });
  });

  it('forgets old tries after the window', async () => {
    const first = await evaluateUnlock({
      code: 'nope',
      nextParam: '/demos',
      config: config(),
      attemptToken: null,
      ipFailures: 0,
      now: NOW,
    });
    if (first.kind !== 'bad') throw new Error('expected a failure');
    const later = await evaluateUnlock({
      code: 'still-wrong',
      nextParam: '/demos',
      config: config(),
      attemptToken: first.attemptCookie,
      ipFailures: 0,
      now: NOW + ATTEMPT_WINDOW_MS + 10,
    });
    if (later.kind !== 'bad' || later.error !== 'mismatch') throw new Error('expected a fresh mismatch');
    const attempt = await readAttemptAsync(later.attemptCookie, SECRET, NOW + ATTEMPT_WINDOW_MS + 10);
    expect(attempt?.count).toBe(1);
  });
});

describe('ip failure memory', () => {
  it('counts failures and ignores an unknown address', () => {
    resetIpFailures();
    expect(ipFailureCount('203.0.113.4', NOW)).toBe(0);
    rememberIpFailure('203.0.113.4', NOW);
    rememberIpFailure('203.0.113.4', NOW + 1);
    expect(ipFailureCount('203.0.113.4', NOW + 2)).toBe(2);
    rememberIpFailure('unknown', NOW);
    expect(ipFailureCount('unknown', NOW)).toBe(0);
    clearIpFailures('203.0.113.4');
    expect(ipFailureCount('203.0.113.4', NOW)).toBe(0);
  });
});

describe('timingSafeEqual', () => {
  it('matches equal bytes and rejects different bytes or lengths', () => {
    expect(timingSafeEqual(utf8('abcd'), utf8('abcd'))).toBe(true);
    expect(timingSafeEqual(utf8('abcd'), utf8('abce'))).toBe(false);
    expect(timingSafeEqual(utf8('abcd'), utf8('abc'))).toBe(false);
  });
});

describe('public pages do not embed gated widgets', () => {
  it('keeps the homepage, notes, and certificate pages to teasers', () => {
    const home = readFileSync(new URL('../pages/index.astro', import.meta.url), 'utf8');
    const note = readFileSync(new URL('../content/learning/how-agents-talk.mdx', import.meta.url), 'utf8');
    const cert = readFileSync(new URL('../pages/certificates/[id].astro', import.meta.url), 'utf8');
    const learning = readFileSync(new URL('../pages/learning/[id].astro', import.meta.url), 'utf8');
    expect(home).not.toContain('TabletopVla');
    expect(home).not.toContain('experimentHint');
    expect(home).not.toContain('ProjectCard');
    expect(home).not.toContain('BuildCard');
    expect(note).not.toContain('FollowPacket');
    expect(cert).not.toContain('ProjectCard');
    expect(learning).not.toContain('experimentHint');
  });
});

describe('vercel.json', () => {
  it('keeps the old redirects and does not add a routing middleware entry', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      redirects: { source: string; destination: string }[];
      proxy?: unknown;
    };
    expect(vercel.proxy).toBeUndefined();
    expect(vercel.redirects.some((item) => item.source === '/projects' && item.destination === '/demos')).toBe(true);
  });
});

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
