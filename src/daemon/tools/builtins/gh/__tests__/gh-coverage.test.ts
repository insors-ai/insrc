import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { registerBuiltinTools } from '../../index.js';
import { getTool, listTools } from '../../../registry.js';
import { GH_COVERAGE } from '../coverage.js';
import { leafCommands } from './_ghhelp.js';

test('gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 69 tools are registered (68 that serve a gh command and gh_tracker)', () => {
	registerBuiltinTools();
	const rows = new Map(GH_COVERAGE.map(r => [r.command, r]));
	assert.equal(rows.size, GH_COVERAGE.length, 'one row per command');

	// every command of the installed gh has a row
	const installed = leafCommands();
	assert.ok(installed.length > 100, `the installed gh lists its commands (${installed.length})`);
	const missing = installed.filter(c => !rows.has(c));
	assert.deepEqual(missing, [], 'commands of the installed gh with no GH_COVERAGE row');

	for (const row of GH_COVERAGE) {
		if (row.owner === 'excluded') {
			assert.ok((row.reason ?? '').length > 10, `${row.command}: an excluded row has a reason`);
			assert.equal(row.toolIds, undefined, `${row.command}: an excluded row names no tool`);
			continue;
		}
		assert.ok((row.toolIds ?? []).length > 0, `${row.command}: a covered row names a tool`);
		const ops = (row.op ?? '').split(',').filter(Boolean);
		let opsFound = 0;
		for (const id of row.toolIds ?? []) {
			const tool = getTool(id) as ({ ops?: Array<{ name: string; command: readonly string[] }> } & object) | undefined;
			assert.ok(tool, `${row.command}: ${id} is registered`);
			if (tool.ops !== undefined) {
				assert.ok(ops.length > 0, `${row.command}: ${id} is a family tool, so the row names its op`);
				for (const op of ops) {
					const def = tool.ops.find(o => o.name === op);
					if (def !== undefined) {
						opsFound += 1;
						assert.equal(def.command.join(' '), row.command === 'co' ? 'pr checkout' : row.command, `${id}.${op} runs ${row.command}`);
					}
				}
			}
		}
		if (ops.length > 0) { assert.equal(opsFound, ops.length, `${row.command}: every named op exists on a named tool`); }
	}
	// the user-accepted exclusions of 2026-10-25 are all there
	for (const c of ['browse', 'api', 'completion', 'auth login', 'auth token', 'auth refresh', 'auth setup-git', 'codespace ssh', 'codespace code', 'codespace jupyter', 'codespace ports forward', 'run watch',
		'alias set', 'config set', 'config clear-cache', 'extension browse', 'extension install', 'extension remove', 'extension upgrade', 'extension create', 'extension exec']) {
		assert.equal(rows.get(c)?.owner, 'excluded', c);
	}
	// every command that has a tool is covered: the included groups, and the alias co
	assert.equal(rows.get('co')?.toolIds?.[0], 'gh_pr_manage');

	// all 69 gh tools are registered: the 46 existing and the 22 of the families that serve a gh command, and gh_tracker (Story s7)
	const gh = listTools().filter(t => t.id.startsWith('gh_') || t.id.startsWith('gh:'));
	assert.equal(gh.length, 69);
	assert.equal(gh.filter(t => (t as { ops?: unknown }).ops !== undefined).length, 23);
	// every registered gh tool serves some covered command, except gh_tracker, which is the amendment to the excluded gh api
	const served = new Set(GH_COVERAGE.flatMap(r => r.toolIds ?? []));
	assert.deepEqual(gh.map(t => t.id).filter(id => !served.has(id)), ['gh_tracker']);
});

test('gh-coverage.test.ts: the coverage table names the tracker family as s7\'s amendment and keeps raw gh api excluded', () => {
	const api = GH_COVERAGE.find(r => r.command === 'api');
	assert.equal(api?.owner, 'excluded', 'raw gh api stays excluded');
	assert.equal(api?.toolIds, undefined, 'no tool is named for it');
	assert.match(api?.reason ?? '', /gh_tracker/);
	assert.match(api?.reason ?? '', /Story s7/);
	assert.match(api?.reason ?? '', /2026-10-26/);
	assert.match(api?.reason ?? '', /no endpoint is ever an input/);
	// the amendment is the only tool that is not in a covered row
	registerBuiltinTools();
	const served = new Set(GH_COVERAGE.flatMap(r => r.toolIds ?? []));
	assert.equal(served.has('gh_tracker'), false);
	assert.ok(getTool('gh_tracker'));
});

test('gh-coverage.test.ts: the plan note lists the tools s7 built, marks the callTool prerequisite done and states the s9 and s10 hand-over', () => {
	const note = readFileSync(join(process.cwd(), 'docs', 'plans', 'tool-registry.md'), 'utf8');
	const built = note.slice(note.indexOf('## s7 built'));
	assert.ok(built.length > 0 && note.includes('## s7 built'), 'the note has the s7 section');
	for (const id of ['git_config', 'git_ls_remote', 'git_update_ref', 'git_rm', 'gh_tracker', 'tools.call']) assert.ok(built.includes(`\`${id}\``), id);
	for (const op of ['issue_create_typed', 'tasks_query', 'project_create']) assert.ok(built.includes(`\`${op}\``), op);
	assert.match(note, /Done in s7 \(2026-10-27\):\*\* `src\/daemon\/tools\/provenance\.ts`/);
	assert.match(built, /\*\*s9\*\* builds the sending side of the shared deadline signal/);
	assert.match(built, /\*\*s10\*\* moves the tracker/);
	assert.match(built, /switches the scan to failing mode/);
});
