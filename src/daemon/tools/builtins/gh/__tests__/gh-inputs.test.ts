import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { ghReleaseAssetTool, ghRepoManageTool } from '../manage.js';
import { ghAuthTool, ghCodespaceTool } from '../account.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';
import { registerBuiltinTools } from '../../index.js';
import { getTool } from '../../../registry.js';
import { GH_COVERAGE } from '../coverage.js';
import { GH_INPUTS } from '../inputs.js';
import type { OpDef } from '../op-table.js';
import { flagsOf, helpOf, positionalsOf } from './_ghhelp.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

test('gh-inputs.test.ts: release download requires a tag, a non-empty pattern list or an archive; set-default needs exactly one of repository, view, unset', async () => {
	const gh = installFakeGh('ok', '');
	try {
		const call = (tool: typeof ghReleaseAssetTool, input: Record<string, unknown>) => tool.execute(input, deps);
		// release download: none of tag, pattern, archive is refused, and gh does not run
		const none = await call(ghReleaseAssetTool, { op: 'download' });
		assert.equal(none.success, false);
		assert.equal(none.failure?.kind, 'rejected');
		assert.match(none.error ?? '', /at least one of tag, pattern, archive/);
		const onlyDir = await call(ghReleaseAssetTool, { op: 'download', dir: 'd' });
		assert.equal(onlyDir.success, false);
		assert.equal(gh.calls().length, 0, 'gh did not run for a refused input');
		// an empty pattern list is not a pattern: the schema refuses it
		assert.equal(validateAgainstSchema(ghReleaseAssetTool.inputSchema as unknown as StructuredSchema, { op: 'download', pattern: [] }).ok, false);
		// each of the three alone is enough
		for (const input of [{ tag: 'v1' }, { pattern: ['*.zip'] }, { archive: 'tar.gz' }]) {
			const r = await call(ghReleaseAssetTool, { op: 'download', ...input });
			assert.equal(r.success, true, JSON.stringify(input));
		}
		// output is a file path, never '-', and not with dir; clobber and skipExisting do not go together
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', output: '-' })).error ?? '', /never "-"/);
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', output: 'f', dir: 'd' })).error ?? '', /at most one of output, dir/);
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', clobber: true, skipExisting: true })).error ?? '', /at most one of clobber, skipExisting/);
		// upload needs at least one file
		assert.equal(validateAgainstSchema(ghReleaseAssetTool.inputSchema as unknown as StructuredSchema, { op: 'upload', tag: 'v1', files: [] }).ok, false);

		// set-default: exactly one of repository, view, unset
		const before = gh.calls().length;
		for (const input of [{}, { repository: 'o/r', view: true }, { view: true, unset: true }, { repository: 'o/r', view: true, unset: true }]) {
			const r = await call(ghRepoManageTool as never, { op: 'set-default', ...input });
			assert.equal(r.success, false, JSON.stringify(input));
			assert.match(r.error ?? '', /exactly one of repository, view, unset/);
		}
		assert.equal(gh.calls().length, before, 'gh did not run for a refused input');
		for (const input of [{ repository: 'o/r' }, { view: true }, { unset: true }]) {
			const r = await call(ghRepoManageTool as never, { op: 'set-default', ...input });
			assert.equal(r.success, true, JSON.stringify(input));
		}
		// a false boolean is not given
		assert.equal((await call(ghRepoManageTool as never, { op: 'set-default', repository: 'o/r', view: false })).success, true);
		// a field the op does not accept, and an op the tool does not offer
		assert.match((await call(ghRepoManageTool as never, { op: 'archive', repository: 'o/r', force: true })).error ?? '', /does not accept the field force/);
		assert.match((await call(ghRepoManageTool as never, { op: 'zap' })).error ?? '', /unknown op "zap"/);
	} finally { gh.restore(); }
});

