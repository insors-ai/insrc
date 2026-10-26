/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: aws logs tail in follow mode gives the same progress frames, byte counts,
 * exit mapping and result text as before the move onto the shared lifecycle.
 * Run: npx tsx --test src/daemon/tools/builtins/cloud/aws/__tests__/logs-parity.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../../__tests__/_proc.js';
import { installStandInBin, messages, toolDeps, withEmptyPath } from '../../../../__tests__/_bin.js';
import type { StandInBin } from '../../../../__tests__/_bin.js';
import { awsLogsTailTool } from '../logs.js';

let bin: StandInBin | undefined;
let restorePath: (() => void) | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; restorePath?.(); restorePath = undefined; });

test('logs-parity.test.ts: follow mode streams stdout as progress frames and reports bytes and the stderr tail', async () => {
	bin = installStandInBin('aws', 'echo evt1; echo oops 1>&2');
	const frames: unknown[] = [];
	const r = await awsLogsTailTool.execute({ logGroup: '/g', follow: true }, toolDeps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames), ['evt1\n']);
	assert.match(r.output, /^Log follow ended after \d+ ms\.\nStreamed 5 B from `\/g`\.\n\n\*\*stderr tail\*\*\n```\noops\n```$/);
	const d = r.data as { follow: boolean; exitCode: number; bytes: number; timedOut: boolean };
	assert.equal(d.follow, true); assert.equal(d.exitCode, 0); assert.equal(d.bytes, 5); assert.equal(d.timedOut, false);
});

test('logs-parity.test.ts: follow mode with a non-zero exit, a runtime cap and an abort keeps its wording', async () => {
	bin = installStandInBin('aws', 'exit 3');
	const bad = await awsLogsTailTool.execute({ logGroup: '/g', follow: true }, toolDeps([]));
	assert.equal(bad.success, false); assert.equal(bad.error, 'exit 3');
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('aws', 'exec sleep 30');
	const capped = await awsLogsTailTool.execute({ logGroup: '/g', follow: true, maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(capped.success, true);
	assert.match(capped.output, /^Log follow ended \(runtime cap\) after \d+ ms\./);
	assert.equal((capped.data as { timedOut: boolean }).timedOut, true);
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const aborted = await awsLogsTailTool.execute({ logGroup: '/g', follow: true }, toolDeps([], c.signal));
	assert.equal(aborted.success, false); assert.equal(aborted.error, 'exit null');
});

test('logs-parity.test.ts: a missing aws gives the spawn failed text', async () => {
	restorePath = withEmptyPath();
	const r = await awsLogsTailTool.execute({ logGroup: '/g', follow: true }, toolDeps([]));
	assert.equal(r.success, false);
	assert.match(r.output, /spawn failed/);
});
