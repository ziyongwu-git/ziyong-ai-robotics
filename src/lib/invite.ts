/**
 * Invite gate for /demos and /builds.
 *
 * Codes and the cookie secret come from the environment at request time.
 * They are never written into the pages. If the codes are missing, the gate
 * stays shut.
 */

export const INVITE_COOKIE = 'invite';
export const ATTEMPT_COOKIE = 'invite_try';
export const INVITE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const MIN_SECRET_LENGTH = 16;
export const MAX_CODE_LENGTH = 200;
export const MAX_ATTEMPTS = 8;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const FAILURE_DELAY_MS = 800;

const INVITE_MAX_AGE_MS = INVITE_MAX_AGE_SECONDS * 1000;
const EXP_GRACE_MS = 24 * 60 * 60 * 1000;
const NEXT_FALLBACK = '/demos';
const MAX_NEXT_LENGTH = 512;

export const GATED_COVERS = [
  '/covers/see-think-move.svg',
  '/covers/ask-the-notebook.svg',
  '/covers/follow-the-packet.svg',
  '/covers/classportal-web.svg',
] as const;

const GATED_COVER_SET = new Set<string>(GATED_COVERS);

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
} as const;

export type InviteEnv = {
  INVITE_CODES?: string;
  INVITE_COOKIE_SECRET?: string;
  INVITE_DEV_UNLOCK?: string;
};

export type InviteConfig = {
  codes: readonly string[];
  /** Null when the secret is missing or shorter than 16 characters. */
  secret: string | null;
  /** Local `astro dev` only. Ignored for any production build. */
  devUnlock: boolean;
};

export type Attempt = {
  count: number;
  windowStart: number;
};

export type UnlockEvaluation =
  | { kind: 'form'; next: string }
  | { kind: 'ok'; next: string; cookie: string }
  | {
      kind: 'bad';
      next: string;
      error: 'mismatch' | 'rate';
      delayMs: number;
      attemptCookie: string | null;
    };

type OkPayload = { k: 'ok'; exp: number; h: string };
type TryPayload = { k: 'try'; c: number; t: number };

export function parseInviteCodes(raw: string | undefined): string[] {
  if (!raw) return [];
  const codes: string[] = [];
  for (const part of raw.split(',')) {
    const code = part.trim();
    if (!code || code.length > MAX_CODE_LENGTH) continue;
    codes.push(code);
  }
  return codes;
}

export function inviteConfigFromEnv(env: InviteEnv, dev: boolean): InviteConfig {
  const secret = (env.INVITE_COOKIE_SECRET ?? '').trim();
  return {
    codes: parseInviteCodes(env.INVITE_CODES),
    secret: secret.length >= MIN_SECRET_LENGTH ? secret : null,
    devUnlock: dev === true && env.INVITE_DEV_UNLOCK === '1',
  };
}

/** Read env vars without letting the bundler bake the values into the file. */
export function currentInviteConfig(dev: boolean): InviteConfig {
  return inviteConfigFromEnv(
    {
      INVITE_CODES: readEnv('INVITE_CODES'),
      INVITE_COOKIE_SECRET: readEnv('INVITE_COOKIE_SECRET'),
      INVITE_DEV_UNLOCK: readEnv('INVITE_DEV_UNLOCK'),
    },
    dev,
  );
}

function readEnv(name: string): string | undefined {
  const env = process['env'] as Record<string, string | undefined>;
  const value = env[name];
  return typeof value === 'string' ? value : undefined;
}

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function isGatedPage(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === '/demos' || path.startsWith('/demos/') || path === '/builds' || path.startsWith('/builds/');
}

/**
 * Demo JavaScript and CSS are emitted under `/_astro` with hashed names.
 * The shared stylesheet starts with `BaseLayout.` and stays public.
 * Every other file in that folder belongs to a demo or to the code a demo loads.
 */
export function isGatedAsset(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (GATED_COVER_SET.has(path)) return true;
  if (!path.startsWith('/_astro/')) return false;
  const name = path.slice('/_astro/'.length);
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return true;
  return !name.startsWith('BaseLayout.');
}

export function gateDecision(pathname: string, unlocked: boolean): 'allow' | 'redirect' | 'deny' {
  if (isGatedPage(pathname)) return unlocked ? 'allow' : 'redirect';
  if (isGatedAsset(pathname)) return unlocked ? 'allow' : 'deny';
  return 'allow';
}

/**
 * Same-site path only. Anything that could send a browser to another site
 * becomes the demos index.
 */
