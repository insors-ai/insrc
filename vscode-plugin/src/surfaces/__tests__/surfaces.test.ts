/**
 * Story E20260921ad0d45c9:S001 — sc2/sc3/sc4 surface tests (t3/t4/t5).
 * Each surface is exercised over a FAKE VS Code slice — no editor host needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStatusSurface, type DaemonUiState } from '../status-surface.js';
import { createCommandRegistry } from '../command-registry.js';
import { createConsentGate } from '../consent-gate.js';
import type { StatusBarHandle, DisposableLike } from '../types.js';

class FakeStatusBar implements StatusBarHandle {
  text = '';
  tooltip: string | undefined = undefined;
  shown = false;
  disposed = false;
  show(): void {
    this.shown = true;
  }
  dispose(): void {
    this.disposed = true;
  }
}

// ---- t3: sc2 StatusSurface -------------------------------------------------

test('StatusSurface renders each DaemonUiState and current() tracks the last snapshot', () => {
  const bar = new FakeStatusBar();
  const surface = createStatusSurface(bar);

  assert.ok(bar.shown, 'the status-bar item is shown on creation');
  assert.equal(surface.current().state, 'unknown');
  assert.match(bar.tooltip ?? '', /checking/);

  const cases: Array<[DaemonUiState, RegExp]> = [
    ['running', /running/],
    ['stopped', /stopped/],
    ['errored', /errored/],
  ];
  for (const [state, rx] of cases) {
    surface.set({ state });
    assert.equal(surface.current().state, state);
    assert.match(bar.tooltip ?? '', rx, `tooltip reflects ${state}`);
    assert.match(bar.text, /insrc/);
  }

  surface.set({ state: 'errored', detail: 'boom' });
  assert.match(bar.tooltip ?? '', /boom/, 'detail is surfaced in the tooltip');
});

// ---- t4: sc3 CommandRegistry -----------------------------------------------

test('CommandRegistry registers into the subscriptions sink and rejects a duplicate id', () => {
  const sink: DisposableLike[] = [];
  const registered: string[] = [];
  const registry = createCommandRegistry(
    (command) => {
      registered.push(command);
      return { dispose(): void {} };
    },
    sink,
  );

  registry.register({ id: 'insrc.daemon.start', title: 'Start insrc daemon' }, async () => {});
  assert.deepEqual(registered, ['insrc.daemon.start']);
  assert.equal(sink.length, 1, 'the Disposable is stored in the subscriptions sink');

  assert.throws(
    () => registry.register({ id: 'insrc.daemon.start', title: 'dup' }, async () => {}),
    /already registered/,
    'a duplicate InsrcCommandId is a guarded programming error',
  );
  assert.equal(sink.length, 1, 'the duplicate did not register a second Disposable');
});

// ---- t5: sc4 ConsentGate ---------------------------------------------------

test('ConsentGate maps the modal choice to accepted / declined / dismissed and has no side effect', async () => {
  const asked: Array<{ message: string; detail: string | undefined }> = [];
  const make = (answer: string | undefined) =>
    createConsentGate((message, options) => {
      asked.push({ message, detail: options.detail });
      return Promise.resolve(answer);
    });

  const req = { title: 'Install the insrc daemon?', detail: 'It provisions locally.', acceptLabel: 'Install' };

  assert.equal(await make('Install').ask(req), 'accepted');
  assert.equal(await make(undefined).ask(req), 'dismissed');
  assert.equal(await make('Cancel').ask(req), 'declined');

  // The prompt carries the detail; combined-consent items are appended.
  const withItems = await make('Wire').ask({
    title: 'Wire hosts?',
    detail: 'These assistants were detected:',
    acceptLabel: 'Wire',
    items: ['Copilot', 'Continue'],
  });
  assert.equal(withItems, 'accepted');
  assert.match(asked.at(-1)!.detail ?? '', /Copilot\nContinue/);
});
