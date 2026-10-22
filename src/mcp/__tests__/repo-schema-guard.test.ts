/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The schema guard at the MCP server: the artifact tools refuse an unconverted repository; the tools that read no artifact still work.
 *
 * Run: npx tsx --test src/mcp/__tests__/repo-schema-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildInsrcMcpServer, handleInsrcPresent, handleWorkflowApprove } from '../server.js';

const NAMING = /schema version 1 but version 2 is needed.*repo\.convert/s;
const textOf = (r: { content?: unknown }): string => ((r.content as { text?: string }[] | undefined)?.[0]?.text ?? '').replace(/\\n/g, ' ');

test('repo-schema-guard.test.ts: the MCP artifact tools refuse an unconverted repository', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mcp-gate-'));
	const server = buildInsrcMcpServer();
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(a);
	const client = new Client({ name: 'schema-guard', version: '0' });
	await client.connect(b);
	try {
		const calls: [string, Record<string, unknown>][] = [
			['insrc_workflow_step', { phase: 'start', workflow: 'define', focus: 'x', repo }],
			['insrc_build_step', { phase: 'implement', target: 's1/t1', repo }],
			['insrc_review_step', { phase: 'start', artifact: 'x.md', repo }],
			['insrc_code_review_step', { phase: 'start', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', repo }],
			['insrc_triage', { phase: 'start', focus: 'x', repo }],
		];
		for (const [name, args] of calls) {
			const r = await client.callTool({ name, arguments: args });
			assert.equal(r.isError, true, name);
			assert.match(textOf(r), NAMING, `${name} names the conversion`);
		}
		assert.match(textOf(await handleWorkflowApprove({ epicHash: 'a3f4b8c9d1e2f3a4', repo })), NAMING, 'insrc_workflow_approve');
		assert.match(textOf(await handleInsrcPresent({ documents: ['LLD-a3f4b8c9d1e2f3a4-s1'], repo })), NAMING, 'insrc_present');

		// the tools that read no artifact still work
		const schema = await client.callTool({ name: 'insrc_schema', arguments: {} });
		assert.doesNotMatch(textOf(schema), NAMING);
		const guide = await client.callTool({ name: 'insrc_guide', arguments: {} });
		assert.doesNotMatch(textOf(guide), NAMING);
	} finally {
		await client.close(); await server.close();
		rmSync(repo, { recursive: true, force: true });
	}
});
