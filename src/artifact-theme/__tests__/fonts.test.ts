/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Task t1 — Poppins packaged as offline assets (Story E20261030486751c3:S001).
 * The woff2 files must exist under src/assets/fonts/poppins with the OFL note,
 * carry the wOF2 magic, and ship to out/assets via copy-assets.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, '..', '..', 'assets', 'fonts', 'poppins');

test('fonts.test.ts: Poppins 400/600/700 woff2 exist with the OFL license note and valid wOF2 magic', () => {
  for (const w of ['400', '600', '700'] as const) {
    const f = join(FONT_DIR, `poppins-${w}.woff2`);
    assert.ok(existsSync(f), `${f} exists`);
    const buf = readFileSync(f);
    assert.ok(buf.length > 1000, `${f} is non-trivial (${buf.length} bytes)`);
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', `${f} has the wOF2 magic`);
  }
  const ofl = join(FONT_DIR, 'OFL.txt');
  assert.ok(existsSync(ofl), 'OFL.txt present');
  assert.match(readFileSync(ofl, 'utf8'), /SIL Open Font License, Version 1\.1/);
});

test('fonts.test.ts: copy-assets ships the fonts to out/assets/fonts (checked against the repo-root out/ tree)', () => {
  // src/artifact-theme/__tests__ -> repo root is ../../.. ; the compiled module at
  // out/artifact-theme/__tests__ resolves ../../assets the same way, so the
  // acceptance check is the out/ mirror produced by copy-assets.mjs.
  const repoRoot = join(HERE, '..', '..', '..');
  for (const w of ['400', '600', '700'] as const) {
    const shipped = join(repoRoot, 'out', 'assets', 'fonts', 'poppins', `poppins-${w}.woff2`);
    assert.ok(existsSync(shipped), `out/ mirror exists after build: ${shipped}`);
    assert.equal(statSync(shipped).size, statSync(join(FONT_DIR, `poppins-${w}.woff2`)).size, `same bytes for weight ${w}`);
  }
});
