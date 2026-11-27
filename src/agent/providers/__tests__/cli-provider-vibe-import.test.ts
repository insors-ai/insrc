/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t4 (updated by s1/t5): cli-provider.ts
 * imports VibeCatalogModel/VibeTurnError from the adapter module. t4 left
 * openVerifiedVibeSession/runVerifiedVibeTurn/vibeAssistantOutput on
 * vibe-session.js pending t5's call-site rewrite; t5 deleted runVibe (their only
 * caller), so no vibe-session.js import remains in this file at all.
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
	assert.match(source, /import \{ createVibeAdapter, qualifyReadOnlyCapability, VibeTurnError, type VibeCatalogModel, type VibeTurnRequest, type VibeTurnResult \} from '\.\.\/\.\.\/shared\/vibe-adapter\.js';/);
	assert.doesNotMatch(source, /vibe-session\.js/);
});
