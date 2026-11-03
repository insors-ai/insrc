import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CONNECTION_COMMANDS, registerConnectionCommands } from '../wiring.js';
import { ConnectionsManagerHost } from '../host.js';
import { managementFixture } from './fixtures/management.js';
import { FakeConnectionPanel } from './fixtures/renderer.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';

test('CM-S5-ENTRY-TS: manifest Settings discovery and palette/editor route equivalence with explicit registered roots', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  const descriptions = manifest.contributes.configuration.flatMap((section: any) => Object.values(section.properties)) as any[];
  assert.ok(descriptions.some(row => /insrc connections/.test(row.markdownDescription ?? '') && row.markdownDescription.includes('[Manage Connections](command:insrc.openDataSources)')));
  const declared = manifest.contributes.commands.map((row: any) => row.command);
  assert.equal(new Set(declared).size, declared.length);
  for (const [id] of CONNECTION_COMMANDS) assert.ok(declared.includes(id));
  // No dummy persisted connection setting was introduced for navigation.
  assert.ok(!manifest.contributes.configuration.some((section: any) => Object.keys(section.properties).some(key => key.startsWith('insrc.connections.'))));

  const f = await managementFixture(), probes = createConnectionsDraftTests(f.owner), removals = new ConnectionRemovals(f.controller);
  const panels: FakeConnectionPanel[] = [], callbacks = new Map<string, () => Promise<void>>();
  let roots: readonly string[] = [], reads = 0;
  const host = new ConnectionsManagerHost({ owner: f.owner, mutations: f.controller, tests: probes, removals,
    registeredRoots: async () => { reads++; return roots; }, createPanel: () => { const panel = new FakeConnectionPanel(); panels.push(panel); return panel; } });
  const registrations = registerConnectionCommands((id, run) => { assert.ok(!callbacks.has(id)); callbacks.set(id, run); return { dispose: () => { callbacks.delete(id); } }; }, host);
  try {
    await callbacks.get('insrc.openDataSources')!();
    assert.equal(panels[0]!.view.list.listState, 'no-repository');
    assert.deepEqual(panels[0]!.view.list.roots, []);
    panels[0]!.dispose(); roots = [f.f.root, '/synthetic-other-registered-root'];
    await callbacks.get('insrc.connections.add')!();
    const panel = panels[1]!;
    assert.equal(panel.view.list.listState, 'no-repository');
    assert.equal(panel.view.list.repoRoot, null);
    panel.dom!.choose('root', f.f.root);
    const deadline = Date.now() + 8000;
    while (!['ready', 'empty-registry'].includes(panel.view.list.listState)) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 5)); }
    panel.dom!.click('add'); panel.dom!.input('id', 'retained-entry-draft');
    const calls = f.calls.length;
    for (const [id] of CONNECTION_COMMANDS) {
      // A forged command argument cannot save, test, remove or select a root.
      await (callbacks.get(id)! as (...args: unknown[]) => Promise<void>)({ repoRoot: '/unregistered', scope: 'temporary', id: 'forged', ticket: 'forged' });
      assert.equal(panel.view.draft?.key.id, 'retained-entry-draft');
      assert.equal(panel.view.list.repoRoot, f.f.root);
    }
    assert.equal(panels.length, 2); assert.equal(reads, 2); assert.equal(f.calls.length, calls);
    registrations.dispose(); assert.equal(callbacks.size, 0);
    const activation = readFileSync(new URL('../../extension.ts', import.meta.url), 'utf8');
    assert.match(activation, /registerConnectionCommands/); assert.match(activation, /daemonData.registeredRepos\(\)/);
    assert.match(activation, /localResourceRoots: \[\]/);
    const connectionsPanel=activation.slice(activation.indexOf("createWebviewPanel('insrc.connections'"),activation.indexOf('context.subscriptions.push(connectionManager'));
    assert.match(connectionsPanel,/panel.iconPath =/);
    assert.match(activation,/pickFile: async \(\) => \(await vscode\.window\.showOpenDialog\(\{ canSelectMany: false, openLabel: 'Use file' \}\)\)\?\.\[0\]\?\.fsPath/);
    for(const filename of ['connections-icon.svg','connections-icon-dark.svg']){
      assert.ok(connectionsPanel.includes(filename));
      const svg=readFileSync(new URL('../../../media/'+filename,import.meta.url),'utf8');
      assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|href=/);
    }
  } finally { registrations.dispose(); host.dispose(); probes.dispose(); removals.dispose(); await f.close(); }
});
