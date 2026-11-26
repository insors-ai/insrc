/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t7: a durable contract check --
 * the deleted app-server transport (src/shared/vibe-session.ts) must never
 * come back, and no production file may import it. A future regression that
 * restores the file or re-adds an import fails this suite immediately.
 *
 * Run: npx tsx --test src/shared/__tests__/no-vibe-session-transport.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** The grep-exhaustive production file enumeration (the LLD's own bundle c2):
 *  every file that imported src/shared/vibe-session.js before this Story. */
const PRODUCTION_FILES = [
	'src/agent/providers/cli-provider.ts',
	'src/agent/providers/structured-output.ts',
	'vscode-plugin/src/chat/vibe-session-process.ts',
	'vscode-plugin/src/chat/cli-adapter.ts',
] as const;

test('src/shared/vibe-session.ts no longer exists', () => {
	assert.equal(existsSync(join(root, 'src/shared/vibe-session.ts')), false);
});

test('no production file imports src/shared/vibe-session.js', () => {
	for (const file of PRODUCTION_FILES) {
		const source = readFileSync(join(root, file), 'utf8');
		assert.doesNotMatch(source, /vibe-session\.js/, `${file} must not import the deleted app-server transport`);
	}
});
