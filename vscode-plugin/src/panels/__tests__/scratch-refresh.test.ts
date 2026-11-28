import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScratchRefresh } from '../scratch-refresh.js';
test('scratch refresh coalesces save bursts and independently catches browse and menu failures without opening UI', async () => {
  let browse = 0, menu = 0; const warnings: string[] = [];
  const refresh = createScratchRefresh({ browse: async () => { browse++; throw new Error('browse unavailable'); }, menu: async () => { menu++; throw new Error('menu unavailable'); }, warn: message => warnings.push(message) });
  await Promise.all([refresh.request(), refresh.request(), refresh.request()]);
  assert.equal(browse, 1); assert.equal(menu, 1); assert.equal(warnings.length, 2);
  refresh.dispose(); await refresh.request(); assert.equal(browse, 1); assert.equal(menu, 1);
});
test('scratch refresh retains a save arriving during refresh and disposal stops the next consumer', async () => {
  let release!: () => void, browse = 0, menu = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const refresh = createScratchRefresh({ browse: async () => { browse++; if (browse === 1) await gate; }, menu: async () => { menu++; }, warn: () => {} });
  const first = refresh.request(); await Promise.resolve(); void refresh.request(); release(); await first;
  assert.equal(browse, 2); assert.equal(menu, 2);
  let stop!: () => void;
  const ending = createScratchRefresh({ browse: async () => { stop(); }, menu: async () => { throw new Error('disposed menu must not be reached'); }, warn: () => { throw new Error('no warning expected'); } });
  stop = () => ending.dispose(); await ending.request();
});


test('scratch refresh does not lose a request queued at completion of the prior pass', async () => {
  let menu = 0;
  const refresh = createScratchRefresh({ browse: async () => {}, menu: async () => {
    if (++menu === 1) queueMicrotask(() => queueMicrotask(() => { void refresh.request(); }));
  }, warn: () => {} });
  await refresh.request(); for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  assert.equal(menu, 2); refresh.dispose();
});
