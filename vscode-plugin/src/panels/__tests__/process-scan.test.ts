/**
 * Story E20260922401ae5fb:S004 / t6 — parseOrphans() (the default ProcessScan's
 * pure parser). No child process is spawned; the `ps` output is a fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseOrphans } from '../process-scan.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('parseOrphans keeps only insrc daemon/mcp lines, drops self, and captures pid + command', () => {
  const ps = [
    '  101 node /home/u/.insrc/daemon/out/daemon/index.js',
    '  202 node /home/u/project/out/bin/insrc-mcp.js --stdio',
    '  303 node /home/u/some/other/app.js',
    '  404 /usr/bin/vim notes.txt',
    '  505 node out/daemon/index.js', // self
  ].join('\n');
  const orphans = parseOrphans(ps, 505);
  assert.deepEqual(
    orphans,
    [
      { pid: 101, command: 'node /home/u/.insrc/daemon/out/daemon/index.js' },
      { pid: 202, command: 'node /home/u/project/out/bin/insrc-mcp.js --stdio' },
    ],
    'only insrc daemon/mcp candidates, excluding this process',
  );
});

test('parseOrphans ignores blank/malformed lines', () => {
  assert.deepEqual(parseOrphans('\n   \ngarbage without pid\n', 1), []);
});

test('source-scan: process-scan.ts imports no vscode and never kills (read-only ps)', () => {
  const src = readFileSync(join(HERE, '..', 'process-scan.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the scan must not import vscode');
  assert.doesNotMatch(src, /process\.kill|SIGKILL|SIGTERM/, 'the scan is read-only — it never kills (k4 stays s6)');
});
