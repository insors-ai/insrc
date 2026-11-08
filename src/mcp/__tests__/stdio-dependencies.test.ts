import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP SDK lists and calls a schema tool over stdio', { timeout: 15_000 }, async () => {
  const entry = fileURLToPath(new URL('../../bin/insrc-mcp.ts', import.meta.url));
  const client = new Client({ name: 'stdio-dependencies-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', entry],
    stderr: 'pipe',
  });
  transport.stderr?.resume();
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some(tool => tool.name === 'insrc_schema'));
    const result = await client.callTool({
      name: 'insrc_schema',
      arguments: { tool: 'insrc_build_step', phase: 'implement' },
    });
    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content));
    const content = result.content[0];
    assert.ok(content?.type === 'text' && typeof content.text === 'string');
    assert.ok(JSON.parse(content.text).schema);
  } finally {
    await client.close();
  }
});
