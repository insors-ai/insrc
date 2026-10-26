/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('types preserve HLD contracts and reject invalid v1 payloads', () => {
  const fixture = fileURLToPath(new URL('./fixtures/types-contract.ts', import.meta.url));
  const output = execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'), '--noEmit', '--strict',
    '--exactOptionalPropertyTypes', '--noUncheckedIndexedAccess', '--skipLibCheck',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022',
    '--types', 'node', '--pretty', 'false', fixture,
  ], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(output, '');
});
