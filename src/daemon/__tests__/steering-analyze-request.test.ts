/**
 * The steering text tells agents to send the structured analyze request and
 * keeps the search-versus-analysis rule (Story 65b643840a294422/s1, task t18).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildInsrcMcpServer } from '../../mcp/server.js';
import { injectSteeringBlock, readSteeringBlock, stripGuideSections, gateRequestGuidance } from '../steering-inject.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const flat = (s: string): string => s.replace(/\s+/g, ' ');

test('the injected skeleton from steering-block.md, the template and both tool descriptions tell agents to send the request object and keep the decision rule', async () => {
	// The skeleton an agent's CLAUDE.md receives, through the real injection path.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-steering-request-'));
	try {
		writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
		const out = await injectSteeringBlock(dir, { claude: true, agents: false });
		assert.equal(out.files[0]!.action, 'created');
		const injected = flat(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'));

		assert.match(injected, /Send a structured `request`, not just the prompt/);
		assert.match(injected, /request: \{ question, scopeRef: \{ kind, value \}/);
		assert.match(injected, /ABSOLUTE path/);
		assert.match(injected, /scope-not-found/);
		assert.match(injected, /scope-repo-mismatch/);
		assert.match(injected, /A `focus`-only call still works/);
		// The request guidance sits beside the rule that chooses the analyzer, and that rule is intact.
		assert.match(injected, /could a text match alone give a wrong or incomplete answer\?/);
		assert.match(injected, /Don't run the analyzer for a lookup, and don't answer a relationship question from a text match alone/);
		assert.ok(injected.indexOf('could a text match alone') < injected.indexOf('Send a structured `request`'));
		assert.equal(injected.includes('insrc:analyze-request'), false, 'the region markers are not left in the injected text');
		// Per-workflow guide sections still stay out of the skeleton.
		assert.equal(injected.includes('insrc:guide:'), false);
	} finally { rmSync(dir, { recursive: true, force: true }); }

	// The template says the same, and records the rollout.
	const template = flat(readFileSync(join(HERE, '..', '..', 'mcp', 'steering-template.md'), 'utf8'));
	assert.match(template, /structured `request`/);
	assert.match(template, /rule for choosing between `Grep`\/`Read` and the analyzer/);
	assert.match(template, /`zeroDowntime` is false/);
	assert.match(template, /update the MCP processes first/);

	// Both tool descriptions, as the server registers them.
	const server = buildInsrcMcpServer();
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(a);
	const client = new Client({ name: 'steering-request', version: '0' });
	await client.connect(b);
	try {
		const { tools } = await client.listTools();
		for (const name of ['insrc_analyze', 'insrc_analyze_step']) {
			const t = tools.find(x => x.name === name)!;
			assert.match(flat(t.description ?? ''), /`request`/, `${name} description`);
			assert.match(flat(t.description ?? ''), /scopeRef/, `${name} description`);
			// ... and the rule that chooses between a text search and the analyzer, not a blanket "grep + read" substitute.
			assert.match(flat(t.description ?? ''), /text match alone/, `${name} keeps the decision rule`);
			assert.match(flat(t.description ?? ''), /Use Read\/Grep\/Glob instead when a text match alone answers it/, `${name} sends plain lookups to the file tools`);
			assert.equal(/rather than manual grep \+ read|otherwise grep \+ read/.test(flat(t.description ?? '')), false, `${name} no longer says to replace grep + read wholesale`);
		}
	} finally { await client.close(); await server.close(); }

	// The whole canonical text still serves insrc_guide: the guide sections are not stripped there.
	assert.ok(stripGuideSections(readSteeringBlock()).length < readSteeringBlock().length);
	assert.equal(gateRequestGuidance('a\n<!-- insrc:analyze-request:start -->\nX\n<!-- insrc:analyze-request:end -->\nb\n', true), 'a\nX\nb\n');
});
