/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * models.definitions and providers.listModels over a real daemon socket (Epic
 * ce99b72065d03b1b, Story s2 · t3). The real daemon entry starts in a temp home
 * with the shipped definitions asset.
 *
 * Run: npx tsx --test src/daemon/__tests__/models-definitions-daemon.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rpc, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { validateModelCatalog } from '../model-catalog.js';
import type { ModelDefinitionsResult } from '../model-definitions.js';
import type { ModelListResult } from '../list-models.js';

test("models-definitions-daemon.test.ts: a real daemon answers models.definitions with the shipped families and providers.listModels('cli-claude') agrees with it", { timeout: 90_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-models-definitions-'));
	try {
		const daemon = await startDaemon(home);
		try {
			const defs = await rpc(daemon.sock, 'models.definitions') as ModelDefinitionsResult;
			const shipped = validateModelCatalog();
			assert.equal(defs.version, shipped.version);
			assert.equal(defs.defaultFamily, shipped.defaultFamily);
			assert.deepEqual(defs.families.map(f => f.id), ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama', 'ollama-claude']);
			for (const f of shipped.families) {
				assert.deepEqual(defs.families.find(x => x.id === f.id)!.models.map(m => m.id), f.models.map(m => m.id), f.id);
			}

			const list = await rpc(daemon.sock, 'providers.listModels', { provider: 'cli-claude' }) as ModelListResult;
			assert.equal(list.available, true);
			const claude = defs.families.find(f => f.id === 'cli-claude')!;
			assert.deepEqual(list.models, claude.models.map(m => (m.displayName !== undefined ? { id: m.id, displayName: m.displayName } : { id: m.id })));
			assert.ok(list.models.length > 0);
		} finally {
			await daemon.stop();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
