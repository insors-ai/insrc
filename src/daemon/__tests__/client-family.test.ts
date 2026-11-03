/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client identity → model family (Epic ce99b72065d03b1b, Story s3 · t6). A
 * client process forwards only its identity ('claude' / 'codex'); the daemon
 * maps it to the family whose cliKind equals it (familyForClient), in the step
 * host and in one-shot analyze. Client processes never read the registry.
 *
 * The fixture swaps the CLI kinds (cli-claude runs codex, cli-codex runs
 * claude), so a mapping can only have come from the definitions.
 *
 * Run: npx tsx --test src/daemon/__tests__/client-family.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentClientProviderKind } from '../../analyze/context/shaper-provider.js';
import { stepClient, type StepCallContext } from '../../shared/step-context.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import { _setModelCatalogDirForTests } from '../model-catalog.js';
import { familyForClient, getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../model-registry.js';
import { createStepCallHandler, stepToolTable, type StepEnvelope } from '../steps/host.js';
import { runAnalyzeOneShot } from '../steps/analyze-oneshot.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-claude',
	families: [
		{ id: 'cli-claude', cliKind: 'codex', displayName: 'A', models: [{ id: 'a', efforts: [] }], tierDefaults: { core: { model: 'a' }, mid: { model: 'a' }, cheap: { model: 'a' } }, summariserModel: 'a' },
		{ id: 'cli-codex', cliKind: 'claude', displayName: 'B', models: [{ id: 'b', efforts: [] }], tierDefaults: { core: { model: 'b' }, mid: { model: 'b' }, cheap: { model: 'b' } }, summariserModel: 'b' },
		{ id: 'ollama', displayName: 'O', models: [{ id: 'o:1', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'o:1' },
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
	],
};

let dir: string;
before(() => {
	dir = mkdtempSync(join(tmpdir(), 'client-family-'));
	writeFileSync(join(dir, 'cloud-model-catalog.json'), JSON.stringify(FIXTURE));
	_setModelCatalogDirForTests(dir);
	_setApprovedModelsPathForTests(join(dir, 'approved-models.json'));
	_resetModelRegistryForTests();
});
after(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(dir, { recursive: true, force: true });
});

async function collect(params: unknown, table: ReturnType<typeof stepToolTable>): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await createStepCallHandler(table)(params, m => { frames.push(m); }, new AbortController().signal);
	return frames;
}

test("client-family.test.ts: step host and one-shot analyze map client 'claude'/'codex' to the family with that cliKind; an injected clientDefault wins; MCP client detection imports no registry or model-defaults", async () => {
	assert.equal(familyForClient('claude'), 'cli-codex');
	assert.equal(familyForClient('codex'), 'cli-claude');
	assert.equal(familyForClient('vibe'), 'cli-vibe');
	assert.equal(familyForClient(undefined), undefined);

	// The step host: a tool running inside a step call sees the client, and the family it implies.
	const seen: string[] = [];
	const table = {
		...stepToolTable(),
		insrc_triage: async (): Promise<StepEnvelope> => {
			seen.push(`${stepClient()}→${familyForClient(stepClient())}→${currentClientProviderKind()}`);
			return { content: [{ type: 'text', text: '{}' }], isError: false };
		},
	};
	for (const client of ['claude', 'codex', 'vibe'] as const) {
		const ctx: StepCallContext = { cwd: '/caller', client };
		const frames = await collect({ tool: 'insrc_triage', args: {}, context: ctx }, table);
		assert.equal(frames.at(-1)?.stream, 'done', JSON.stringify(frames));
	}
	// The host runs the step in the client provider context of that family.
	assert.deepEqual(seen, ['claude→cli-codex→cli-codex', 'codex→cli-claude→cli-claude', 'vibe→cli-vibe→cli-vibe']);
	// An unknown client identity is refused.
	const refused = await collect({ tool: 'insrc_triage', args: {}, context: { cwd: '/caller', client: 'gemini' } }, table);
	assert.equal(refused.at(-1)?.stream, 'error');
	assert.match(JSON.stringify(refused.at(-1)?.data), /`context.client` must be 'claude', 'codex' or 'vibe'/);

	// One-shot analyze: the run is inside the client provider context of the implied family.
	const runIn = async (ctx: StepCallContext, clientDefault?: 'cli-claude' | 'cli-codex' | 'cli-vibe' | 'ollama'): Promise<string | undefined> => {
		let kind: string | undefined = 'not called';
		const buildRun = (async () => { kind = currentClientProviderKind(); throw new Error('stop'); }) as unknown as NonNullable<Parameters<typeof runAnalyzeOneShot>[1]>['buildRun'];
		const { runInStepContext } = await import('../../shared/step-context.js');
		await assert.rejects(runInStepContext(ctx, () => runAnalyzeOneShot({ repo: '/explicit', focus: 'q' }, { buildRun, ...(clientDefault !== undefined ? { clientDefault } : {}) })), /stop/);
		return kind;
	};
	assert.equal(await runIn({ cwd: '/c', client: 'claude' }), 'cli-codex');
	assert.equal(await runIn({ cwd: '/c', client: 'codex' }), 'cli-claude');
	assert.equal(await runIn({ cwd: '/c', client: 'vibe' }), 'cli-vibe');
	assert.equal(await runIn({ cwd: '/c', client: 'claude' }, 'ollama'), 'ollama', 'an injected clientDefault wins');

	// The MCP server detects the client's identity only: no registry or model-defaults import.
	const server = readFileSync(join(SRC, 'mcp', 'server.ts'), 'utf8');
	assert.doesNotMatch(server, /from '[^']*(model-registry|model-defaults|model-catalog)\.js'/);
	assert.match(server, /function detectClient\(name: string \| undefined\): StepClient \| undefined/);
	assert.match(server, /n\.includes\('vibe'\)\)\s+return 'vibe'/, 'detectClient maps a vibe clientInfo name to the vibe client');
	assert.ok(getModelRegistry().families().length === 5);
});

test('client-family.test.ts: src/mcp/** and src/cli/** do not import getModelRegistry', () => {
	const offenders: string[] = [];
	const walk = (d: string): void => {
		for (const name of readdirSync(d)) {
			const p = join(d, name);
			if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); continue; }
			if (!/\.(ts|tsx|mts)$/.test(name)) continue;
			const src = readFileSync(p, 'utf8');
			// The user's approved-model store is read only through getModelRegistry (k2).
			if (/\bgetModelRegistry\b/.test(src)) offenders.push(relative(SRC, p));
		}
	};
	walk(join(SRC, 'mcp'));
	walk(join(SRC, 'cli'));
	assert.deepEqual(offenders, []);
});
