/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unknown-model check (Epic ce99b72065d03b1b, Story s4): models.check against
 * fake CLI binaries. Each fake reads its behaviour from the JSON file named by
 * FAKE_CLI_CONFIG and appends one line per call (args, stdin, cwd, start, end)
 * to the config's log.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-check.test.ts
 */

import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ModelDefinitionsFile } from '../model-catalog.js';
import { buildModelRegistry, _setApprovedModelsPathForTests } from '../model-registry.js';
import { checkModel, PROBE_PROMPT, _resetModelChecksForTests, type ModelCheckDeps, type ModelCheckResult } from '../model-check.js';

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-claude',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'Claude', models: [{ id: 'claude-a', aliases: ['ca'], efforts: ['high'] }], tierDefaults: { core: { model: 'claude-a' }, mid: { model: 'claude-a' }, cheap: { model: 'claude-a' } }, summariserModel: 'claude-a' },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'Codex', models: [{ id: 'gpt-a', aliases: ['ay'], efforts: ['low'] }], tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-a' } }, summariserModel: 'gpt-a' },
		{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'o:1', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'o:1' },
	],
} as unknown as ModelDefinitionsFile;

const registry = buildModelRegistry(FIXTURE, []);

const FAKE = `#!/usr/bin/env node
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.FAKE_CLI_CONFIG, 'utf8'));
const args = process.argv.slice(2);
let stdin = '';
process.stdin.on('data', d => { stdin += d; });
process.stdin.on('end', async () => {
	const start = Date.now();
	if (cfg.lock) { if (fs.existsSync(cfg.lock)) fs.appendFileSync(cfg.log + '.overlap', 'x'); fs.writeFileSync(cfg.lock, ''); }
	if (!cfg.sleepOn || cfg.sleepOn === args[0]) await new Promise(r => setTimeout(r, cfg.sleepMs || 0));
	if (cfg.lock) fs.rmSync(cfg.lock, { force: true });
	fs.appendFileSync(cfg.log, JSON.stringify({ args, stdin, cwd: process.cwd(), start, end: Date.now() }) + '\\n');
	let out = { exit: 0, stdout: '' };
	if (args[0] === '--version') out = { exit: 0, stdout: cfg.version || 'codex-cli 9.9.9\\n' };
	else if (args[0] === 'debug') out = { exit: cfg.modelsExit || 0, stdout: typeof cfg.models === 'string' ? cfg.models : JSON.stringify(cfg.models) };
	else if (args[0] === 'exec') {
		const m = args[args.indexOf('-m') + 1];
		const e = (cfg.exec || {})[m] || cfg.execDefault;
		out = { exit: e.exit, stdout: e.lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\\n') + '\\n' };
	}
	process.stdout.write(out.stdout);
	process.exitCode = out.exit;
});
`;

const LIST = { models: [
	{ slug: 'gpt-new', display_name: 'New', supported_reasoning_levels: [{ effort: 'low', description: '' }, { effort: 'medium', description: '' }, { effort: 'high', description: '' }] },
] };
const OK_STREAM = { exit: 0, lines: [{ type: 'thread.started' }, { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } }, { type: 'turn.completed' }] };

let dir: string;
let bin: string;
let cwd: string;
let logFile: string;
let storeFile: string;

before(() => {
	dir = mkdtempSync(join(tmpdir(), 'model-check-'));
	bin = join(dir, 'codex');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	cwd = mkdtempSync(join(tmpdir(), 'model-check-cwd-'));
	storeFile = join(dir, 'approved-models.json');
	_setApprovedModelsPathForTests(storeFile);
});
after(() => {
	_setApprovedModelsPathForTests(undefined);
	delete process.env['FAKE_CLI_CONFIG'];
	rmSync(dir, { recursive: true, force: true });
	rmSync(cwd, { recursive: true, force: true });
});
afterEach(() => { _resetModelChecksForTests(); });

let configN = 0;
/** Point the fake at a fresh config; returns the call-log reader. */
function fake(cfg: Record<string, unknown>): () => Array<{ args: string[]; stdin: string; cwd: string; start: number; end: number }> {
	logFile = join(dir, `calls-${++configN}.jsonl`);
	const file = join(dir, `config-${configN}.json`);
	writeFileSync(file, JSON.stringify({ log: logFile, models: LIST, execDefault: OK_STREAM, ...cfg }));
	process.env['FAKE_CLI_CONFIG'] = file;
	return () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
}

const deps = (extra: Partial<ModelCheckDeps> = {}): ModelCheckDeps => ({ registry, bins: { codex: bin }, cwd, timeoutMs: 20_000, ...extra });

