/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * INSRC_MCP_TOOL_ALLOWLIST (security review of Epic add-dedicated-security-reviews,
 * s3/t2): when set, registerAndRecord disables every registered tool not
 * named in the list, so a 'strict-read-analyze' CLI session's --mcp-config
 * (cli-provider.ts's strictMcpConfig) can confine THIS server itself to only
 * the two analyze tools -- closing the gap --allowedTools alone leaves open
 * (it pre-approves specific tools without a prompt; it never excludes the
 * server's other tools from being loaded/callable).
 * Run: npx tsx --test src/mcp/__tests__/tool-allowlist.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildInsrcMcpServerWithRegistry } from '../server.js';

test('INSRC_MCP_TOOL_ALLOWLIST unset: every tool is listed and enabled, exactly as today', async () => {
	delete process.env['INSRC_MCP_TOOL_ALLOWLIST'];
	const { server } = buildInsrcMcpServerWithRegistry();
	const client = new Client({ name: 'allowlist-unset', version: '1' });
	const [a, b] = InMemoryTransport.createLinkedPair();
	try {
		await server.connect(a); await client.connect(b);
		const names = (await client.listTools()).tools.map(t => t.name);
		assert.ok(names.includes('insrc_analyze'));
		assert.ok(names.includes('insrc_build_step'));
		assert.ok(names.includes('insrc_workflow_approve'));
	} finally { await client.close(); await server.close(); }
});

test('INSRC_MCP_TOOL_ALLOWLIST set to the two analyze tools: every OTHER tool is disabled (absent from tools/list), the allowlisted ones remain', async () => {
	process.env['INSRC_MCP_TOOL_ALLOWLIST'] = 'insrc_analyze,insrc_analyze_step';
	try {
		const { server } = buildInsrcMcpServerWithRegistry();
		const client = new Client({ name: 'allowlist-set', version: '1' });
		const [a, b] = InMemoryTransport.createLinkedPair();
		try {
			await server.connect(a); await client.connect(b);
			const names = (await client.listTools()).tools.map(t => t.name);
			assert.deepEqual(names.sort(), ['insrc_analyze', 'insrc_analyze_step']);
		} finally { await client.close(); await server.close(); }
	} finally { delete process.env['INSRC_MCP_TOOL_ALLOWLIST']; }
});

test('INSRC_MCP_TOOL_ALLOWLIST set: a disabled tool refuses an actual call, not just an absence from the list', async () => {
	process.env['INSRC_MCP_TOOL_ALLOWLIST'] = 'insrc_analyze,insrc_analyze_step';
	try {
		const { server } = buildInsrcMcpServerWithRegistry();
		const client = new Client({ name: 'allowlist-call-refused', version: '1' });
		const [a, b] = InMemoryTransport.createLinkedPair();
		try {
			await server.connect(a); await client.connect(b);
			const result = await client.callTool({ name: 'insrc_workflow_approve', arguments: {} }) as { isError?: boolean; content: { type: string; text: string }[] };
			assert.equal(result.isError, true);
			assert.match(result.content[0]!.text, /disabled/);
		} finally { await client.close(); await server.close(); }
	} finally { delete process.env['INSRC_MCP_TOOL_ALLOWLIST']; }
});
