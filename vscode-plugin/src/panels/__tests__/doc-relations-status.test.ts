/**
 * Epic c2ba6fa6, Story s10, t10 -- the VS Code Daemon tab's repository list
 * shows the model-proposed document links: the switch, the figures, and why new
 * documents are not examined when the provider is unavailable; nothing without
 * the field (a daemon before the change).
 *
 * Run: npx tsx --test src/panels/__tests__/doc-relations-status.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderDaemonTab } from '../detail-renderers.js';
import type { DaemonDataGateway } from '../types.js';

function fakeGateway(overrides: Partial<DaemonDataGateway> = {}): DaemonDataGateway {
  return {
    status: async () => ({ state: 'running' }),
    workflowChain: async () => ({ rows: [] }),
    mcpClients: async () => [],
    registeredRepos: async () => [],
    scanOrphans: async () => [],
    ...overrides,
  };
}
test('s10 t10: VS Code repositoryList renders docRelations states', async () => {
  const figures = { checked: 110, precision: 0.97, recall: 0.64, extractedRecovery: 1, modelId: 'm1', measuredAt: '2026-11-04T00:00:00.000Z' };
  const html = await renderDaemonTab(fakeGateway({ registeredRepos: async () => [
    { path: '/w/on', name: 'on', status: 'ready', docRelations: { switch: 'on', figures, extraction: { state: 'unavailable', reason: 'claude is not signed in', examined: 0, failed: 0, updatedAt: 'x' } } },
    { path: '/w/nm', name: 'nm', status: 'ready', docRelations: { switch: 'not-measured' } },
    { path: '/w/off', name: 'off', status: 'ready', docRelations: { switch: 'off', figures: { ...figures, recall: 0.4 }, extraction: { state: 'ok', examined: 3, failed: 0, updatedAt: 'x' } } },
    { path: '/w/old', name: 'old', status: 'ready' },
  ] }));
  const item = (name: string): string => new RegExp(`<li class="repo"><span class="repo-name"[^>]*>${name}</span>.*?</li>`).exec(html)?.[0] ?? '';
  assert.match(item('on'), /<p class="doc-relations unavailable">document links: on \(P 0\.97 \/ R 0\.64 on 110 links\); new documents not examined: claude is not signed in<\/p>/);
  assert.match(item('nm'), /<p class="doc-relations">document links: not-measured<\/p>/);
  assert.match(item('off'), /<p class="doc-relations">document links: off \(P 0\.97 \/ R 0\.40 on 110 links\)<\/p>/);
  assert.doesNotMatch(item('old'), /doc-relations/, 'nothing shown without the field (a daemon before the change)');
});
