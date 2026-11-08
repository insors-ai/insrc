import { resolve } from 'node:path';
import { createConnection } from 'node:net';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const compiled=process.env['DESIGN_TEST_COMPILED']==='1';
const {setLogMode}=await import(compiled?resolve('out/shared/logger.js'):'../../../shared/logger.js');setLogMode('mcp');
const {PATHS}=await import(compiled?resolve('out/shared/paths.js'):'../../../shared/paths.js');
PATHS.sockFile=process.env['DESIGN_TEST_SOCKET']!; // Isolate every registered unary tool in this fixture process.
const { buildInsrcMcpServerWithRegistry }=await import(compiled?resolve('out/mcp/server.js'):'../../server.js');
const server=buildInsrcMcpServerWithRegistry({review:{connect:()=>createConnection(process.env['DESIGN_TEST_SOCKET']!),resolveRepo:async()=>process.env['DESIGN_TEST_REPO']}}).server;
await server.connect(new StdioServerTransport());