export function safeNext(input: string | null | undefined, fallback = NEXT_FALLBACK): string {
  if (input == null) return fallback;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_NEXT_LENGTH) return fallback;
  if (hasForbiddenChars(trimmed)) return fallback;

  let decoded = trimmed;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
    if (decoded.length > MAX_NEXT_LENGTH || hasForbiddenChars(decoded)) return fallback;
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback;
  if (decoded.includes('\\') || decoded.includes('://')) return fallback;

  let url: URL;
  try {
    url = new URL(decoded, 'https://invite.local');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://invite.local' || url.username || url.password) return fallback;
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return fallback;
  if (url.pathname.includes('\\') || url.pathname.includes('://')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

function hasForbiddenChars(value: string): boolean {
  return value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value);
}

export function unlockAbsolute(requestUrl: URL): string {
  const target = new URL('/unlock', requestUrl.origin);
  target.searchParams.set('next', requestUrl.pathname + requestUrl.search);
  return target.toString();
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 1) return parts[0] ?? 'unknown';
    // The platform appends the real address. A caller can forge earlier ones.
    if (parts.length > 1) return parts[parts.length - 1] ?? 'unknown';
  }
  const real = request.headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}

export async function inviteCodeMatches(input: string, codes: readonly string[]): Promise<boolean> {
  const trimmed = input.trim();
  if (trimmed.length > MAX_CODE_LENGTH) {
    await sha256('too-long');
    return false;
  }
  const inputHash = await sha256(trimmed);
  const list = codes.length > 0 ? codes : ['\u0000'];
  let matched = 0;
  for (const code of list) {
    const codeHash = await sha256(code);
    matched |= timingSafeEqual(inputHash, codeHash) ? 1 : 0;
  }
  if (!trimmed || codes.length === 0) return false;
  return matched === 1;
}

export async function signInviteCookie(code: string, secret: string, now = Date.now()): Promise<string | null> {
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > MAX_CODE_LENGTH) return null;
  const payload: OkPayload = {
    k: 'ok',
    exp: now + INVITE_MAX_AGE_MS,
    h: toHex(await sha256(trimmed)),
  };
  return signValue(INVITE_COOKIE, payload, secret);
}

export async function verifyInviteCookie(token: string, config: InviteConfig, now = Date.now()): Promise<boolean> {
  if (!config.secret || config.codes.length === 0) return false;
  const data = await openValue(token, INVITE_COOKIE, config.secret);
  if (!isOkPayload(data)) return false;
  if (data.exp <= now || data.exp > now + INVITE_MAX_AGE_MS + EXP_GRACE_MS) return false;
  let matched = 0;
  for (const code of config.codes) {
    const hex = toHex(await sha256(code));
    matched |= timingSafeEqual(utf8(data.h), utf8(hex)) ? 1 : 0;
  }
  return matched === 1;
}

export async function requestHasInvite(request: Request, config: InviteConfig, now = Date.now()): Promise<boolean> {
  if (config.devUnlock) return true;
  if (!config.secret || config.codes.length === 0) return false;
  const token = readCookie(request.headers.get('cookie'), INVITE_COOKIE);
  if (!token) return false;
  return verifyInviteCookie(token, config, now);
}

export async function denyIfLocked(request: Request, dev: boolean, now = Date.now()): Promise<Response | null> {
  const url = new URL(request.url);
  // Public pages must not read the cookie. Prerender reads no request headers.
  if (gateDecision(url.pathname, false) === 'allow') return null;
  const config = currentInviteConfig(dev);
  const unlocked = await requestHasInvite(request, config, now);
  if (unlocked) return null;
  const decision = gateDecision(url.pathname, false);
  const headers = new Headers(PRIVATE_HEADERS);
  if (decision === 'deny') {
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response('This file is shared by invite.', { status: 401, headers });
  }
  headers.set('Location', unlockAbsolute(url));
  return new Response(null, { status: 302, headers });
}

export async function readAttemptAsync(token: string | null, secret: string | null, now: number): Promise<Attempt | null> {
  if (!token || !secret) return null;
  const data = await openValue(token, ATTEMPT_COOKIE, secret);
  if (!isTryPayload(data)) return null;
  if (data.t > now + 60_000) return null;
  if (now - data.t >= ATTEMPT_WINDOW_MS) return null;
  return { count: data.c, windowStart: data.t };
}

export async function signAttempt(attempt: Attempt, secret: string): Promise<string | null> {
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const payload: TryPayload = { k: 'try', c: attempt.count, t: attempt.windowStart };
  return signValue(ATTEMPT_COOKIE, payload, secret);
}