async function check(modelId: string, claimedEfforts: unknown, extra: Partial<ModelCheckDeps> = {}): Promise<ModelCheckResult> {
	const r = await checkModel({ family: 'cli-codex', modelId, claimedEfforts }, deps(extra));
	assert.ok('checkId' in r, JSON.stringify(r));
	return r;
}

test('model-check.test.ts: Codex check — efforts from `debug models`, ultra rejected despite a successful run, unlisted model rejects every effort, no inputLimit', async () => {
	const calls = fake({});
	const r = await check('gpt-new', ['high', 'ultra', 'high']);
	assert.equal(r.runs, true);
	assert.equal(r.error, undefined);
	assert.equal(r.inputLimit, undefined);
	assert.deepEqual(r.efforts.map(e => [e.effort, e.verdict]), [['high', 'accepted'], ['ultra', 'rejected']]);
	for (const e of r.efforts) assert.match(e.evidence, /`codex debug models` lists gpt-new with levels: low, medium, high/);
	// The fake's exec succeeds whatever the level: the run is made without any effort and never decides one.
	assert.deepEqual(calls().map(c => c.args[0]), ['--version', 'debug', 'exec']);
	assert.ok(!calls().some(c => c.args.some(a => a.includes('reasoning_effort'))));

	fake({});
	const unlisted = await check('gpt-other', ['low', 'high']);
	assert.equal(unlisted.runs, true);
	assert.deepEqual(unlisted.efforts.map(e => e.verdict), ['rejected', 'rejected']);
	for (const e of unlisted.efforts) assert.equal(e.evidence, "the CLI's model list does not include gpt-other");
});

test("model-check.test.ts: unreachable vs refusing (Codex) — ENOENT and timeout give 'could not be reached', turn.failed gives 'refused the model'", async () => {
	fake({});
	const missing = await check('gpt-new', ['high'], { bins: { codex: join(dir, 'no-such-codex') } });
	assert.equal(missing.runs, false);
	assert.match(missing.error ?? '', /^the codex CLI could not be reached: .*ENOENT/);
	assert.deepEqual(missing.efforts, [{ effort: 'high', verdict: 'rejected', evidence: 'not checked: the CLI could not be reached' }]);

	fake({ sleepOn: 'exec', sleepMs: 5_000 });
	const slow = await check('gpt-new', ['high'], { timeoutMs: 1_000 });
	assert.equal(slow.runs, false);
	assert.equal(slow.error, 'the codex CLI could not be reached: timed out after 1 s');
	assert.equal(slow.efforts[0]?.verdict, 'accepted', 'the model list was read before the run timed out');

	fake({ exec: { 'gpt-gone': { exit: 1, lines: [{ type: 'error', message: 'model_not_found: gpt-gone' }, { type: 'turn.failed', error: { message: 'model_not_found: gpt-gone' } }] } } });
	const refused = await check('gpt-gone', ['high']);
	assert.equal(refused.runs, false);
	assert.equal(refused.error, 'the codex CLI refused the model: model_not_found: gpt-gone');
	assert.equal(refused.efforts[0]?.evidence, "the CLI's model list does not include gpt-gone");

	fake({ exec: { 'gpt-new': { exit: 0, lines: [{ type: 'turn.failed', error: { message: 'quota' } }] } } });
	assert.equal((await check('gpt-new', [])).error, 'the codex CLI refused the model: quota', 'a refusal decides even with exit 0');
});

