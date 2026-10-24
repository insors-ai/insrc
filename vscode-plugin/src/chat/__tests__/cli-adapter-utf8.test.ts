import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeSpawner } from '../cli-adapter.js';

test('CLI pipe fallback preserves UTF-8 across stdout lines and stderr chunks', async () => {
	const script = `const b=Buffer.from('—é🙂');let i=0;function next(){if(i===b.length){process.stdout.write('\\n');return;}process.stdout.write(b.subarray(i,i+1));process.stderr.write(b.subarray(i,i+1));i++;setTimeout(next,5);}next();`;
	const processHandle = nodeSpawner(process.execPath, ['-e', script], { cwd: process.cwd(), closeInput: true });
	assert.equal(await processHandle.spawnError, undefined);
	const lines: string[] = [];
	for await (const line of processHandle.lines()) lines.push(line);
	await processHandle.exit;
	assert.deepEqual(lines, ['—é🙂']); assert.equal(processHandle.stderr(), '—é🙂');
});
