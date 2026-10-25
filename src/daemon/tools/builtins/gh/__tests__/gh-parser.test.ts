import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as account from '../account.js';
import * as manage from '../manage.js';
import { buildArgv, refuseInput } from '../op-table.js';
import type { GhFamilyTool, OpDef } from '../op-table.js';
import * as resources from '../resources.js';

const FAMILIES = Object.values({ ...manage, ...resources, ...account }) as GhFamilyTool[];

/** A representative value for one field: the first enum member, the integer 1, a duration, a port pair, else a placeholder. */
function sample(name: string, spec: NonNullable<OpDef['fields']>[string]): unknown {
	switch (spec.kind) {
		case 'integer': return 1;
		case 'boolean': return true;
		case 'strings': return name === 'ports' ? ['8080:public'] : ['x'];
		case 'enum': return spec.values![0];
		case 'enums': return [spec.values![0]];
		case 'expr': return '>1';
		default: return name === 'idleTimeout' || name === 'retentionPeriod' ? '10m' : 'x';
	}
}

/** The minimal valid input of an op, and that input with each optional field added on its own. */
function inputsOf(def: OpDef): Array<Record<string, unknown>> {
	const fields = def.fields ?? {};
	const base: Record<string, unknown> = { op: def.name };
	for (const k of def.required ?? []) { base[k] = sample(k, fields[k]!); }
	for (const g of [...(def.oneOf ?? []), ...(def.atLeastOne ?? [])]) {
		if (!g.some(k => base[k] !== undefined)) { base[g[0]!] = sample(g[0]!, fields[g[0]!]!); }
	}
	const out = [base];
	for (const k of Object.keys(fields)) {
		if (base[k] === undefined) { out.push({ ...base, [k]: sample(k, fields[k]!) }); }
	}
	if (def.repo === true) { out.push({ ...base, repo: 'o/r' }); }
	return out.filter(i => refuseInput(def, i) === undefined);
}

/** A port nothing listens on: bind one, then close it. */
async function closedPort(): Promise<number> {
	const server = createServer();
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as { port: number }).port;
	await new Promise<void>(resolve => server.close(() => resolve()));
	return port;
}

test('gh-parser.test.ts: every op\'s argv with --help as its own final token parses against the installed gh under an empty HOME, no token and a closed-port proxy, and the gh issue delete 1 --help canary makes no request', async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-ghparse-'));
	const dead = await closedPort();
	// a proxy that is listening, to count requests the canary would make
	let connections = 0;
	const watcher = createServer(socket => { connections += 1; socket.destroy(); });
	await new Promise<void>(resolve => watcher.listen(0, '127.0.0.1', resolve));
	const watched = (watcher.address() as { port: number }).port;
	const env = (port: number) => ({ PATH: process.env['PATH'] ?? '', HOME: home, GH_CONFIG_DIR: home, HTTPS_PROXY: `http://127.0.0.1:${port}`, HTTP_PROXY: `http://127.0.0.1:${port}` });
	const help = (argv: string[], port: number) => spawnSync('gh', argv, { env: env(port), encoding: 'utf8', timeout: 20_000 });

	try {
		// the canary: a mutating command with --help prints help and returns before its body
		const canary = help(['issue', 'delete', '1', '--help'], watched);
		assert.equal(canary.status, 0, canary.stderr);
		assert.match(canary.stdout, /USAGE/);
		await new Promise(resolve => setTimeout(resolve, 300)); // the proxy server lives in this process: let it see any connection
		assert.equal(connections, 0, 'the canary made no request');
		// the detector works: a call that does make a request reaches the proxy
		const control = spawnSync('gh', ['api', 'rate_limit'], { env: { ...env(watched), GH_TOKEN: 'x' }, encoding: 'utf8', timeout: 20_000 });
		void control;
		await new Promise(resolve => setTimeout(resolve, 300));
		assert.ok(connections > 0, 'a real request is seen by the proxy');
		connections = 0;

		let checked = 0;
		const bad: string[] = [];
		for (const tool of FAMILIES) {
			for (const def of tool.ops) {
				for (const input of inputsOf(def)) {
					const argv = buildArgv(def, input).slice(1);
					// --help is its own final token (a search query is a plain positional unless it starts with '-')
					const withHelp = [...argv, '--help'];
					const r = help(withHelp, dead);
					checked += 1;
					if (r.status !== 0 || !/USAGE/.test(r.stdout) || /unknown flag|unknown command|accepts at most|requires at least/.test(`${r.stderr}${r.stdout}`)) {
						bad.push(`${tool.id}.${def.name}: gh ${withHelp.join(' ')} => ${(r.stderr || r.stdout).split('\n')[0]}`);
					}
				}
			}
		}
		assert.deepEqual(bad, []);
		assert.ok(checked > 300, `checked ${checked} argvs`);
		// the canary again under the closed-port proxy of the matrix
		assert.equal(help(['issue', 'delete', '1', '--help'], dead).status, 0);
	} finally { await new Promise<void>(resolve => watcher.close(() => resolve())); }
});
