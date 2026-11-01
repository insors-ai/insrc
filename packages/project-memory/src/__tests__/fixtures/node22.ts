import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/** Gate/tooling may run on a different Node than the package's supported host. */
export function node22(): string {
  const candidates = [process.env['INSRC_MEMORY_NODE22'], process.execPath, '/opt/homebrew/opt/node@22/bin/node', '/usr/local/opt/node@22/bin/node'];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    try { if (execFileSync(candidate, ['-p', 'process.versions.node.split(".")[0]'], { encoding: 'utf8', timeout: 5000 }).trim() === '22') return candidate; } catch { /* Try the next explicit host. */ }
  }
  throw new Error('Node 22 is required; set INSRC_MEMORY_NODE22 to its executable.');
}

export function nativeTest(file: string, name: string, run: (context: TestContext) => unknown | Promise<unknown>): void {
  if (process.versions.node.split('.')[0] === '22') { test(name, run); return; }
  test(name, () => {
    const pattern = '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    const env = { ...process.env };
    delete env['NODE_TEST_CONTEXT'];
    const output = execFileSync(node22(), ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-name-pattern', pattern, fileURLToPath(file)], { env, encoding: 'utf8', timeout: 60_000, maxBuffer: 2_000_000 });
    assert.match(output, /# pass [1-9][0-9]*\b/, 'the supported-runtime child must actually execute a passing test');
  });
}
