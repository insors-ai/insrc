import { createConnection } from 'node:net';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setLogMode } from '../../../shared/logger.js';
setLogMode('mcp');
const { buildInsrcMcpServerWithRegistry }=await import('../../server.js');
const server=buildInsrcMcpServerWithRegistry({review:{connect:()=>createConnection(process.env['DESIGN_TEST_SOCKET']!),resolveRepo:async()=>process.env['DESIGN_TEST_REPO']}}).server;
await server.connect(new StdioServerTransport());
