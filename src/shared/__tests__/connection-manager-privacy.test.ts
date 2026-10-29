import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-PRIVACY: actual client adapters poison/count persistence/log/telemetry/artifact sinks and verify zero temporary leakage',{timeout:240000},()=>{
  const env={...process.env};delete env['NODE_TEST_CONTEXT'];delete env['NODE_CHANNEL_FD'];
  const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','--test-reporter=tap','vscode-plugin/src/connections/__tests__/privacy.test.ts'],{env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,'Actual TypeScript privacy adapter cases must pass');
  assert.match(result.stdout,/# pass 3/);assert.match(result.stdout,/# fail 0/);
  const report=runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsPrivacyTest',2);
  // Capture actual stdout/stderr plus native JUnit log sinks; never echo payloads on failure.
  const captured=result.stdout+result.stderr+report;
  assert.ok(!/s5-(?:native-)?private-(?:endpoint|label|credential|source|capability)-canary/.test(captured),'Private canaries reached a captured log/artifact sink');
});
