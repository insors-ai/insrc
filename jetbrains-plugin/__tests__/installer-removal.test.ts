/** Retained client boundaries after removal of daemon installation/control features. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runFocusedJUnit } from '../test-bridge/run-focused-junit.js';

test('retained JetBrains status maintenance model settings and transport boundaries pass focused JUnit', { timeout: 300_000 }, () => {
  const classes = ['daemon.DaemonStatusGatewayTest', 'daemon.DaemonActionGatewayTest',
    'daemon.UnixSocketDaemonRpcParseTest', 'settings.ModelCheckFlowTest',
    'settings.InsrcSettingsConfigurableRestartTest', 'ops.DaemonPageTest', 'ops.DebugPageTest']
    .map(name => `ai.insors.insrc.jetbrains.${name}`);
  runFocusedJUnit(classes, process.env, directory => {
    const reports = readdirSync(directory).filter(name => name.startsWith('TEST-') && name.endsWith('.xml'));
    assert.equal(reports.length, classes.length);
    let tests = 0;
    for (const report of reports) {
      const xml = readFileSync(join(directory, report), 'utf8');
      assert.match(xml, /failures="0"/);
      assert.match(xml, /errors="0"/);
      assert.match(xml, /skipped="0"/);
      tests += Number(/tests="(\d+)"/.exec(xml)?.[1]);
    }
    assert.equal(tests, 42, 'every retained focused case must run');
  });
});
