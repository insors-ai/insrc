/**
 * The hosts op of gh_auth: `gh auth status --json hosts`, parsed with no model call (the add-json-hosts-form-gh-auth Story).
 * Run: npx tsx --test-force-exit src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { Value } from '@sinclair/typebox/value';

import { cleanup } from '../../../__tests__/_proc.js';
import { installStandInBin } from '../../../__tests__/_bin.js';
import type { StandInBin } from '../../../__tests__/_bin.js';
import { ghAuthTool } from '../account.js';
import { ghApprovalClass, ghTimeoutMs, registerGhLimits } from '../helpers.js';
import { installFakeGh } from './_fakegh.js';

const T = 'src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts';
const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, conversion: undefined };
const HOSTS = { hosts: { 'github.com': [{ state: 'success', login: 'octocat', active: true, tokenSource: 'keyring' }] } };

let bin: StandInBin | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; });

/** A gh that prints `script`'s output; the script runs under sh. */
const gh = (script: string): StandInBin => { bin = installStandInBin('gh', script); return bin; };
const run = () => ghAuthTool.execute({ op: 'hosts' }, deps);
/** A JSON document of exactly `bytes` bytes whose login holds multibyte text (three bytes a character) padded with ASCII. */
function sized(bytes: number, multibyte: boolean): string {
	const head = '{"hosts":{"h":[{"state":"success","login":"';
	const tail = '"}]}}';
	const room = bytes - head.length - tail.length;
	const login = multibyte ? '€'.repeat(Math.floor(room / 3)) + 'a'.repeat(room % 3) : 'a'.repeat(room);
	return head + login + tail;
}
/** The text exactly, with no trailing newline (the JSON has no single quote). */
const puts = (text: string): string => `printf '%s' '${text}'`;

test(`${T}: the hosts op runs exactly \`gh auth status --json hosts\` with a 15 s limit and no other argument, and returns the hosts object as gh printed it with extra account fields kept`, async () => {
	const b = gh(puts(JSON.stringify(HOSTS)));
	const r = await run();
	assert.equal(r.success, true, r.output);
	assert.deepEqual(b.calls(), ['auth status --json hosts']);
	assert.equal(ghTimeoutMs({ toolId: 'gh_auth', op: 'hosts' }), 15_000);
	assert.deepEqual((r.data as { hosts: unknown }).hosts, HOSTS.hosts, 'tokenSource and active are kept');
	assert.equal((r.data as { op: string }).op, 'hosts');
});

test(`${T}: a missing gh, a timeout, a non-zero exit (including unknown flag --json), a cut capture and output over 256 KB are five different diagnostics (kinds missing-tool, timed-out, rejected for the non-zero exit, rejected for the cut capture, rejected for the over-size output, each with its own message) and a network failure is kind unreachable, and nothing is returned as data`, async () => {
	const seen: Array<{ kind: string | undefined; message: string }> = [];
	const record = (r: Awaited<ReturnType<typeof run>>) => {
		assert.equal(r.success, false);
		assert.equal(r.data, undefined, 'nothing is returned as data');
		seen.push({ kind: r.failure?.kind, message: r.failure?.message ?? '' });
	};
	// a missing gh
	const saved = process.env['PATH']; process.env['PATH'] = '/nonexistent';
	try { record(await run()); } finally { process.env['PATH'] = saved; }
	// a timeout: the limit is lowered for this test and restored afterwards
	registerGhLimits({ 'gh_auth.hosts': 1 });
	try { gh('sleep 5'); record(await run()); } finally { registerGhLimits({ 'gh_auth.hosts': 15 }); bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; }
	// a gh without --json
	gh("echo 'unknown flag: --json' >&2; exit 1"); record(await run()); bin?.restore(); bin = undefined;
	// a network failure
	gh("echo 'dial tcp: lookup api.github.com: no such host' >&2; exit 1"); record(await run()); bin?.restore(); bin = undefined;
	// a cut capture: more than the 4 MiB capture cap
	gh('head -c 4300000 /dev/zero | tr "\\0" a'); record(await run()); bin?.restore(); bin = undefined;
	// over 256 KB but under the capture cap
	gh(puts(sized(256 * 1024 + 1, false))); record(await run());
	assert.deepEqual(seen.map(s => s.kind), ['missing-tool', 'timed-out', 'rejected', 'unreachable', 'rejected', 'rejected']);
	assert.match(seen[1]!.message, /timed out after 1 s/);
	assert.match(seen[2]!.message, /unknown flag/);
	assert.match(seen[4]!.message, /cut at the capture cap/);
	assert.match(seen[5]!.message, /more than 256 KB/);
	assert.equal(new Set(seen.map(s => s.message)).size, seen.length, 'every diagnostic has its own message');
});