test("model-check.test.ts: run protocol (Codex) — probe prompt on stdin, temp cwd; no turn.completed or nonzero exit without refusal give 'gave unreadable output'", async () => {
	const calls = fake({});
	await check('gpt-new', []);
	const exec = calls().find(c => c.args[0] === 'exec')!;
	assert.equal(exec.stdin, PROBE_PROMPT);
	assert.deepEqual(exec.args, ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', cwd, '-m', 'gpt-new']);
	for (const c of calls()) assert.equal(realpathSync(c.cwd), realpathSync(cwd));

	fake({ exec: { 'gpt-new': { exit: 0, lines: [{ type: 'thread.started' }, { type: 'item.completed' }] } } });
	const incomplete = await check('gpt-new', []);
	assert.equal(incomplete.runs, false);
	assert.match(incomplete.error ?? '', /^the codex CLI gave unreadable output: exit 0: /);

	fake({ exec: { 'gpt-new': { exit: 1, lines: ['panic: something broke'] } } });
	const crashed = await check('gpt-new', []);
	assert.equal(crashed.runs, false);
	assert.equal(crashed.error, 'the codex CLI gave unreadable output: exit 1: panic: something broke');

	fake({ exec: { 'gpt-new': { exit: 1, lines: [{ type: 'thread.started' }, { type: 'turn.completed' }] } } });
	assert.match((await check('gpt-new', [])).error ?? '', /gave unreadable output: exit 1/, 'turn.completed with a nonzero exit is not a run');
});

test('model-check.test.ts: one at a time — concurrent checks never overlap CLI children; a failing first check does not stop the second', async () => {
	const calls = fake({ sleepMs: 150, lock: join(dir, 'cli.lock') });
	const [a, b] = await Promise.all([check('gpt-new', ['high']), check('gpt-new', ['low'])]);
	assert.equal(a.runs && b.runs, true);
	assert.notEqual(a.checkId, b.checkId);
	assert.equal(existsSync(`${logFile}.overlap`), false, 'a CLI child started while another ran');
	const spans = calls().sort((x, y) => x.start - y.start);
	assert.equal(spans.length, 6);
	for (let i = 1; i < spans.length; i++) assert.ok(spans[i]!.start >= spans[i - 1]!.end, `call ${i} overlaps call ${i - 1}`);

	fake({ sleepMs: 50 });
	const [failed, ok] = await Promise.all([
		check('gpt-new', ['high'], { bins: { codex: join(dir, 'no-such-codex') } }),
		check('gpt-new', ['high']),
	]);
	assert.equal(failed.runs, false);
	assert.equal(ok.runs, true);
});

test('model-check.test.ts: invalid params refused with no CLI call', async () => {
	const seen: string[][] = [];
	const run: NonNullable<ModelCheckDeps['run']> = async (_c, args) => { seen.push([...args]); return { stdout: '', stderr: '', exitCode: 0, timedOut: false, durationMs: 0 }; };
	const cases: Array<[unknown, RegExp]> = [
		[{ family: 'ollama', modelId: 'm', claimedEfforts: [] }, /family must be a CLI family/],
		[{ family: 'cli-gemini', modelId: 'm', claimedEfforts: [] }, /family must be a CLI family/],
		[{ family: 'cli-codex', modelId: '', claimedEfforts: [] }, /modelId must be a non-empty string/],
		[{ family: 'cli-codex', modelId: 7, claimedEfforts: [] }, /modelId must be a non-empty string/],
		[{ family: 'cli-codex', modelId: 'm', claimedEfforts: 'high' }, /claimedEfforts must be an array of non-empty strings/],
		[{ family: 'cli-codex', modelId: 'm', claimedEfforts: [''] }, /claimedEfforts must be an array/],
		[{ family: 'cli-codex', modelId: 'gpt-a', claimedEfforts: [] }, /gpt-a is already a model or alias of cli-codex/],
		[{ family: 'cli-codex', modelId: 'ay', claimedEfforts: [] }, /ay is already a model or alias of cli-codex/],
		[null, /family must be a CLI family/],
	];
	for (const [params, reason] of cases) {
		const r = await checkModel(params, deps({ run }));
		assert.ok('error' in r && !('checkId' in r), JSON.stringify(params));
		assert.match((r as { error: string }).error, /^invalid-params: /);
		assert.match((r as { error: string }).error, reason);
		assert.equal((r as { recoverable: boolean }).recoverable, false);
	}
	assert.deepEqual(seen, []);
});

test('model-check.test.ts: unreadable `codex debug models` with a successful run gives runs:true and every effort rejected', async () => {
	for (const cfg of [{ models: 'not json at all' }, { models: { data: [] } }, { models: LIST, modelsExit: 2 }]) {
		fake(cfg);
		const r = await check('gpt-new', ['high', 'low']);
		assert.equal(r.runs, true, JSON.stringify(cfg));
		assert.deepEqual(r.efforts.map(e => [e.verdict, e.evidence]), [['rejected', "the CLI's model list could not be read"], ['rejected', "the CLI's model list could not be read"]]);
	}
});

test('model-check.test.ts: ModelCheckResult carries exactly the sc4 fields', async () => {
	const allowed = new Set(['checkId', 'family', 'modelId', 'runs', 'inputLimit', 'efforts', 'error']);
	fake({ exec: { 'gpt-gone': { exit: 1, lines: [{ type: 'turn.failed', error: { message: 'no' } }] } } });
	const results = [await check('gpt-new', ['high', 'ultra']), await check('gpt-gone', ['low'])];
	for (const r of results) {
		for (const k of Object.keys(r)) assert.ok(allowed.has(k), `unexpected field ${k}`);
		assert.equal(typeof r.checkId, 'string');
		assert.equal(r.family, 'cli-codex');
		assert.equal(typeof r.runs, 'boolean');
		for (const e of r.efforts) {
			assert.deepEqual(Object.keys(e).sort(), ['effort', 'evidence', 'verdict']);
			assert.ok(['accepted', 'rejected', 'recognised-unconfirmed'].includes(e.verdict));
		}
	}
	assert.equal('error' in results[0]!, false);
	assert.equal(typeof results[1]!.error, 'string');
	// models.check writes nothing: the approved-model store does not exist.
	assert.equal(existsSync(storeFile), false);
});
