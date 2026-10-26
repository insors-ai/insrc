/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The installer's tier block reads the model definitions file (Epic
 * ce99b72065d03b1b, Story s3 · t9): step 4b takes the chosen CLI family's tier
 * defaults and the Ollama tool-loop model from the cloned definitions instead
 * of literals, and both installer copies stay identical.
 *
 * The dry run executes the installer's own step-4b text in bash against a temp
 * checkout holding a fixture definitions file whose defaults differ from the
 * shipped ones, in a temp HOME.
 *
 * Run: npx tsx --test src/config/__tests__/installer-defs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-claude',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'C', models: [{ id: 'claude-q', aliases: ['q'], efforts: ['low'] }, { id: 'claude-r', efforts: [] }],
			tierDefaults: { core: { model: 'q', effort: 'low' }, mid: { model: 'claude-r' }, cheap: { model: 'claude-r' } }, summariserModel: 'claude-r' },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'X', models: [{ id: 'gpt-q', efforts: [] }, { id: 'gpt-r', efforts: [] }],
			tierDefaults: { core: { model: 'gpt-q' }, mid: { model: 'gpt-r' }, cheap: { model: 'gpt-r' } }, summariserModel: 'gpt-r' },
		{ id: 'ollama', displayName: 'O', models: [{ id: 'llama:q', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'llama:q' },
	],
};

/** The installer's step-4b tier-and-config block, as shipped. */
function step4b(): string {
	const script = read('scripts/insrc-daemon-install.sh');
	const start = script.indexOf('# Step 4b: preferred CLI');
	const end = script.indexOf('# Step 5: start');
	assert.ok(start > 0 && end > start, 'the step-4b block is found');
	return script.slice(start, end);
}

function dryRun(cli: 'claude' | 'codex', embedder: 'ollama' | 'onnx', defs: unknown = FIXTURE, expectFail = false): Record<string, any> {
	const dir = mkdtempSync(join(tmpdir(), 'installer-defs-'));
	try {
		const checkout = join(dir, 'daemon');
		mkdirSync(join(checkout, 'src', 'assets', 'models'), { recursive: true });
		writeFileSync(join(checkout, 'src', 'assets', 'models', 'cloud-model-catalog.json'), JSON.stringify(defs));
		const home = join(dir, 'home');
		mkdirSync(home);
		const prelude = 'set -euo pipefail\nlog(){ :; }\nok(){ echo "OK: $*"; }\nwarn(){ :; }\ndie(){ echo "FATAL: $*" >&2; exit "${2:-1}"; }\nC_BOLD=""; C_RESET=""\n';
		const r = spawnSync('bash', ['-c', prelude + step4b()], {
			env: { ...process.env, HOME: home, CONFIG_FILE: join(home, '.insrc', 'config.json'), DAEMON_SRC: checkout, ASSUME_YES: cli === 'claude' ? '1' : '0', RESOLVED_EMBEDDER: embedder },
			input: cli === 'codex' ? 'codex\n' : '',
			encoding: 'utf8', timeout: 60_000,
		});
		if (expectFail) {
			assert.notEqual(r.status, 0, r.stdout);
			assert.match(r.stderr, /no model family in .* runs the claude CLI/);
			assert.equal(existsSync(join(home, '.insrc', 'config.json')), false, 'no config.json is written');
			return {};
		}
		assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
		return JSON.parse(readFileSync(join(home, '.insrc', 'config.json'), 'utf8')) as Record<string, any>;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("installer-defs.test.ts: both installer copies are identical with no tier-model or tool-loop literal; a step-4b dry run writes the file's defaults", () => {
	const script = read('scripts/insrc-daemon-install.sh');
	assert.equal(read('vscode-plugin/assets/insrc-daemon-install.sh'), script);

	// No model id or alias the shipped definitions name for a tier or the tool loop.
	const shipped = JSON.parse(read('src/assets/models/cloud-model-catalog.json')) as typeof FIXTURE;
	const names = new Set<string>();
	for (const f of shipped.families) {
		for (const t of Object.values((f as { tierDefaults?: Record<string, { model: string }> }).tierDefaults ?? {})) names.add(t.model);
		const loop = (f as { toolLoopModel?: string }).toolLoopModel;
		if (loop !== undefined) names.add(loop);
		for (const m of f.models) {
			if (names.has(m.id) || (m.aliases ?? []).some(a => names.has(a))) { names.add(m.id); for (const a of m.aliases ?? []) names.add(a); }
		}
	}
	assert.ok(names.size >= 7);
	for (const name of names) {
		assert.doesNotMatch(script, new RegExp(`["'= ]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["',)]`), `installer names ${name}`);
	}

	// The dry run writes the fixture's defaults for the chosen CLI.
	const claude = dryRun('claude', 'ollama');
	assert.deepEqual(claude['models'].tiers, {
		core:  { runner: 'cli-claude', model: 'q', effort: 'low' },
		mid:   { runner: 'cli-claude', model: 'claude-r' },
		cheap: { runner: 'cli-claude', model: 'claude-r' },
	});
	assert.equal(claude['models'].coreFloor, 'core');
	assert.equal(claude['models'].local.coreModel, 'llama:q');
	assert.equal(claude['models'].local.embeddingModel, 'qwen3-embedding:0.6b');

	const codex = dryRun('codex', 'onnx');
	assert.deepEqual(codex['models'].tiers, {
		core:  { runner: 'cli-codex', model: 'gpt-q' },
		mid:   { runner: 'cli-codex', model: 'gpt-r' },
		cheap: { runner: 'cli-codex', model: 'gpt-r' },
	});
	assert.equal(codex['models'].local.coreModel, 'llama:q');
	assert.equal(codex['models'].local.embeddingModel, 'nomic-ai/nomic-embed-text-v1.5');

	// Two families run the codex CLI: the default family wins, as familyForClient picks it.
	const twoCodex = structuredClone(FIXTURE) as typeof FIXTURE & { defaultFamily: string };
	twoCodex.families[0]!.cliKind = 'codex';
	twoCodex.defaultFamily = 'cli-codex';
	assert.equal(dryRun('codex', 'ollama', twoCodex)['models'].tiers.core.runner, 'cli-codex');
	// No family runs the chosen CLI: the installer stops with an actionable error.
	dryRun('claude', 'ollama', twoCodex, true);
});
