// Runs every *.test.js below a directory with the Node test runner.
// Usage: node scripts/run-tests.js <dir> [extra node flags, e.g. --experimental-test-coverage]
//
// Needed because `node --test <dir>` only works up to Node 20 and `node --test "<glob>"` only from Node 21 on.
// Explicit file paths work on every version.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node scripts/run-tests.js <dir> [node flags]');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const files = readdirSync(join(root, dir), { recursive: true })
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => relative(root, join(root, dir, f)).replaceAll('\\', '/'))
  .sort();

if (files.length === 0) {
  console.error(`No *.test.js files found in ${dir}/`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...flags, ...files], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
