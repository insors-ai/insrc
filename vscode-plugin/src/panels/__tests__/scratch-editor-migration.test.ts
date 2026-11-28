import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCRATCH_INTENT_TYPES } from '../../chat/scratch-host.js';
test('scratch migration removes every legacy document channel consumer and retains six chat intents with rich default', async () => {
  const retired = ['ScratchDocWebviewToHost', 'ScratchDocHostToWebview', 'documentBodyHtml', 'documentBootstrap', 'replySaved', 'onDocMessage', 'showingId', 'invalidateId', 'onScratchSave', 'onScratchDirty', 'onSendToChat', 'scratch-save', 'scratch-saved', 'scratch-dirty', 'scratch-ready', 'scratch-content', 'docGeneration', 'pendingContent'];
  for (const path of ['../../extension.ts', '../../chat/scratch-host.ts', '../scratch-panels.ts']) {
    const source = await readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    for (const name of retired) assert.equal(source.includes(name), false, `${path}: ${name}`);
  }
  assert.deepEqual([...SCRATCH_INTENT_TYPES].sort(), ['scratch-browse', 'scratch-delete', 'scratch-new', 'scratch-open', 'scratch-open-menu', 'send-to-chat']);
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'));
  const properties = Object.assign({}, ...manifest.contributes.configuration.map((group: { properties: unknown }) => group.properties));
  assert.equal(properties['insrc.scratchpads.richEditor'].default, true);
  assert.equal(manifest.contributes.customEditors[0].viewType, 'insrc.scratchpad.editor');
});
