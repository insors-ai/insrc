/**
 * ISSUE-4b33600426ce4112 t1 — the exec stand-in's server must stay ref'd while installed:
 * a test awaiting a gh/git call through the stand-in must keep the event loop alive, or a
 * parallel bare sweep can drain the loop under that pending promise and cancel the rest of
 * the file ("Promise resolution is still pending but the event loop has already resolved").
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/helpers/exec-stand-in.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installExecStandIn, _standInServerForTests } from './exec-stand-in.js';

const execFileAsync = promisify(execFile);

test("exec-stand-in keeps its server ref'd while installed, an awaited gh call resolves, and remove() tears it down", async (t) => {
	const pathBefore = process.env['PATH'];
	installExecStandIn((program, args) => {
		assert.equal(program, 'gh');
		return 'ok:' + args.join(',');
	});
	// Teardown is registered before the first assertion: an assertion failure or a
	// rejected exec must not leave the ref'd stand-in server listening and PATH modified.
	t.after(() => {
		if (_standInServerForTests() !== undefined) installExecStandIn();
	});
	const server = _standInServerForTests();
	assert.ok(server, 'the stand-in server exists while installed');
	const handle = (server as unknown as { _handle?: { hasRef?: () => boolean } })._handle;
	assert.equal(handle?.hasRef?.(), true, "the server's handle stays ref'd while installed (no unref before remove)");
	const { stdout } = await execFileAsync('gh', ['issue', 'list']);
	assert.equal(stdout.trim(), 'ok:issue,list', 'an awaited call through the stand-in resolves');
	installExecStandIn();
	assert.equal(_standInServerForTests(), undefined, 'remove() tears the stand-in down');
	assert.equal(process.env['PATH'], pathBefore, 'remove() restores PATH exactly');
});
