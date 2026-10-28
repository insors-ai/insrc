/**
 * The scan of src/cli/services (Story s10): two files were sites of git, gh or workflow code and now only call daemon methods, one is the named
 * exemption (the daemon self-update), five run programs that are not git or gh, and nothing else starts git or gh.
 * Run: npx tsx --test-force-exit src/cli/__tests__/cli-services-sites.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const text = (f: string): string => readFileSync(join(DIR, f), 'utf8');

/** A process start on git or gh: spawn, exec, capture or stream with the program as the first argument. */
const GIT_OR_GH_PROCESS = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|capture|stream|runShell|runShellBytes)\(\s*['"](?:git|gh)['"]/;
const CHILD_PROCESS = /from\s+'(?:node:)?child_process'/;
const files = readdirSync(DIR).filter(f => /\.tsx?$/.test(f));

const SITES = { 'workflow.ts': ['workflow.approvePipeline', 'tracker.sync', 'tracker.setup', 'workflow.reviewArtifact', 'workflow.resolveFinding'], 'team.ts': ['team.refresh', 'team.claim', 'team.release'] };
const EXEMPTION = ['maintenance.ts'];
const NO_SITE = ['approval.ts', 'connection-maintenance.ts', 'daemon.ts', 'debug.ts', 'setup.ts'];

test('cli-services-sites.test.ts: the scan of src/cli/services finds two sites, one named exemption and five no-site files', () => {
	// two sites: no process start and no child_process import, and each row is a daemon method call
	assert.deepEqual(Object.keys(SITES).sort(), ['team.ts', 'workflow.ts']);
	for (const [file, methods] of Object.entries(SITES)) {
		const src = text(file);
		assert.ok(!CHILD_PROCESS.test(src) && !GIT_OR_GH_PROCESS.test(src), `${file} starts a process`);
		for (const method of methods) assert.ok(src.includes(`'${method}'`), `${file} has no call of ${method}`);
	}
	// the one named exemption starts git itself
	for (const file of EXEMPTION) assert.ok(GIT_OR_GH_PROCESS.test(text(file)), `${file} no longer starts git: the exemption is stale`);
	// five files that run programs that are not git or gh
	for (const file of NO_SITE) { assert.ok(files.includes(file), `${file} is gone`); assert.ok(!GIT_OR_GH_PROCESS.test(text(file)), `${file} starts git or gh`); }
	// and nothing else in the folder starts git or gh
	const others = files.filter(f => !Object.keys(SITES).includes(f) && !EXEMPTION.includes(f));
	assert.deepEqual(others.filter(f => GIT_OR_GH_PROCESS.test(text(f))), []);
});