test("gh-inputs.test.ts: gist rename's three positionals, gist edit without content or filename, exactly-one-of rules of secret, variable, cache and key adds", async () => {
	const gh = installFakeGh('ok', '');
	try {
		const call = (tool: { execute: (i: Record<string, unknown>, d: typeof deps) => Promise<{ success: boolean; error?: string | undefined }> }, input: Record<string, unknown>) => tool.execute(input, deps);
		const refused = async (tool: Parameters<typeof call>[0], input: Record<string, unknown>, pattern: RegExp) => {
			const before = gh.calls().length;
			const r = await call(tool, input);
			assert.equal(r.success, false, JSON.stringify(input));
			assert.match(r.error ?? '', pattern, JSON.stringify(input));
			assert.equal(gh.calls().length, before, 'gh did not run for a refused input');
		};
		// gist rename: id, oldFilename and newFilename are all positionals, all required
		for (const input of [{ id: 'a', oldFilename: 'x' }, { id: 'a', newFilename: 'y' }, { oldFilename: 'x', newFilename: 'y' }]) { await refused(ghGistTool, { op: 'rename', ...input }, /needs the field/); }
		assert.equal((await call(ghGistTool, { op: 'rename', id: 'a', oldFilename: 'x', newFilename: 'y' })).success, true);
		assert.deepEqual(gh.calls().at(-1), 'gist rename a x y');
		// gist edit offers add, remove and desc only: no content, no filename selector, at least one of the three
		await refused(ghGistTool, { op: 'edit', id: 'a', content: 'text' }, /does not accept the field content/);
		await refused(ghGistTool, { op: 'edit', id: 'a', filename: 'f.txt' }, /does not accept the field filename/);
		await refused(ghGistTool, { op: 'edit', id: 'a' }, /at least one of add, remove, desc/);
		assert.deepEqual(Object.keys(ghGistTool.ops.find(o => o.name === 'edit')!.fields!).sort(), ['add', 'desc', 'id', 'remove']);
		// gist create: files or content, not both; filename only with content
		await refused(ghGistTool, { op: 'create' }, /exactly one of files, content/);
		await refused(ghGistTool, { op: 'create', files: ['a'], content: 'c' }, /exactly one of files, content/);
		await refused(ghGistTool, { op: 'create', files: ['a'], filename: 'f' }, /filename only together with content/);
		// secret and variable set: a name with its value, or an env file, exactly one of name and envFile
		await refused(ghSecretTool, { op: 'set' }, /exactly one of name, envFile/);
		await refused(ghSecretTool, { op: 'set', name: 'T', envFile: '.env' }, /exactly one of name, envFile/);
		await refused(ghSecretTool, { op: 'set', name: 'T' }, /needs secretValue with name/);
		await refused(ghSecretTool, { op: 'set', envFile: '.env', secretValue: 'v' }, /secretValue only together with name/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', env: 'e', org: 'o' }, /at most one of env, org, user/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', repos: ['a'] }, /repos only with org or user/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', visibility: 'all' }, /visibility only together with org/);
		await refused(ghVariableTool, { op: 'set' }, /exactly one of name, envFile/);
		await refused(ghVariableTool, { op: 'set', name: 'V' }, /needs value with name/);
		await refused(ghVariableTool, { op: 'set', name: 'V', value: 'v', env: 'e', org: 'o' }, /at most one of env, org/);
		await refused(ghVariableTool, { op: 'set', name: 'V', value: 'v', repos: ['a'] }, /repos only with org/);
		assert.equal((await call(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', user: true, repos: ['a'] })).success, true);
		assert.equal((await call(ghVariableTool, { op: 'set', name: 'V', value: '' })).success, true, 'an empty variable value is a value');
		// cache delete: exactly one of id, key, all
		await refused(ghCacheTool, { op: 'delete' }, /exactly one of id, key, all/);
		await refused(ghCacheTool, { op: 'delete', id: 1, key: 'k' }, /exactly one of id, key, all/);
		await refused(ghCacheTool, { op: 'delete', all: true, key: 'k' }, /exactly one of id, key, all/);
		// ssh-key and gpg-key add: a key file or the key text, exactly one
		await refused(ghSshKeyTool, { op: 'add' }, /exactly one of keyFile, key/);
		await refused(ghSshKeyTool, { op: 'add', keyFile: 'f', key: 'k' }, /exactly one of keyFile, key/);
		await refused(ghGpgKeyTool as never, { op: 'add' }, /exactly one of keyFile, key/);
		await refused(ghGpgKeyTool as never, { op: 'add', keyFile: 'f', key: 'k' }, /exactly one of keyFile, key/);
	} finally { gh.restore(); }
});

test('gh-inputs.test.ts: auth logout and switch need hostname and user; codespace ops need codespace except list and create; delete needs codespace and offers no all', async () => {
	const gh = installFakeGh('ok', '');
	try {
		const refused = async (tool: typeof ghAuthTool | typeof ghCodespaceTool, input: Record<string, unknown>, pattern: RegExp) => {
			const before = gh.calls().length;
			const r = await tool.execute(input, deps);
			assert.equal(r.success, false, JSON.stringify(input));
			assert.match(r.error ?? '', pattern, JSON.stringify(input));
			assert.equal(gh.calls().length, before, 'gh did not run for a refused input');
		};
		for (const op of ['logout', 'switch']) {
			await refused(ghAuthTool, { op }, /needs the field hostname/);
			await refused(ghAuthTool, { op, hostname: 'github.com' }, /needs the field user/);
			await refused(ghAuthTool, { op, user: 'octocat' }, /needs the field hostname/);
			assert.equal((await ghAuthTool.execute({ op, hostname: 'github.com', user: 'octocat' }, deps)).success, true, op);
		}
		// every codespace op but list and create names the codespace, because gh would otherwise ask
		for (const op of ['view', 'logs', 'ports', 'edit', 'stop', 'rebuild']) { await refused(ghCodespaceTool, { op }, /needs the field codespace/); }
		await refused(ghCodespaceTool, { op: 'cp', sources: ['a'], dest: 'b' }, /needs the field codespace/);
		await refused(ghCodespaceTool, { op: 'ports-visibility', ports: ['80:public'] }, /needs the field codespace/);
		for (const op of ['list', 'create']) { assert.equal(ghCodespaceTool.ops.find(o => o.name === op)!.required?.includes('codespace') ?? false, false, op); }
		await refused(ghCodespaceTool, { op: 'create' }, /needs the field repo/);
		// delete names the codespace like every other op; delete-all is not offered
		await refused(ghCodespaceTool, { op: 'delete' }, /needs the field codespace/);
		await refused(ghCodespaceTool, { op: 'delete', all: true }, /does not accept the field all/);
		await refused(ghCodespaceTool, { op: 'delete', codespace: 'c', days: 3 }, /does not accept the field days/);
		assert.equal((await ghCodespaceTool.execute({ op: 'delete', codespace: 'c' }, deps)).success, true);
		// cp needs at least one source; port pairs are port:visibility
		assert.equal(validateAgainstSchema(ghCodespaceTool.inputSchema as unknown as StructuredSchema, { op: 'cp', codespace: 'c', sources: [], dest: 'd' }).ok, false);
		await refused(ghCodespaceTool, { op: 'ports-visibility', codespace: 'c', ports: ['80'] }, /PORT:public, PORT:private or PORT:org/);
		await refused(ghCodespaceTool, { op: 'ports-visibility', codespace: 'c', ports: ['80:everyone'] }, /PORT:public, PORT:private or PORT:org/);
		// a positional may not look like a flag
		await refused(ghCodespaceTool, { op: 'cp', codespace: 'c', sources: ['--help'], dest: 'd' }, /must not start with '-'/);
	} finally { gh.restore(); }
});

// ---------------------------------------------------------------------------
// The input inventory against the installed gh
// ---------------------------------------------------------------------------

type Family = { ops: OpDef[] };

/** The input fields one (tool, op) accepts. */
function fieldsOf(toolId: string, op: string | undefined): Set<string> {
	const tool = getTool(toolId) as unknown as ({ ops?: OpDef[]; inputSchema: { properties?: Record<string, unknown> } }) | undefined;
	assert.ok(tool, `${toolId} is registered`);
	if (tool.ops === undefined) { return new Set(Object.keys(tool.inputSchema.properties ?? {})); }
	const def = tool.ops.find(o => o.name === op);
	assert.ok(def, `${toolId}.${op} exists`);
	return new Set(['op', 'cwd', ...(def.repo === true ? ['repo'] : []), ...Object.keys(def.fields ?? {})]);
}

test('gh-inputs.test.ts: every flag and positional has a GH_INPUTS row and every schema field is accounted for by a flag, positional or synthetic row', () => {
	registerBuiltinTools();
	const covered = GH_COVERAGE.filter(r => r.owner === 'covered' && r.command !== 'co');
	const byCommand = new Map<string, typeof GH_INPUTS[number][]>();
	for (const r of GH_INPUTS) { byCommand.set(r.command, [...(byCommand.get(r.command) ?? []), r]); }
	const coveredCommands = new Set(covered.map(r => r.command));
	for (const c of byCommand.keys()) { assert.ok(coveredCommands.has(c), `${c}: rows exist only for covered commands`); }
	// one row per (command, kind, name)
	const keys = GH_INPUTS.map(r => `${r.command}|${r.kind}|${r.name}`);
	assert.equal(new Set(keys).size, keys.length, 'no duplicate row');

	for (const row of covered) {
		const rows = byCommand.get(row.command) ?? [];
		// every flag of the FLAGS section and every positional of the USAGE line has a row of the right kind
		for (const flag of flagsOf(row.command)) {
			assert.ok(rows.some(r => (r.kind === 'flag' || r.kind === 'synthetic') && r.name === flag.long), `${row.command}: the flag ${flag.long} has a GH_INPUTS row`);
		}
		for (const p of positionalsOf(row.command)) {
			assert.ok(rows.some(r => r.kind === 'positional' && r.name === p.name), `${row.command}: the positional ${p.name} has a GH_INPUTS row`);
		}
		// every flag and positional row offers a field or says why not (a synthetic row is an argument the tool adds itself); op and cwd are synthetic rows of every command
		for (const r of rows) { assert.ok(r.kind === 'synthetic' || r.field !== undefined || (r.excluded ?? '').length > 5, `${row.command} ${r.name}: names a field or a reason`); }
		assert.ok(rows.some(r => r.kind === 'synthetic' && r.name === 'cwd' && r.field === 'cwd'), `${row.command}: cwd is a synthetic row`);

		// the rows' fields exist in the schema of a covering tool, and every field of a covering (tool, op) has a row
		const ops = (row.op ?? '').split(',').filter(Boolean);
		const targets: Array<[string, string | undefined]> = [];
		for (const id of row.toolIds ?? []) {
			const tool = getTool(id) as unknown as Family | undefined;
			if (tool?.ops !== undefined) { for (const op of ops) { if (tool.ops.some(o => o.name === op)) { targets.push([id, op]); } } }
			else { targets.push([id, undefined]); }
		}
		const rowFields = new Set(rows.flatMap(r => r.field === undefined ? [] : typeof r.field === 'string' ? [r.field] : [...r.field]));
		const allFields = new Set(targets.flatMap(([id, op]) => [...fieldsOf(id, op)]));
		for (const f of rowFields) { assert.ok(allFields.has(f), `${row.command}: the row field ${f} is in the schema of ${targets.map(t => t.join('.')).join(', ')}`); }
		for (const [id, op] of targets) {
			for (const f of fieldsOf(id, op)) { assert.ok(rowFields.has(f), `${row.command}: the field ${f} of ${id}${op ? '.' + op : ''} is accounted for by a row`); }
		}
		if (ops.length > 0) { assert.ok(rows.some(r => r.kind === 'synthetic' && r.name === 'op' && r.field === 'op'), `${row.command}: op is a synthetic row`); }
	}
});

// ---------------------------------------------------------------------------
// The prompt sweep
// ---------------------------------------------------------------------------

/** An argument whose absence makes gh ask a person, read from the installed help (the evidence must occur in it). */
interface PromptCase { command: string; field: string; evidence: string }
const PROMPT_CASES: readonly PromptCase[] = [
	{ command: 'ruleset view', field: 'rulesetId', evidence: 'If no ID is provided, an interactive prompt will be used to choose' },
	{ command: 'gist view', field: 'id', evidence: 'View the given gist or select from recent gists.' },
	{ command: 'auth switch', field: 'user', evidence: 'required either through the `--user` flag or an interactive prompt.' },
	{ command: 'run delete', field: 'runId', evidence: 'Interactively select a run to delete' },
];

/** An optional positional that does not prompt, with the sentence of the installed help that says what happens instead. */
interface NoPrompt { command: string; positional: string; evidence: string }
const NO_PROMPT: readonly NoPrompt[] = [
	{ command: 'repo sync', positional: 'destination-repository', evidence: 'Without an argument, the local repository is selected as the destination repository.' },
	{ command: 'ruleset check', positional: 'branch', evidence: 'If no branch name is provided, then the current branch will be used.' },
	{ command: 'extension search', positional: 'query', evidence: 'With no arguments, this command prints out the first 30 extensions' },
	{ command: 'gist clone', positional: 'directory', evidence: 'Pass additional `git clone` flags by listing them after `--`.' },
	{ command: 'gist edit', positional: 'filename', evidence: 'Add a new file to the gist' },
];

/** The ops of a family that can reach a gh prompt, as 'tool.op: why'. */
function promptViolations(tools: Array<{ id: string; ops: OpDef[] }>): string[] {
	const out: string[] = [];
	const names = (def: OpDef): string[] => [...(def.required ?? []), ...(def.oneOf ?? []).flat(), ...(def.atLeastOne ?? []).flat()];
	for (const tool of tools) {
		for (const def of tool.ops) {
			const command = def.command.join(' ');
			const at = `${tool.id}.${def.name}`;
			const help = helpOf(command);
			const always = new Set(def.args.flatMap(a => 'lit' in a && a.when === undefined ? a.lit : []));
			// a flag that skips a prompt is always passed by the tool
			for (const flag of flagsOf(command)) {
				if (/prompt/i.test(flag.description) && !always.has(flag.long) && !(flag.short !== undefined && always.has(flag.short))) { out.push(`${at}: ${flag.long} skips a prompt and is not always passed`); }
			}
			// an optional positional is required in the op, or the help says what happens when it is absent
			const posArgs = def.args.filter(a => 'pos' in a || 'spread' in a || 'last' in a);
			positionalsOf(command).forEach((p, i) => {
				if (!p.optional) { return; }
				const a = posArgs[i];
				const field = a === undefined ? undefined : 'pos' in a ? a.pos : 'spread' in a ? a.spread : 'last' in a ? a.last : undefined;
				if (field !== undefined && names(def).includes(field)) { return; }
				const ok = NO_PROMPT.find(n => n.command === command && n.positional === p.name);
				if (ok === undefined || !help.includes(ok.evidence)) { out.push(`${at}: the optional positional ${p.name} can make gh prompt`); }
			});
			// an argument the help says gh prompts for is required
			for (const c of PROMPT_CASES) {
				if (c.command === command && !names(def).includes(c.field)) { out.push(`${at}: ${c.field} is optional but gh prompts without it`); }
			}
		}
	}
	return out;
}

test('gh-inputs.test.ts: prompt sweep reads the prompt cases from the installed gh help and requires each argument in the schema or always passed', async () => {
	registerBuiltinTools();
	const families = GH_COVERAGE.flatMap(r => r.toolIds ?? []).filter((id, i, all) => all.indexOf(id) === i)
		.map(id => getTool(id) as unknown as { id: string; ops?: OpDef[] }).filter((t): t is { id: string; ops: OpDef[] } => t.ops !== undefined);
	assert.equal(families.length, 22);
	// the cases come from the installed help: the evidence is in it
	for (const c of PROMPT_CASES) { assert.ok(helpOf(c.command).includes(c.evidence), `${c.command}: the help says "${c.evidence}"`); }
	for (const n of NO_PROMPT) { assert.ok(helpOf(n.command).includes(n.evidence), `${n.command}: the help says "${n.evidence}"`); }
	assert.deepEqual(promptViolations(families), [], 'no op of the table can reach a gh prompt');

	// the sweep fails on an optional selector whose absence makes gh prompt, and on a prompt-skipping flag that is not passed
	const mutate = (tool: { id: string; ops: OpDef[] }, op: string, change: (d: OpDef) => OpDef) => [{ id: tool.id, ops: tool.ops.map(d => d.name === op ? change(d) : d) }];
	const codespace = families.find(t => t.id === 'gh_ruleset')!;
	const optionalId = mutate(codespace, 'view', d => ({ ...d, required: [] }));
	assert.match(promptViolations(optionalId).join('\n'), /gh_ruleset\.view: .*rulesetId|gh_ruleset\.view: the optional positional/);
	const del = families.find(t => t.id === 'gh_issue_manage')!;
	const noYes = mutate(del, 'delete', d => ({ ...d, args: d.args.filter(a => !('lit' in a)) }));
	assert.match(promptViolations(noYes).join('\n'), /gh_issue_manage\.delete: --yes skips a prompt and is not always passed/);
	const auth = families.find(t => t.id === 'gh_auth')!;
	const optionalUser = mutate(auth, 'switch', d => ({ ...d, required: ['hostname'] }));
	assert.match(promptViolations(optionalUser).join('\n'), /gh_auth\.switch: user is optional but gh prompts without it/);
});
