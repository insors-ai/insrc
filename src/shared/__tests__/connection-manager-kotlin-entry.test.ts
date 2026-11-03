import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-ENTRY-KT: native Settings and AnAction actual Project selection, chooser cancel/no-project and global Apply/reset independence', { timeout: 180000 }, () => {
  const xml=readFileSync(new URL('../../../jetbrains-plugin/src/main/resources/META-INF/plugin.xml',import.meta.url),'utf8');
  assert.match(xml, /id="ai.insors.insrc.connections"[\s\S]*?instance="ai.insors.insrc.jetbrains.settings.ConnectionsConfigurable"/);
  assert.match(xml, /id="ai.insors.insrc.ManageConnections"[\s\S]*?class="ai.insors.insrc.jetbrains.actions.ManageConnectionsAction"/);
  assert.match(xml, /ai.insors.insrc.ShowOrRegisterRepo/);
  runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsEntryTest',3);
});
