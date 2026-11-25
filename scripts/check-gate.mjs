/**
 * Fails the build if a demo or build page was written out as a public file,
 * or if gated wording landed in a public HTML, feed, sitemap, or script.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['.vercel/output/static', 'dist'].filter((dir) => existsSync(dir));
if (roots.length === 0) {
  console.error('check-gate: no build output. Expected dist/ or .vercel/output/static.');
  process.exit(1);
}

const skipDirs = new Set(['functions', 'server', 'node_modules', '.vercel']);
const canaries = [
  'Put the red block in the tray',
  'put the red block in the tray',
  "The hand's first point never moves",
  '课堂通',
  'classlista.com',
  'Prisma 6',
  '/covers/see-think-move.svg',
  '/covers/ask-the-notebook.svg',
  '/covers/follow-the-packet.svg',
  '/covers/classportal-web.svg',
  '.react-flow__',
];

const failures = [];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function isGatedAsset(path) {
  return path.includes('/_astro/gated-') || path.includes('/_astro/gated/') || path.includes('/gated-');
}

function isPublicText(path) {
  return /\.(html|xml|txt|js|mjs|css|svg|json)$/.test(path);
}

for (const root of roots) {
  for (const file of walk(root)) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (/(^|\/)(demos|builds|unlock)(\/|$)/.test(rel) && rel.endsWith('.html')) {
      failures.push(`${root}/${rel} is a static HTML file. Gated pages must be rendered per request.`);
    }
    if (/^covers\/(see-think-move|ask-the-notebook|follow-the-packet|classportal-web)\.svg$/.test(rel)) {
      failures.push(`${root}/${rel} is a public cover. Demo and build covers must not be static files.`);
    }
    if (!isPublicText(file) || isGatedAsset(`/${rel}`)) continue;
    const text = readFileSync(file, 'utf8');
    for (const needle of canaries) {
      if (text.includes(needle)) {
        failures.push(`${root}/${rel} contains gated content (${JSON.stringify(needle)}).`);
      }
    }
    if (/(sitemap|rss)/.test(rel)) {
      if (text.includes('/demos') || text.includes('/builds') || text.includes('/unlock')) {
        failures.push(`${root}/${rel} lists a gated or unlock URL.`);
      }
    }
  }
}

const secret = process.env.INVITE_COOKIE_SECRET;
const codes = process.env.INVITE_CODES;
const secrets = [secret, ...(codes ? codes.split(',') : [])].map((value) => value?.trim()).filter((value) => value && value.length >= 8);
if (secrets.length > 0) {
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = `/${relative(root, file).replaceAll('\\', '/')}`;
      if (!isPublicText(file) || isGatedAsset(rel)) continue;
      const text = readFileSync(file, 'utf8');
      for (const value of secrets) {
        if (text.includes(value)) failures.push(`${root}${rel} contains an invite secret or code.`);
      }
    }
  }
}

const configPath = '.vercel/output/config.json';
if (!existsSync(configPath)) {
  failures.push('Missing .vercel/output/config.json.');
} else {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const route = (config.routes ?? []).find((item) => item.dest === 'gated-asset');
  if (!route?.src?.startsWith('^/_astro/(')) {
    failures.push('Vercel routes must send demo scripts under /_astro to the invite function.');
  }
}

for (const dir of ['.vercel/output/static/_astro', 'dist/client/_astro']) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('BaseLayout.')) {
      failures.push(`${dir}/${name} is still a public file.`);
    }
  }
}

if (failures.length > 0) {
  console.error('check-gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`check-gate: public output looks locked (${roots.join(', ')}).`);
