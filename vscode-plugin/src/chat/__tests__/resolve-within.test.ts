/**
 * Epic babd84c6e2fb480a Story S001 t2: resolveWithin, the containment check shared by the
 * companion reader and the clicked-code-reference opener.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWithin } from '../companion-reader.js';

test('resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-within-'));
  const outside = mkdtempSync(join(tmpdir(), 'insrc-within-out-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'foo.ts'), 'x');
    writeFileSync(join(outside, 'secret.ts'), 'secret');
    mkdirSync(join(root, 'src', 'dir.ts'));

    // A file under the root answers its real path, with any extension.
    assert.equal(await resolveWithin(root, 'src/foo.ts'), realpathSync(join(root, 'src', 'foo.ts')));
    assert.equal(await resolveWithin(root, 'src/../src/foo.ts'), realpathSync(join(root, 'src', 'foo.ts')), 'a path that stays inside is fine');

    // '..' that leaves the root, and an absolute path (even one inside the root).
    assert.equal(await resolveWithin(root, '../' + outside.split('/').pop() + '/secret.ts'), undefined);
    assert.equal(await resolveWithin(root, 'src/../../x'), undefined);
    assert.equal(await resolveWithin(root, join(outside, 'secret.ts')), undefined);
    assert.equal(await resolveWithin(root, join(root, 'src', 'foo.ts')), undefined);

    // A symlink inside the root that points outside it.
    symlinkSync(join(outside, 'secret.ts'), join(root, 'src', 'leak.ts'));
    assert.equal(await resolveWithin(root, 'src/leak.ts'), undefined);
    symlinkSync(outside, join(root, 'out'));
    assert.equal(await resolveWithin(root, 'out/secret.ts'), undefined);

    // Missing, not a file, empty, not a string, and a missing root: undefined, never a throw.
    assert.equal(await resolveWithin(root, 'src/missing.ts'), undefined);
    assert.equal(await resolveWithin(root, 'src/dir.ts'), undefined);
    assert.equal(await resolveWithin(root, ''), undefined);
    assert.equal(await resolveWithin(root, 7 as unknown as string), undefined);
    assert.equal(await resolveWithin(join(root, 'nope'), 'src/foo.ts'), undefined);

    // A narrower container: the file must be inside it, not just inside the root.
    assert.equal(await resolveWithin(root, 'src/foo.ts', undefined, join(root, 'docs')), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
