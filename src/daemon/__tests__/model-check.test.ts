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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setModelCatalogDirForTests, type ModelDefinitionsFile } from '../model-catalog.js';
import { buildModelRegistry, getModelRegistry, profileProblem, _resetModelRegistryForTests, _setApprovedModelsPathForTests, type ApprovedProfile } from '../model-registry.js';
import { approveCheck, checkModel, rejectCheck, PROBE_PROMPT, _resetModelChecksForTests, type DecisionResult, type ModelCheckDeps, type ModelCheckResult } from '../model-check.js';

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-claude',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'Claude', models: [{ id: 'claude-a', aliases: ['ca'], efforts: ['high'] }], tierDefaults: { core: { model: 'claude-a' }, mid: { model: 'claude-a' }, cheap: { model: 'claude-a' } }, summariserModel: 'claude-a' },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'Codex', models: [{ id: 'gpt-a', aliases: ['ay'], efforts: ['low'] }], tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-a' } }, summariserModel: 'gpt-a' },
		{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'o:1', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'o:1' },
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: [], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['high'] }], tierDefaults: { core: { model: 'vibe-a' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' },
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

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.FAKE_CLI_CONFIG, 'utf8'));
const args = process.argv.slice(2);
let stdin = '';
process.stdin.on('data', d => { stdin += d; });
process.stdin.on('end', () => {
	fs.appendFileSync(cfg.log, JSON.stringify({ args, stdin, cwd: process.cwd(), start: Date.now(), end: Date.now() }) + '\\n');
	let out = { exit: 0, stdout: '' };
	if (args[0] === '--version') out = { exit: 0, stdout: '2.1.310 (Claude Code)\\n' };
	else if (args[0] === '--help') out = { exit: cfg.helpExit || 0, stdout: cfg.help };
	else if (args[0] === '--print') {
		const m = args[args.indexOf('--model') + 1];
		out = (cfg.run || {})[m] || cfg.runDefault;
	}
	process.stdout.write(out.stdout);
	process.exitCode = out.exit;
});
`;

const HELP = 'Usage: claude [options] [command] [prompt]\n\nOptions:\n  --model <model>   Model for the current session\n  --effort <level>  Effort level for the current session (low, medium, high, xhigh, max)\n  -h, --help        Display help\n';
const envelope = (extra: Record<string, unknown> = {}): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'OK', modelUsage: { 'claude-new-1': { contextWindow: 200000 } }, ...extra });

const LIST = { models: [
	{ slug: 'gpt-new', display_name: 'New', supported_reasoning_levels: [{ effort: 'low', description: '' }, { effort: 'medium', description: '' }, { effort: 'high', description: '' }] },
] };
const OK_STREAM = { exit: 0, lines: [{ type: 'thread.started' }, { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } }, { type: 'turn.completed' }] };

let dir: string;
let bin: string;
let claudeBin: string;
let cwd: string;
let logFile: string;
let storeFile: string;

before(() => {
	dir = mkdtempSync(join(tmpdir(), 'model-check-'));
	bin = join(dir, 'codex');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	claudeBin = join(dir, 'claude');
	writeFileSync(claudeBin, FAKE_CLAUDE);
	chmodSync(claudeBin, 0o755);
	cwd = mkdtempSync(join(tmpdir(), 'model-check-cwd-'));
	storeFile = join(dir, 'approved-models.json');
	_setApprovedModelsPathForTests(storeFile);
	const catalogDir = join(dir, 'definitions');
	mkdirSync(catalogDir);
	writeFileSync(join(catalogDir, 'cloud-model-catalog.json'), JSON.stringify(FIXTURE));
	_setModelCatalogDirForTests(catalogDir);
});
after(() => {
	_setApprovedModelsPathForTests(undefined);
	_setModelCatalogDirForTests(undefined);
	_resetModelRegistryForTests();
	delete process.env['FAKE_CLI_CONFIG'];
	rmSync(dir, { recursive: true, force: true });
	rmSync(cwd, { recursive: true, force: true });
});
afterEach(() => {
	_resetModelChecksForTests();
	rmSync(storeFile, { force: true });
	rmSync(`${storeFile}.tmp`, { force: true });
});

let configN = 0;
/** Point the fake at a fresh config; returns the call-log reader. */
function fake(cfg: Record<string, unknown>): () => Array<{ args: string[]; stdin: string; cwd: string; start: number; end: number }> {
	logFile = join(dir, `calls-${++configN}.jsonl`);
	const file = join(dir, `config-${configN}.json`);
	writeFileSync(file, JSON.stringify({ log: logFile, models: LIST, execDefault: OK_STREAM, help: HELP, runDefault: { exit: 0, stdout: envelope() }, ...cfg }));
	process.env['FAKE_CLI_CONFIG'] = file;
	return () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
}

const deps = (extra: Partial<ModelCheckDeps> = {}): ModelCheckDeps => ({ registry, bins: { codex: bin, claude: claudeBin }, cwd, timeoutMs: 20_000, storePath: storeFile, ...extra });

async function check(modelId: string, claimedEfforts: unknown, extra: Partial<ModelCheckDeps> = {}, family = 'cli-codex'): Promise<ModelCheckResult> {
	const r = await checkModel({ family, modelId, claimedEfforts }, deps(extra));
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

	fake({ exec: { 'gpt-new': { exit: 0, lines: [{ type: 'thread.started' }, '{"type": "item.compl', { type: 'turn.completed' }] } } });
	assert.match((await check('gpt-new', [])).error ?? '', /gave unreadable output: exit 0/, 'a malformed line beside turn.completed is not a run');

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
		[{ family: 'ollama', modelId: 'm', claimedEfforts: [] }, /family must be a vendor CLI family/],
		[{ family: 'cli-gemini', modelId: 'm', claimedEfforts: [] }, /family must be a vendor CLI family/],
		[{ family: 'cli-codex', modelId: '', claimedEfforts: [] }, /modelId must be a non-empty string/],
		[{ family: 'cli-codex', modelId: 7, claimedEfforts: [] }, /modelId must be a non-empty string/],
		[{ family: 'cli-codex', modelId: 'm', claimedEfforts: 'high' }, /claimedEfforts must be an array of non-empty strings/],
		[{ family: 'cli-codex', modelId: 'm', claimedEfforts: [''] }, /claimedEfforts must be an array/],
		[{ family: 'cli-codex', modelId: 'gpt-a', claimedEfforts: [] }, /gpt-a is already a model or alias of cli-codex/],
		[{ family: 'cli-codex', modelId: 'ay', claimedEfforts: [] }, /ay is already a model or alias of cli-codex/],
		[null, /family must be a vendor CLI family/],
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

test('model-check.test.ts: the unknown-model check refuses a host family', async () => {
	const seen: string[][] = [];
	const run: NonNullable<ModelCheckDeps['run']> = async (_c, args) => { seen.push([...args]); return { stdout: '', stderr: '', exitCode: 0, timedOut: false, durationMs: 0 }; };
	// ollama-claude runs the claude CLI, but only the models it declares: no check of an unlisted id.
	assert.equal(registry.cliKind('ollama-claude'), 'claude');
	for (const modelId of ['kimi-k9:cloud', 'claude-new-1']) {
		const r = await checkModel({ family: 'ollama-claude', modelId, claimedEfforts: [] }, deps({ run }));
		assert.deepEqual(r, { error: 'invalid-params: family must be a vendor CLI family of the model definitions', recoverable: false }, modelId);
	}
	assert.deepEqual(seen, [], 'no CLI call');
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

const claude = (modelId: string, claimedEfforts: unknown, extra: Partial<ModelCheckDeps> = {}): Promise<ModelCheckResult> => check(modelId, claimedEfforts, extra, 'cli-claude');

test('model-check.test.ts: Claude check — recognised-unconfirmed / rejected, never accepted; inputLimit from modelUsage including the alias-vs-canonical key and ambiguous cases', async () => {
	const calls = fake({});
	const r = await claude('claude-new-1', ['xhigh', 'ultra', 'low']);
	assert.equal(r.runs, true);
	assert.equal(r.error, undefined);
	assert.deepEqual(r.inputLimit, { unit: 'tokens', max: 200000 });
	assert.deepEqual(r.efforts.map(e => [e.effort, e.verdict]), [['xhigh', 'recognised-unconfirmed'], ['ultra', 'rejected'], ['low', 'recognised-unconfirmed']]);
	assert.ok(!r.efforts.some(e => e.verdict === 'accepted'), 'no Claude effort is ever accepted');
	assert.equal(r.efforts[0]!.evidence, '`claude --help` lists --effort values: low, medium, high, xhigh, max; no Claude CLI output shows whether claude-new-1 supports xhigh, so only your approval admits it');
	assert.equal(r.efforts[1]!.evidence, '`claude --help` lists --effort values: low, medium, high, xhigh, max; ultra is not one of them');
	assert.deepEqual(calls().map(c => c.args[0]), ['--version', '--help', '--print']);

	// An alias is answered under the canonical id: the single entry is used whatever its key.
	fake({ run: { haiku: { exit: 0, stdout: envelope({ modelUsage: { 'claude-haiku-5-5': { contextWindow: 1000000 } } }) } } });
	const alias = await claude('haiku', ['high']);
	assert.deepEqual(alias.inputLimit, { unit: 'tokens', max: 1000000 });
	assert.match(alias.efforts[0]!.evidence, /; the CLI ran haiku as claude-haiku-5-5$/, 'the evidence names the model the CLI actually ran');
	assert.ok(!r.efforts[0]!.evidence.includes('the CLI ran'), 'no note when the CLI ran the requested id');

	// Several entries: only the one keyed by the requested id counts.
	fake({ run: { 'claude-new-1': { exit: 0, stdout: envelope({ modelUsage: { 'claude-new-1': { contextWindow: 300000 }, 'claude-helper': { contextWindow: 100000 } } }) } } });
	assert.deepEqual((await claude('claude-new-1', [])).inputLimit, { unit: 'tokens', max: 300000 });
	fake({ run: { haiku: { exit: 0, stdout: envelope({ modelUsage: { 'claude-haiku-5-5': { contextWindow: 1000000 }, 'claude-helper': { contextWindow: 100000 } } }) } } });
	const ambiguous = await claude('haiku', []);
	assert.equal(ambiguous.runs, true);
	assert.equal(ambiguous.inputLimit, undefined);

	// A stray non-object entry still makes an alias's usage ambiguous.
	fake({ run: { haiku: { exit: 0, stdout: envelope({ modelUsage: { 'claude-haiku-5-5': { contextWindow: 1000000 }, 'claude-helper': null } }) } } });
	assert.equal((await claude('haiku', [])).inputLimit, undefined);

	for (const modelUsage of [undefined, {}, { 'claude-new-1': {} }, { 'claude-new-1': { contextWindow: 0 } }, { 'claude-new-1': null }]) {
		fake({ run: { 'claude-new-1': { exit: 0, stdout: envelope({ modelUsage }) } } });
		const r2 = await claude('claude-new-1', []);
		assert.equal(r2.runs, true, JSON.stringify(modelUsage));
		assert.equal(r2.inputLimit, undefined, JSON.stringify(modelUsage));
	}

	// The real help wraps the value list onto the description's next line.
	fake({ help: 'Options:\n  --effort <level>                      Effort level for the current session\n                                        (low, medium, high, xhigh, max)\n  --environment <id>   Create a session (in the cloud)\n' });
	assert.deepEqual((await claude('claude-new-1', ['xhigh', 'ultra'])).efforts.map(e => e.verdict), ['recognised-unconfirmed', 'rejected']);

	// A notice line before the envelope does not hide it.
	fake({ run: { 'claude-new-1': { exit: 0, stdout: `[claude-code:notice] something\n${envelope()}\n` } } });
	assert.equal((await claude('claude-new-1', [])).runs, true);
});

test("model-check.test.ts: run protocol (Claude) — is_error with exit 1 refuses; subtype error_max_turns and exit 1 with a success envelope give 'gave unreadable output'", async () => {
	const calls = fake({});
	await claude('claude-new-1', []);
	const run = calls().find(c => c.args[0] === '--print')!;
	assert.deepEqual(run.args, ['--print', '--output-format', 'json', '--model', 'claude-new-1']);
	assert.equal(run.stdin, PROBE_PROMPT);
	for (const c of calls()) assert.equal(realpathSync(c.cwd), realpathSync(cwd));

	fake({ run: { 'claude-gone': { exit: 1, stdout: `[claude-code:unrecognized_model]\n${JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 404, result: 'There is an issue with the selected model (claude-gone).' })}\n` } } });
	const refused = await claude('claude-gone', ['high']);
	assert.equal(refused.runs, false);
	assert.equal(refused.error, 'the claude CLI refused the model: There is an issue with the selected model (claude-gone).');
	assert.equal(refused.efforts[0]?.verdict, 'recognised-unconfirmed', 'effort verdicts are still reported');

	fake({ run: { 'claude-new-1': { exit: 0, stdout: envelope({ subtype: 'error_max_turns' }) } } });
	const maxTurns = await claude('claude-new-1', []);
	assert.equal(maxTurns.runs, false);
	assert.match(maxTurns.error ?? '', /^the claude CLI gave unreadable output: exit 0: /);

	fake({ run: { 'claude-new-1': { exit: 1, stdout: envelope() } } });
	const exit1 = await claude('claude-new-1', []);
	assert.equal(exit1.runs, false);
	assert.match(exit1.error ?? '', /^the claude CLI gave unreadable output: exit 1: /);

	fake({ run: { 'claude-new-1': { exit: 0, stdout: envelope({ result: '' }) } } });
	assert.match((await claude('claude-new-1', [])).error ?? '', /gave unreadable output/, 'an empty result is not a completed run');

	// Several envelopes are ambiguous: a refusal in any of them refuses, otherwise the output is unreadable.
	fake({ run: { 'claude-new-1': { exit: 0, stdout: `${JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'model not available' })}\n${envelope()}\n` } } });
	assert.equal((await claude('claude-new-1', [])).error, 'the claude CLI refused the model: model not available');
	fake({ run: { 'claude-new-1': { exit: 0, stdout: `${envelope()}\n${envelope()}\n` } } });
	const twice = await claude('claude-new-1', []);
	assert.equal(twice.runs, false);
	assert.match(twice.error ?? '', /gave unreadable output/);

	fake({ run: { 'claude-new-1': { exit: 0, stdout: 'not json' } } });
	assert.match((await claude('claude-new-1', [])).error ?? '', /gave unreadable output: exit 0: not json/);

	fake({});
	const missing = await claude('claude-new-1', ['high'], { bins: { claude: join(dir, 'no-such-claude') } });
	assert.match(missing.error ?? '', /^the claude CLI could not be reached: .*ENOENT/);
});

test('model-check.test.ts: unreadable `claude --help` with a successful run gives runs:true and every effort rejected', async () => {
	const listOfNextOption = 'Options:\n  --effort <level>   Effort level\n  --mode <m>         Mode (fast, slow)\n';
	for (const cfg of [{ help: 'Usage: claude [options]\n  --model <model>\n' }, { help: HELP, helpExit: 1 }, { help: '' }, { help: listOfNextOption }]) {
		fake(cfg);
		const r = await claude('claude-new-1', ['high', 'max']);
		assert.equal(r.runs, true, JSON.stringify(cfg));
		assert.deepEqual(r.efforts.map(e => [e.verdict, e.evidence]), [['rejected', "the CLI's --effort values could not be read"], ['rejected', "the CLI's --effort values could not be read"]]);
	}
});

// ── decisions ───────────────────────────────────────────────────────────────

const storeDoc = (): { version: number; profiles: ApprovedProfile[] } => JSON.parse(readFileSync(storeFile, 'utf8'));

/** A run stub answering like the fake codex, without spawning. */
const stubRun: NonNullable<ModelCheckDeps['run']> = async (_c, args) => ({
	stdout: args[0] === '--version' ? 'codex-cli 9.9.9\n' : args[0] === 'debug' ? JSON.stringify(LIST) : OK_STREAM.lines.map(l => JSON.stringify(l)).join('\n'),
	stderr: '', exitCode: 0, timedOut: false, durationMs: 0,
});

test('model-check.test.ts: decisions — guards, approved/rejected profiles, consumed and evicted checks', async () => {
	fake({ exec: { 'gpt-gone': { exit: 1, lines: [{ type: 'turn.failed', error: { message: 'model_not_found' } }] } } });
	assert.deepEqual(await approveCheck({ checkId: 'nope', efforts: [] }, deps()), { ok: false, reason: 'unknown-check', detail: 'no pending check nope; run models.check again' });
	assert.equal((await rejectCheck({}, deps()) as { reason: string }).reason, 'unknown-check');

	const r = await check('gpt-new', ['high', 'ultra']);
	const refusedEfforts: Array<[unknown, RegExp]> = [
		[['ultra'], /ultra was rejected: `codex debug models` lists gpt-new/],
		[['medium'], /medium was not claimed in check/],
		['high', /efforts must be an array/],
		[[1], /efforts must be an array/],
		[undefined, /efforts must be an array/],
	];
	for (const [efforts, detail] of refusedEfforts) {
		const d = await approveCheck({ checkId: r.checkId, efforts }, deps());
		assert.equal(d.ok, false);
		assert.equal((d as { reason: string }).reason, 'invalid-efforts', JSON.stringify(efforts));
		assert.match((d as { detail: string }).detail, detail);
	}
	assert.equal(existsSync(storeFile), false, 'refused decisions write nothing');

	const gone = await check('gpt-gone', ['high']);
	assert.deepEqual(await approveCheck({ checkId: gone.checkId, efforts: [] }, deps()), { ok: false, reason: 'model-did-not-run', detail: 'the codex CLI refused the model: model_not_found' });
	assert.equal(existsSync(storeFile), false);

	assert.deepEqual(await approveCheck({ checkId: r.checkId, efforts: ['high', 'high'] }, deps()), { ok: true, restartRequired: true });
	const approved = storeDoc().profiles[0]!;
	assert.deepEqual({ ...approved, decidedAt: '' }, { family: 'cli-codex', modelId: 'gpt-new', status: 'approved', efforts: ['high'], decidedAt: '', cliVersion: 'codex-cli 9.9.9' });
	assert.ok(!Number.isNaN(Date.parse(approved.decidedAt)));
	assert.equal((await approveCheck({ checkId: r.checkId, efforts: ['high'] }, deps()) as { reason: string }).reason, 'unknown-check', 'a decided check is consumed');

	// A check whose model did not run can still be rejected.
	assert.deepEqual(await rejectCheck({ checkId: gone.checkId }, deps()), { ok: true, restartRequired: true });
	assert.deepEqual({ ...storeDoc().profiles[1]!, decidedAt: '' }, { family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '', cliVersion: 'codex-cli 9.9.9' });
	assert.equal((await rejectCheck({ checkId: gone.checkId }, deps()) as { reason: string }).reason, 'unknown-check');

	// A Claude approval carries the check's input limit and CLI version.
	fake({});
	const c = await check('claude-new-1', ['xhigh', 'ultra'], {}, 'cli-claude');
	assert.equal((await approveCheck({ checkId: c.checkId, efforts: ['ultra'] }, deps()) as { reason: string }).reason, 'invalid-efforts');
	assert.deepEqual(await approveCheck({ checkId: c.checkId, efforts: ['xhigh'] }, deps()), { ok: true, restartRequired: true });
	assert.deepEqual({ ...storeDoc().profiles[2]!, decidedAt: '' }, { family: 'cli-claude', modelId: 'claude-new-1', status: 'approved', efforts: ['xhigh'], inputLimit: { unit: 'tokens', max: 200000 }, decidedAt: '', cliVersion: '2.1.310 (Claude Code)' });

	// The 33rd check evicts the oldest.
	const ids: string[] = [];
	for (let i = 0; i < 33; i++) ids.push((await check(`gpt-n${i}`, [], { run: stubRun })).checkId);
	assert.equal((await rejectCheck({ checkId: ids[0] }, deps()) as { reason: string }).reason, 'unknown-check');
	assert.deepEqual(await rejectCheck({ checkId: ids[1] }, deps()), { ok: true, restartRequired: true });
	assert.deepEqual(await rejectCheck({ checkId: ids[32] }, deps()), { ok: true, restartRequired: true });
});

test('model-check.test.ts: store write — created, appended verbatim, write-failed for malformed / versionless / string / version-2 stores and a failing rename', async () => {
	// A missing store and directory are created.
	const nested = join(dir, 'home', '.insrc', 'approved-models.json');
	const a = await check('gpt-a1', [], { run: stubRun });
	assert.deepEqual(await rejectCheck({ checkId: a.checkId }, deps({ storePath: nested })), { ok: true, restartRequired: true });
	assert.equal(JSON.parse(readFileSync(nested, 'utf8')).profiles.length, 1);
	assert.equal(existsSync(`${nested}.tmp`), false);
	rmSync(join(dir, 'home'), { recursive: true, force: true });

	// Existing entries, including ones the reader skips, and other top-level keys are kept.
	const existing = { version: 1, note: 'kept', profiles: [
		{ family: 'cli-codex', modelId: 'gpt-old', status: 'approved', efforts: ['low'], decidedAt: '2026-01-01T00:00:00Z', cliVersion: '1' },
		{ family: 'cli-codex', modelId: '', status: 'bogus' },
		'not even an object',
	] };
	writeFileSync(storeFile, JSON.stringify(existing));
	const b = await check('gpt-b1', [], { run: stubRun });
	assert.equal((await approveCheck({ checkId: b.checkId, efforts: [] }, deps())).ok, true);
	const after = storeDoc() as unknown as typeof existing;
	assert.equal(after.note, 'kept');
	assert.deepEqual(after.profiles.slice(0, 3), existing.profiles);
	assert.equal((after.profiles[3] as unknown as ApprovedProfile).modelId, 'gpt-b1');

	// Stores that are not { version: 1, profiles[] } are never overwritten; the check stays pending.
	const bad: Array<[string, RegExp]> = [
		['not json', /is not a \{ version, profiles\[\] \} document/],
		['{"version":1,"profiles":{}}', /is not a \{ version, profiles\[\] \} document/],
		['{"profiles":[]}', /unsupported version null/],
		['{"version":"broken","profiles":[]}', /unsupported version "broken"/],
		['{"version":2,"profiles":[]}', /unsupported version 2/],
	];
	const c = await check('gpt-c1', [], { run: stubRun });
	for (const [bytes, reason] of bad) {
		writeFileSync(storeFile, bytes);
		const d = await approveCheck({ checkId: c.checkId, efforts: [] }, deps());
		assert.equal((d as { reason: string }).reason, 'write-failed', bytes);
		assert.match((d as { detail: string }).detail, reason);
		assert.equal(readFileSync(storeFile, 'utf8'), bytes, 'previous bytes unchanged');
		assert.equal(existsSync(`${storeFile}.tmp`), false);
	}

	// A failing rename leaves the previous bytes and no temp file.
	const before = JSON.stringify({ version: 1, profiles: [] });
	writeFileSync(storeFile, before);
	const failRename = (): void => { throw new Error('EXDEV: rename failed'); };
	const d = await approveCheck({ checkId: c.checkId, efforts: [] }, deps({ rename: failRename }));
	assert.deepEqual(d, { ok: false, reason: 'write-failed', detail: 'the approved-model store could not be written: EXDEV: rename failed' });
	assert.equal(readFileSync(storeFile, 'utf8'), before);
	assert.equal(existsSync(`${storeFile}.tmp`), false);

	// A read-only directory: no store is created and nothing is left behind.
	const ro = join(dir, 'readonly');
	mkdirSync(ro);
	chmodSync(ro, 0o555);
	try {
		const roStore = join(ro, 'approved-models.json');
		assert.equal((await approveCheck({ checkId: c.checkId, efforts: [] }, deps({ storePath: roStore })) as { reason: string }).reason, 'write-failed');
		assert.equal(existsSync(roStore), false);
		assert.equal(existsSync(`${roStore}.tmp`), false);
	} finally { chmodSync(ro, 0o755); }

	// The check survived every failure and is decided once the store is writable.
	assert.deepEqual(await approveCheck({ checkId: c.checkId, efforts: [] }, deps()), { ok: true, restartRequired: true });
	assert.equal(storeDoc().profiles.length, 1);
});

test('model-check.test.ts: after unreadable effort discovery approve with an effort is invalid-efforts and approve with [] succeeds', async () => {
	fake({ models: 'not json' });
	const r = await check('gpt-new', ['high']);
	assert.equal(r.runs, true);
	assert.match((await approveCheck({ checkId: r.checkId, efforts: ['high'] }, deps()) as { detail: string }).detail, /high was rejected: the CLI's model list could not be read/);
	assert.deepEqual(await approveCheck({ checkId: r.checkId, efforts: [] }, deps()), { ok: true, restartRequired: true });
	assert.deepEqual(storeDoc().profiles[0]!.efforts, []);

	fake({ help: 'no effort flag here' });
	const c = await check('claude-new-1', ['max'], {}, 'cli-claude');
	assert.equal((await approveCheck({ checkId: c.checkId, efforts: ['max'] }, deps()) as { reason: string }).reason, 'invalid-efforts');
	assert.deepEqual(await approveCheck({ checkId: c.checkId, efforts: [] }, deps()), { ok: true, restartRequired: true });
});

test('model-check.test.ts: DecisionResult shapes; each written profile passes profileProblem and reads back through buildModelRegistry and getModelRegistry', async () => {
	fake({ exec: { 'gpt-gone': { exit: 1, lines: [{ type: 'turn.failed', error: { message: 'no' } }] } } });
	const ok = await check('gpt-new', ['high', 'low']);
	const gone = await check('gpt-gone', []);
	const results: DecisionResult[] = [
		await approveCheck({ checkId: 'missing' }, deps()),
		await approveCheck({ checkId: gone.checkId, efforts: [] }, deps()),
		await approveCheck({ checkId: ok.checkId, efforts: ['ultra'] }, deps()),
		await approveCheck({ checkId: ok.checkId, efforts: ['high'] }, deps()),
		await rejectCheck({ checkId: gone.checkId }, deps()),
	];
	for (const d of results) {
		if (d.ok) assert.deepEqual(Object.keys(d).sort(), ['ok', 'restartRequired']);
		else {
			assert.deepEqual(Object.keys(d).sort(), ['detail', 'ok', 'reason']);
			assert.ok(['unknown-check', 'model-did-not-run', 'invalid-efforts', 'write-failed'].includes(d.reason));
			assert.ok(d.detail.length > 0);
		}
	}
	assert.deepEqual(results.map(d => (d.ok ? 'ok' : d.reason)), ['unknown-check', 'model-did-not-run', 'invalid-efforts', 'ok', 'ok']);

	const profiles = storeDoc().profiles;
	for (const p of profiles) assert.equal(profileProblem(p), undefined, JSON.stringify(p));

	const built = buildModelRegistry(FIXTURE, profiles);
	const approved = built.models('cli-codex').find(m => m.id === 'gpt-new');
	assert.equal(approved?.source, 'user-approved');
	assert.deepEqual(approved?.efforts, ['high']);
	assert.deepEqual(built.rejected('cli-codex'), ['gpt-gone']);

	_resetModelRegistryForTests();
	const live = getModelRegistry();
	assert.equal(live.find('cli-codex', 'gpt-new')?.source, 'user-approved');
	assert.deepEqual(live.find('cli-codex', 'gpt-new')?.efforts, ['high']);
	assert.deepEqual(live.rejected('cli-codex'), ['gpt-gone']);
});
