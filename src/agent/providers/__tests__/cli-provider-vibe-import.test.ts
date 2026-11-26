/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t4: cli-provider.ts imports
 * VibeCatalogModel/VibeTurnError from the adapter module (openVerifiedVibeSession /
 * runVerifiedVibeTurn / vibeAssistantOutput stay on vibe-session.js until t5 rewires
 * the call sites -- this Task's own scope is the two named imports only).
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-provider-vibe-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'cli-provider.ts'), 'utf8');

test('cli-provider.ts imports VibeCatalogModel/VibeTurnError from the adapter module with no behavior change at this step', () => {
	assert.match(source, /import \{ VibeTurnError, type VibeCatalogModel \} from '\.\.\/\.\.\/shared\/vibe-adapter\.js';/);
	assert.match(source, /import \{ openVerifiedVibeSession, runVerifiedVibeTurn, vibeAssistantOutput \} from '\.\.\/\.\.\/shared\/vibe-session\.js';/);
});
