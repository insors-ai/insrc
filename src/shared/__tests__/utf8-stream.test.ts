import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { onUtf8Data } from '../utf8-stream.js';
import { runShell } from '../../daemon/tools/shell-helper.js';
import { shellExecDetachedTool } from '../../daemon/tools/builtins/shell/exec-detached.js';
import { testWatchTool } from '../../daemon/tools/builtins/test/index.js';
import { k8sLogsTool, k8sExecTool, k8sPortForwardTool } from '../../daemon/tools/builtins/k8s/index.js';
import { sshExecDetachedTool, sshPortForwardTool } from '../../daemon/tools/builtins/ssh/index.js';
import { awsLogsTailTool } from '../../daemon/tools/builtins/cloud/aws/logs.js';
import { graphvizSubprocessRenderer } from '../../docgen/render/fallback.js';
import type { Tool, ToolDeps, ToolInput } from '../../daemon/tools/types.js';

const TEXT = '—é🙂';
const pieces = (text: string): Buffer[] => Array.from(Buffer.from(text), b => Buffer.from([b]));

test('UTF-8 text survives every byte boundary, stream state stays independent and byte counts stay raw', async () => {
	const a = Readable.from(pieces(TEXT)), b = Readable.from(pieces('漢字'));
	let first = '', second = '', bytes = 0;
	onUtf8Data(a, (s, n) => { first += s; bytes += n; });
	onUtf8Data(b, s => { second += s; });
	await Promise.all([new Promise(r => a.on('end', r)), new Promise(r => b.on('end', r))]);
	assert.equal(first, TEXT); assert.equal(second, '漢字'); assert.equal(bytes, Buffer.byteLength(TEXT));
});

test('an incomplete final UTF-8 sequence is flushed once at end, without adding raw bytes', async () => {
	const stream = Readable.from([Buffer.from([0xe2, 0x80])]);
	let text = '', bytes = 0;
	onUtf8Data(stream, (s, n) => { text += s; bytes += n; });
	await new Promise(r => stream.on('end', r));
	assert.equal(text, '\ufffd'); assert.equal(bytes, 2);
});

const require = createRequire(import.meta.url);
const cp = require('node:child_process') as typeof import('node:child_process');

async function withOutput<T>(code: number, stdout: string, stderr: string, run: () => Promise<T>): Promise<T> {
	const replacement = mock.method(cp, 'spawn', () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: Readable.from(pieces(stdout)), stderr: Readable.from(pieces(stderr)),
			stdin: new PassThrough(), kill: () => true,
		});
		let ended = 0;
		const end = () => { if (++ended === 2) setImmediate(() => { child.emit('exit', code, null); child.emit('close', code, null); }); };
		child.stdout.on('end', end); child.stderr.on('end', end);
		setImmediate(() => { child.stdout.resume(); child.stderr.resume(); });
		return child as unknown as ReturnType<typeof cp.spawn>;
	});
	syncBuiltinESMExports();
	try { return await run(); }
	finally { replacement.mock.restore(); syncBuiltinESMExports(); }
}

test('runShell decodes both streams across chunks and preserves byte-based output limits', async () => {
	const out = await withOutput(0, TEXT, TEXT, () => runShell(['fake']));
	assert.equal(out.stdout, TEXT); assert.equal(out.stderr, TEXT);
	const capped = await withOutput(0, 'ééé', '', () => runShell(['fake'], { maxBytes: 4 }));
	assert.equal(capped.stdout, 'éé'); assert.equal(capped.stdoutTruncated, true);
});

const cases: [Tool, ToolInput][] = [
	[shellExecDetachedTool, { argv: ['fake'] }],
	[testWatchTool, { argv: ['fake'] }],
	[k8sLogsTool, { pod: 'fake', follow: true }],
	[k8sExecTool, { pod: 'fake', command: ['fake'] }],
	[k8sPortForwardTool, { resource: 'pod/fake', mappings: ['8080:80'] }],
	[sshExecDetachedTool, { host: 'fake', command: 'fake' }],
	[sshPortForwardTool, { host: 'fake', localPort: 8080, remotePort: 80, remoteHost: 'fake' }],
	[awsLogsTailTool, { logGroup: 'fake', follow: true }],
];
for (const [tool, input] of cases) test(`${tool.id} preserves split UTF-8 in its subprocess output`, async () => {
	const messages: string[] = [];
	const deps: ToolDeps = { sessionId: 'utf8', repoPath: '/tmp', requestId: 1, send: frame => { messages.push(String((frame as { data?: { message?: unknown } }).data?.message ?? '')); } };
	const result = await withOutput(1, TEXT + '\n', TEXT + '\n', () => tool.execute(input, deps));
	const shown = messages.join('').replaceAll('[stderr] ', '') + result.output;
	assert(shown.includes(TEXT), shown);
	assert(!shown.includes('\ufffd'), shown);
});

test('Graphviz subprocess preserves split UTF-8 in SVG and failure diagnostics', async () => {
	const success = await withOutput(0, `<svg>${TEXT}</svg>`, '', () => graphvizSubprocessRenderer.renderSvg('digraph {}'));
	assert.equal(success.status, 'ok');
	if (success.status === 'ok') assert.equal(success.svg, `<svg>${TEXT}</svg>`);
	const failure = await withOutput(1, '', TEXT, () => graphvizSubprocessRenderer.renderSvg('digraph {}'));
	assert.equal(failure.status, 'unavailable');
	assert(JSON.stringify(failure).includes(TEXT)); assert(!JSON.stringify(failure).includes('\ufffd'));
});
