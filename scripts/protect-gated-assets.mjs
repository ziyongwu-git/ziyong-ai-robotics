/**
 * Moves demo scripts out of the public file set and serves them from a
 * function that checks the invite cookie first.
 *
 * Astro's adapter does not run Routing Middleware for files under /_astro.
 * Leaving those files in the static folder would make the widget code
 * downloadable by URL.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDirs = [join(root, 'dist/client/_astro'), join(root, '.vercel/output/static/_astro')].filter(Boolean);
const configPath = join(root, '.vercel/output/config.json');
const funcDir = join(root, '.vercel/output/functions/gated-asset.func');
const assetDir = join(funcDir, 'assets');

function isPublicStylesheet(name) {
  return name.startsWith('BaseLayout.');
}

const names = new Set();
for (const dir of staticDirs) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    if (!isPublicStylesheet(name)) names.add(name);
  }
}

await mkdir(assetDir, { recursive: true });
for (const name of names) {
  let copied = false;
  for (const dir of staticDirs) {
    try {
      await cp(join(dir, name), join(assetDir, name));
      copied = true;
      break;
    } catch {
      /* This output folder may not contain the file. Try the next one. */
    }
  }
  if (!copied) throw new Error(`Could not copy demo asset ${name}.`);
}

for (const dir of staticDirs) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    if (!isPublicStylesheet(name)) await rm(join(dir, name));
  }
}

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'scripts/gated-asset-entry.ts')],
  outfile: join(funcDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  legalComments: 'none',
});

await writeFile(join(funcDir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
await writeFile(
  join(funcDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
    },
    null,
    2,
  ) + '\n',
);

const config = JSON.parse(await readFile(configPath, 'utf8'));
config.routes = (config.routes ?? []).filter((item) => item.dest !== 'gated-asset');
if (names.size > 0) {
  const escaped = [...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const route = {
    src: `^/_astro/(${escaped.join('|')})$`,
    dest: 'gated-asset',
  };
  const filesystem = config.routes.findIndex((item) => item.handle === 'filesystem');
  const insertAt = filesystem === -1 ? config.routes.length : filesystem + 1;
  config.routes.splice(insertAt, 0, route);
}
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

console.log(`protect-gated-assets: moved ${names.size} demo file(s) behind the invite check.`);