test(`${T}: valid JSON whose account fields hold multibyte text is accepted at exactly 262144 bytes and refused at 262145 bytes even when its character count is below 262144`, async () => {
	const at = sized(262144, true);
	assert.equal(Buffer.byteLength(at, 'utf8'), 262144);
	assert.ok(at.length < 262144, 'fewer characters than bytes');
	gh(puts(at));
	assert.equal((await run()).success, true);
	bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined;
	const over = sized(262145, true);
	assert.equal(Buffer.byteLength(over, 'utf8'), 262145);
	assert.ok(over.length < 262144, 'still fewer characters than 262144');
	gh(puts(over));
	const r = await run();
	assert.equal(r.success, false);
	assert.match(r.failure?.message ?? '', /more than 256 KB/);
});

test(`${T}: a gh that outlives the hosts limit (lowered through registerGhLimits for the test, restored afterwards) is a timed-out failure that names the command and the limit`, async () => {
	registerGhLimits({ 'gh_auth.hosts': 1 });
	try {
		gh('sleep 5');
		const r = await run();
		assert.equal(r.failure?.kind, 'timed-out');
		assert.match(r.failure?.message ?? '', /gh auth status --json hosts timed out after 1 s/);
	} finally { registerGhLimits({ 'gh_auth.hosts': 15 }); }
	assert.equal(ghTimeoutMs({ toolId: 'gh_auth', op: 'hosts' }), 15_000, 'restored');
});

test(`${T}: output of exactly 256 KB is accepted and output of 256 KB plus one byte is refused`, async () => {
	gh(puts(sized(256 * 1024, false)));
	assert.equal((await run()).success, true);
	bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined;
	gh(puts(sized(256 * 1024 + 1, false)));
	assert.equal((await run()).success, false);
});

test(`${T}: output that is not JSON, has no hosts object, or has an account without a string state or login is refused with no partial data`, async () => {
	for (const body of ['not json', '[]', '{"other":{}}', '{"hosts":[]}', '{"hosts":{"h":"x"}}', '{"hosts":{"h":[{"state":"success"}]}}', '{"hosts":{"h":[{"login":"a"}]}}', '{"hosts":{"h":[{"state":1,"login":"a"}]}}', '{"hosts":{"ok":[{"state":"success","login":"a"}],"bad":[null]}}']) {
		gh(puts(body));
		const r = await run();
		assert.equal(r.success, false, body);
		assert.equal(r.failure?.kind, 'rejected', body);
		assert.equal(r.data, undefined, `${body}: no partial hosts`);
		bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined;
	}
});

test(`${T}: an empty hosts object and a host with no accounts are accepted`, async () => {
	for (const [body, expected] of [['{"hosts":{}}', {}], ['{"hosts":{"github.com":[]}}', { 'github.com': [] }]] as const) {
		gh(puts(body));
		const r = await run();
		assert.equal(r.success, true, r.output);
		assert.deepEqual((r.data as { hosts: unknown }).hosts, expected);
		bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined;
	}
});

test(`${T}: the ops status, switch and logout still have their commands, fields, 30 s limits, approval classes and output shapes, and the hosts op makes no model call`, async () => {
	const ops = Object.fromEntries(ghAuthTool.ops.map(o => [o.name, o]));
	assert.deepEqual(Object.keys(ops).sort(), ['hosts', 'logout', 'status', 'switch']);
	assert.equal(ghAuthTool.id, 'gh_auth');
	for (const name of ['status', 'switch', 'logout']) {
		assert.deepEqual(ops[name]!.command, ['auth', name === 'status' ? 'status' : name]);
		assert.equal(ghTimeoutMs({ toolId: 'gh_auth', op: name }), 30_000, `${name}: 30 s`);
	}
	assert.deepEqual(Object.keys(ops['status']!.fields ?? {}), ['hostname']);
	assert.deepEqual(Object.keys(ops['switch']!.fields ?? {}), ['hostname', 'user']);
	assert.deepEqual(Object.keys(ops['logout']!.fields ?? {}), ['hostname', 'user']);
	assert.equal(ghApprovalClass('gh_auth', { op: 'status' }), 'none');
	assert.equal(ghApprovalClass('gh_auth', { op: 'switch', hostname: 'h', user: 'u' }), 'common');
	assert.equal(ghApprovalClass('gh_auth', { op: 'logout', hostname: 'h', user: 'u' }), 'destructive');
	assert.equal(ghApprovalClass('gh_auth', { op: 'hosts' }), 'none');
	assert.equal(ops['status']!.out.kind, 'custom');
	assert.deepEqual(Object.keys((ops['status']!.out as { shape: object }).shape), ['hosts']);
	// the hosts op needs no conversion providers: with none supplied it still succeeds
	const fake = installFakeGh('ok', JSON.stringify(HOSTS));
	try {
		const r = await ghAuthTool.execute({ op: 'hosts' }, { ...deps, conversion: undefined });
		assert.equal(r.success, true, r.output);
		assert.ok(Value.Check(ghAuthTool.outputSchema!, r.data));
	} finally { fake.restore(); }
});
