// One live plan-tree run through the installed daemon. Every frame is kept whole.
import { createConnection } from 'node:net';
import { writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
const [label, target, scope, scopeKind, scopeValue, prompt = ''] = process.argv.slice(2);
const runId = `s2-live-${label}-${Date.now().toString(36)}`;
const out = `/tmp/s2-live/${label}`;
const params = { runId, userPrompt: prompt, scopeRef: { kind: scopeKind, value: scopeValue }, targetHint: target, ...(scope ? { scopeHint: scope } : {}) };
const started = new Date();
writeFileSync(`${out}.frames.jsonl`, '');
writeFileSync(`${out}.meta.json`, JSON.stringify({ label, runId, params, startedAt: started.toISOString() }, null, 2));
const socket = createConnection(`${homedir()}/.insrc/daemon.sock`);
let buffer = ''; let result; let frames = 0;
socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method: 'analyze.run.start', params, stream: true, client: { label: 's2-live-check', pid: process.pid } }) + '\n'));
socket.on('data', (chunk) => {
	buffer += chunk.toString();
	const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
	for (const line of lines) {
		if (!line.trim()) continue;
		appendFileSync(`${out}.frames.jsonl`, line + '\n'); frames += 1;
		let msg; try { msg = JSON.parse(line); } catch { continue; }
		if (msg.stream === 'analyze.result') result = msg.data;
		if (msg.stream === 'done' || msg.error !== undefined || (msg.result !== undefined && msg.stream === undefined)) {
			const ended = new Date();
			writeFileSync(`${out}.result.json`, JSON.stringify(result ?? msg, null, 2));
			writeFileSync(`${out}.meta.json`, JSON.stringify({ label, runId, params, startedAt: started.toISOString(), endedAt: ended.toISOString(), seconds: Math.round((ended - started) / 1000), frames }, null, 2));
			console.log(`DONE ${label} runId=${runId} seconds=${Math.round((ended - started) / 1000)} frames=${frames} ok=${result?.ok} stage=${result?.stage ?? ''} code=${result?.error?.code ?? ''}`);
			socket.end(); process.exit(0);
		}
	}
});
socket.on('error', (err) => { console.log('SOCKET ERROR', err.message); process.exit(2); });
socket.on('close', () => { console.log(`CLOSED ${label} without a done frame; frames=${frames}`); process.exit(3); });
