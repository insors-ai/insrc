import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-COMPAT: both clients old/missing/malformed capability refusal, no legacy mutation fallback and unchanged legacy projections',{timeout:360000},()=>{
  const env={...process.env};delete env['NODE_TEST_CONTEXT'];delete env['NODE_CHANNEL_FD'];
  const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','--test-reporter=tap','vscode-plugin/src/connections/__tests__/compatibility.test.ts'],{env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,`TypeScript compatibility cases failed: ${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/# pass 5/);
  runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsCompatibilityTest',4);
  runConnectionJUnit('ai.insors.insrc.jetbrains.daemon.Sc2DaemonGatewayTest',3);
  runConnectionJUnit('ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpcParseTest',13);
});
