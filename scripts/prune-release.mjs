import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const keep = new Set([
  'latest.yml',
  `poring-gameale-${version}-x64.exe`,
  `poring-gameale-${version}-x64.exe.blockmap`
]);

if (!fs.existsSync(releaseDir)) {
  console.log('release directory does not exist, nothing to prune.');
  process.exit(0);
}

for (const entry of fs.readdirSync(releaseDir)) {
  if (keep.has(entry)) {
    continue;
  }

  const target = path.join(releaseDir, entry);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`removed release/${entry}`);
}

console.log(`release pruned for version ${version}.`);
