/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t7: every builtin is mapped onto the approval field.
 * The snapshot fixtures/approval-snapshot.json was taken from the live registry BEFORE the rewrite:
 * for each of the 228 tools, its id, input schema, the old requiresApproval (true, false, absent or a
 * function, with the function's answer for ten probe inputs) and the old destructive flag.
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-class-mapping.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerBuiltinTools } from '../builtins/index.js';
import { resolveApprovalClass } from '../approval-policy.js';
import { listTools } from '../registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..');

interface SnapshotTool {
	id: string;
	inputSchema: unknown;
	requiresApproval: 'true' | 'false' | 'absent' | 'function';
	destructive: boolean;
	probes?: Array<{ input: Record<string, unknown>; asks: boolean }> | undefined;
}
const snapshot = (JSON.parse(readFileSync(join(HERE, 'fixtures', 'approval-snapshot.json'), 'utf8')) as { tools: SnapshotTool[] }).tools;

/** Former requiresApproval-true tools that Story s4 turned into per-input classes. */
const PER_INPUT_SINCE_S4 = new Set(['git_reset', 'git_push', 'git_checkout']);

registerBuiltinTools();
const live = new Map(listTools().map(t => [t.id, t]));

test('approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none', () => {
	assert.equal(snapshot.length, 228, 'the snapshot covers every builtin');
	const counts = { common: 0, perInput: 0, none: 0 };
	for (const old of snapshot) {
		const tool = live.get(old.id);
		assert.ok(tool, `${old.id} is still registered`);
		if (old.destructive) continue; // covered by the next test
		if (old.requiresApproval === 'true') {
			if (PER_INPUT_SINCE_S4.has(old.id)) {
				// s4 made these per-input (destructive for hard reset, forced push, checkout of a path): still never none
				assert.equal(typeof tool.approval, 'function', old.id);
				assert.ok(['common', 'destructive'].includes(resolveApprovalClass(tool, {})), old.id);
			} else {
				assert.equal(tool.approval, 'common', old.id);
			}
			counts.common += 1;
		} else if (old.requiresApproval === 'function') {
			assert.equal(typeof tool.approval, 'function', old.id);
			for (const p of old.probes!) {
				// a call that asked stays asking (s4 marks some of them destructive); a read stays none
				const cls = resolveApprovalClass(tool, p.input);
				assert.ok(p.asks ? cls === 'common' || cls === 'destructive' : cls === 'none', `${old.id} ${JSON.stringify(p.input)} is ${cls}`);
			}
			counts.perInput += 1;
		} else {
			assert.equal(tool.approval, undefined, `${old.id} declares no approval`);
			assert.equal(resolveApprovalClass(tool, {}), 'none', `${old.id} does not ask`);
			counts.none += 1;
		}
	}
	assert.deepEqual(counts, { common: 104, perInput: 7, none: 109 });
});

test('approval-class-mapping.test.ts: the eight destructive builtins are destructive', () => {
	const destructive = snapshot.filter(t => t.destructive).map(t => t.id).sort();
	assert.deepEqual(destructive, [
		'cloud_aws_cloudformation_delete', 'cloud_aws_ec2_terminate', 'cloud_aws_s3_rm', 'cloud_az_vm_delete',
		'cloud_gcp_compute_delete', 'cloud_gcp_run_delete', 'cloud_gcp_storage_rm', 'k8s_delete',
	]);
	for (const id of destructive) assert.equal(live.get(id)!.approval, 'destructive', id);
	// Later Stories (the git, gh and Jira families) may mark more operations destructive; the eight must stay so.
	const now = new Set([...live.values()].filter(t => t.approval === 'destructive').map(t => t.id));
	for (const id of destructive) assert.ok(now.has(id), id);
});

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name === '__tests__') continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) sourceFiles(p, out);
		else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
	}
	return out;
}

test('approval-class-mapping.test.ts: no builtin still declares requiresApproval or destructive', () => {
	for (const tool of live.values()) {
		assert.equal('requiresApproval' in tool, false, `${tool.id} declares requiresApproval`);
		assert.equal('destructive' in tool, false, `${tool.id} declares destructive`);
	}
	const offenders: string[] = [];
	for (const file of sourceFiles(SRC)) {
		const text = readFileSync(file, 'utf8');
		if (/\brequiresApproval\b/.test(text) || /^\s*(readonly\s+)?destructive\??\s*[:(]/m.test(text)) offenders.push(file.slice(SRC.length + 1));
	}
	assert.deepEqual(offenders, [], 'no source file declares the old fields');
});

test('approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite', () => {
	// Every tool of the snapshot is still registered with the same input schema. Tools that later Stories
	// add are not in the snapshot and are not compared.
	for (const old of snapshot) {
		assert.ok(live.has(old.id), `${old.id} is still registered`);
		assert.deepEqual(JSON.parse(JSON.stringify(live.get(old.id)!.inputSchema)), old.inputSchema, `${old.id} input schema`);
	}
});

test('approval-class-mapping.test.ts: the twelve git tools of Story s4 are registered, ten of them reads and two per-input', () => {
	const reads = ['git_rev_parse', 'git_rev_list', 'git_ls_files', 'git_ls_tree', 'git_cat_file', 'git_for_each_ref', 'git_show_ref', 'git_merge_base', 'git_hash_object', 'git_path_history'];
	for (const id of reads) {
		const tool = live.get(id);
		assert.ok(tool, `${id} is registered`);
		assert.equal(tool.approval, undefined, `${id} declares no approval`);
		assert.equal(resolveApprovalClass(tool, {}), 'none', id);
		assert.ok(tool.outputSchema !== undefined, `${id} declares a typed result`);
		assert.equal(snapshot.some(s => s.id === id), false, `${id} is new: it is not in the snapshot of the 228`);
	}
	const symbolic = live.get('git_symbolic_ref')!;
	assert.deepEqual(['get', 'set', 'delete'].map(op => resolveApprovalClass(symbolic, { op })), ['none', 'common', 'destructive']);
	const fetchRefs = live.get('git_fetch_refs')!;
	assert.equal(resolveApprovalClass(fetchRefs, { refspecs: ['+refs/heads/a:refs/remotes/o/a'] }), 'none');
	assert.equal(resolveApprovalClass(fetchRefs, { refspecs: ['+refs/heads/a:refs/heads/a'] }), 'destructive');
});
