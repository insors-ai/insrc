import {runFileRemoval} from './fixtures/file-removal-run.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CM-S3-FILES: native and converted actual source/compiled matrix, distinct rows, overbudget/unsupported negative controls', { timeout: 120000 }, async () => {
	for (const mode of ['source', 'compiled']) {
		const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
		const child = spawn(process.execPath, ['--import', 'tsx', '--test-reporter=tap', fileURLToPath(new URL('./fixtures/session-file-resources-child.ts', import.meta.url)), mode], { env: { ...process.env, ...baseline, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 50000);
		try {
			const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
			assert.equal(code, 0, output); assert.match(output, /# pass 6\b/); for (const key of ['fail', 'skipped', 'cancelled', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b'));
			assert.ok(output.includes('file-normal-trace-ok:' + mode)); assert.equal(output.includes('CM_FILE_PRIVATE_'), false);
		} finally { clearTimeout(timer); child.kill('SIGKILL'); }
	}
});

test('CM-S4-FILES/NO-PERSIST: actual source and compiled removal preserve native converted and directory inputs',{timeout:150000},async t=>{
 for(const mode of ['source','compiled'] as const)t.diagnostic(JSON.stringify(await runFileRemoval(mode)));
});
