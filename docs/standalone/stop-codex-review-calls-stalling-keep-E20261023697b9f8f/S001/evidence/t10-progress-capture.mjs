// t10 smoke (amended PLAN): capture the progress the controller receives during a
// real DEF review. Starts the INSTALLED insrc MCP server as a client would, calls
// insrc_review_step with a progress token, and records every notification.
// Run: node t10-progress-capture.mjs <out.json>
import { writeFileSync } from 'node:fs';
const D = process.env.HOME + '/.insrc/daemon';
const { Client } = await import(D + '/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');
const { StdioClientTransport } = await import(D + '/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');
const REPO = '/Users/subhagho/work/projects/insors/insrc';
const ARTIFACT = REPO + '/docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md';
const out = process.argv[2];
const transport = new StdioClientTransport({ command: process.execPath, args: [D + '/out/bin/insrc-mcp.js'], env: { ...process.env, INSRC_REPO: REPO }, stderr: 'ignore' });
const client = new Client({ name: 't10-progress-capture', version: '1' });
await client.connect(transport);
const started = Date.now();
const frames = [];
const record = { artifact: ARTIFACT, startedAt: new Date(started).toISOString(), frames };
const save = () => writeFileSync(out, JSON.stringify(record, null, 2));
try {
	const res = await client.callTool(
		{ name: 'insrc_review_step', arguments: { phase: 'start', artifact: ARTIFACT, repo: REPO } },
		undefined,
		{
			timeout: 95 * 60_000, resetTimeoutOnProgress: true,
			onprogress: p => { frames.push({ atMs: Date.now() - started, at: new Date().toISOString(), ...p }); save(); },
		},
	);
	const text = res.content?.[0]?.text ?? '';
	let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
	record.result = { isError: res.isError ?? false, next: body.next, verdict: body.verdict, counts: body.counts, reviewedBy: body.reviewedBy };
} catch (err) {
	record.error = String(err);
}
record.finishedAt = new Date().toISOString();
record.elapsedMs = Date.now() - started;
record.frameCount = frames.length;
let maxGap = 0; for (let i = 1; i < frames.length; i++) maxGap = Math.max(maxGap, frames[i].atMs - frames[i - 1].atMs);
record.maxGapMs = maxGap; record.firstFrameMs = frames[0]?.atMs ?? null;
save();
await client.close();
console.log(JSON.stringify({ frameCount: record.frameCount, maxGapMs: maxGap, elapsedMs: record.elapsedMs, result: record.result, error: record.error }));