export function nextAttempt(prev: Attempt | null, now: number): Attempt {
  if (!prev || now - prev.windowStart >= ATTEMPT_WINDOW_MS) {
    return { count: 1, windowStart: now };
  }
  return { count: prev.count + 1, windowStart: prev.windowStart };
}

export async function evaluateUnlock(input: {
  code: string | null;
  nextParam: string | null;
  config: InviteConfig;
  attemptToken: string | null;
  ipFailures: number;
  now?: number;
}): Promise<UnlockEvaluation> {
  const now = input.now ?? Date.now();
  const next = safeNext(input.nextParam);
  if (input.code === null) return { kind: 'form', next };

  const attempt = await readAttemptAsync(input.attemptToken, input.config.secret, now);
  const limited = input.ipFailures >= MAX_ATTEMPTS || (attempt?.count ?? 0) >= MAX_ATTEMPTS;
  if (limited) {
    const kept = attempt ?? { count: MAX_ATTEMPTS, windowStart: now };
    const attemptCookie = input.config.secret ? await signAttempt(kept, input.config.secret) : null;
    return { kind: 'bad', next, error: 'rate', delayMs: FAILURE_DELAY_MS, attemptCookie };
  }

  const secret = input.config.secret;
  const matched = secret ? await inviteCodeMatches(input.code, input.config.codes) : await inviteCodeMatches(input.code, []);
  if (matched && secret) {
    const cookie = await signInviteCookie(input.code, secret, now);
    if (cookie) return { kind: 'ok', next, cookie };
  }

  const updated = nextAttempt(attempt, now);
  const attemptCookie = secret ? await signAttempt(updated, secret) : null;
  return { kind: 'bad', next, error: 'mismatch', delayMs: FAILURE_DELAY_MS, attemptCookie };
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; path: string; secure: boolean },
): string {
  const parts = [`${name}=${value}`, `Max-Age=${options.maxAge}`, `Path=${options.path}`, 'SameSite=Lax', 'HttpOnly'];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function redirectResponse(location: string, cookies: string[]): Response {
  const headers = new Headers(PRIVATE_HEADERS);
  headers.set('Location', location);
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ipHits = new Map<string, Attempt>();

export function resetIpFailures(): void {
  ipHits.clear();
}

export function ipFailureCount(ip: string, now = Date.now()): number {
  if (!ip || ip === 'unknown') return 0;
  const prev = ipHits.get(ip);
  if (!prev || now - prev.windowStart >= ATTEMPT_WINDOW_MS) return 0;
  return prev.count;
}

export function rememberIpFailure(ip: string, now = Date.now()): void {
  if (!ip || ip === 'unknown') return;
  ipHits.set(ip, nextAttempt(ipHits.get(ip) ?? null, now));
}

export function clearIpFailures(ip: string): void {
  if (!ip || ip === 'unknown') return;
  ipHits.delete(ip);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return new Uint8Array(digest);
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, utf8(data));
  return new Uint8Array(sig);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function b64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  try {
    const bin = atob(value.replaceAll('-', '+').replaceAll('_', '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function signValue(name: string, payload: OkPayload | TryPayload, secret: string): Promise<string> {
  const body = bytesToB64Url(utf8(JSON.stringify(payload)));
  const sig = bytesToB64Url(await hmacSha256(secret, `v1.${name}.${body}`));
  return `v1.${body}.${sig}`;
}

async function openValue(token: string, name: string, secret: string): Promise<unknown | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const body = parts[1];
  const sig = parts[2];
  if (!body || !sig) return null;
  const expected = await hmacSha256(secret, `v1.${name}.${body}`);
  const actual = b64UrlToBytes(sig);
  if (!actual || !timingSafeEqual(actual, expected)) return null;
  const raw = b64UrlToBytes(body);
  if (!raw) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    return null;
  }
}

function isOkPayload(data: unknown): data is OkPayload {
  if (!data || typeof data !== 'object') return false;
  const record = data as { k?: unknown; exp?: unknown; h?: unknown };
  return record.k === 'ok' && typeof record.exp === 'number' && Number.isFinite(record.exp) && typeof record.h === 'string' && /^[0-9a-f]{64}$/.test(record.h);
}

function isTryPayload(data: unknown): data is TryPayload {
  if (!data || typeof data !== 'object') return false;
  const record = data as { k?: unknown; c?: unknown; t?: unknown };
  return (
    record.k === 'try' &&
    typeof record.c === 'number' &&
    Number.isInteger(record.c) &&
    record.c >= 0 &&
    record.c <= 1000 &&
    typeof record.t === 'number' &&
    Number.isInteger(record.t)
  );
}
