/**
 * Story E20261004c4c420c2:S001 — chat group lock unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/group-lock.test.ts
 *
 * Pins when the lock command is issued, with a fake panel + fake tab source and the
 * REAL isChatTabInput (never a stubbed predicate). No vscode runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatGroupLock, isChatTabInput, type LockablePanel } from '../group-lock.js';
import { CHAT_VIEW_TYPE } from '../chat-panel.js';

const CHAT_TAB = { viewType: `mainThreadWebview-${CHAT_VIEW_TYPE}` };
const DOCS_REVIEW_TAB = { viewType: 'mainThreadWebview-insrc.docsReviewPanel' };
const TEXT_TAB = { uri: 'file:///a.ts' };

/** A live-subscription-counting event source with a manual fire(). */
function emitter(): { on: (l: () => unknown) => { dispose(): void }; fire: () => void; live: () => number } {
  const listeners = new Set<() => unknown>();
  return {
    on: (l) => {
      listeners.add(l);
      return { dispose: () => void listeners.delete(l) };
    },
    fire: () => {
      for (const l of [...listeners]) l();
    },
    live: () => listeners.size,
  };
}

interface Harness {
  panel: LockablePanel;
  setActive(active: boolean): void;
  setTab(input: unknown): void;
  setEnabled(enabled: boolean): void;
  viewState: ReturnType<typeof emitter>;
  tabs: ReturnType<typeof emitter>;
  disposePanel(): void;
  locks(): number;
  warnings: string[];
  /** Settle the in-flight lock command(s). */
  settle(): void;
  attach(): void;
}

function harness(opts?: {
  active?: boolean;
  tab?: unknown;
  enabled?: boolean;
  lock?: 'pending' | 'reject' | 'throw';
  enabledThrowsOnce?: boolean;
  tabThrowsOnce?: boolean;
}): Harness {
  let active = opts?.active ?? false;
  let tab: unknown = opts?.tab;
  let enabled = opts?.enabled ?? true;
  let enabledThrows = opts?.enabledThrowsOnce ?? false;
  let tabThrows = opts?.tabThrowsOnce ?? false;
  let locks = 0;
  const warnings: string[] = [];
  const viewState = emitter();
  const tabs = emitter();
  const disposeListeners: Array<() => unknown> = [];
  const pending: Array<() => void> = [];

  const panel: LockablePanel = {
    get active() {
      return active;
    },
    onDidChangeViewState: (l) => viewState.on(l),
    onDidDispose: (l) => void disposeListeners.push(l),
  };
  const lock = createChatGroupLock({
    enabled: () => {
      if (enabledThrows) {
        enabledThrows = false;
        throw new Error('config boom');
      }
      return enabled;
    },
    viewType: CHAT_VIEW_TYPE,
    activeTabInput: () => {
      if (tabThrows) {
        tabThrows = false;
        throw new Error('tabs boom');
      }
      return tab;
    },
    onTabsChanged: (l) => tabs.on(l),
    lockActiveGroup: () => {
      locks += 1;
      if (opts?.lock === 'throw') throw new Error('no such command');
      if (opts?.lock === 'reject') return Promise.reject(new Error('command rejected'));
      return new Promise<void>((resolve) => pending.push(resolve));
    },
    warn: (m) => warnings.push(m),
  });

  return {
    panel,
    setActive: (a) => {
      active = a;
    },
    setTab: (t) => {
      tab = t;
    },
    setEnabled: (e) => {
      enabled = e;
    },
    viewState,
    tabs,
    disposePanel: () => {
      for (const l of disposeListeners) l();
    },
    locks: () => locks,
    warnings,
    settle: () => {
      for (const r of pending.splice(0)) r();
    },
    attach: () => lock.attach(panel),
  };
}

// ---- isChatTabInput: the one definition of the view-type rule ----

test('isChatTabInput: true for the host-prefixed runtime form and the bare view type', () => {
  assert.equal(isChatTabInput({ viewType: 'mainThreadWebview-insrc.chatPanel' }, CHAT_VIEW_TYPE), true);
  assert.equal(isChatTabInput({ viewType: 'insrc.chatPanel' }, CHAT_VIEW_TYPE), true);
});

test('isChatTabInput: false for other webviews, near-misses, and non-webview inputs', () => {
  assert.equal(isChatTabInput(DOCS_REVIEW_TAB, CHAT_VIEW_TYPE), false, 'the docs-review webview');
  assert.equal(isChatTabInput({ viewType: 'mainThreadWebview-insrc.chatPanel.extra' }, CHAT_VIEW_TYPE), false, 'chat type mid-string');
  assert.equal(isChatTabInput({ viewType: 'xinsrc.chatPanel' }, CHAT_VIEW_TYPE), false, 'suffix without the - separator');
  assert.equal(isChatTabInput(TEXT_TAB, CHAT_VIEW_TYPE), false, 'a text-editor input has no viewType');
  assert.equal(isChatTabInput({ viewType: 42 }, CHAT_VIEW_TYPE), false, 'non-string viewType');
  assert.equal(isChatTabInput(null, CHAT_VIEW_TYPE), false);
  assert.equal(isChatTabInput(undefined, CHAT_VIEW_TYPE), false);
  assert.equal(isChatTabInput('insrc.chatPanel', CHAT_VIEW_TYPE), false, 'a bare string is not a tab input');
});

// ---- createChatGroupLock ----

test('locks once on the immediate attempt when the panel is active and the chat is the active tab', () => {
  const h = harness({ active: true, tab: CHAT_TAB });
  h.attach();
  assert.equal(h.locks(), 1);
  assert.equal(h.viewState.live(), 0, 'view-state subscription disposed after the lock');
  assert.equal(h.tabs.live(), 0, 'tab subscription disposed after the lock');
});

test('view-state event first with a non-chat tab does not lock; a later tab change locks', () => {
  const h = harness({ active: false, tab: TEXT_TAB });
  h.attach();
  h.setActive(true);
  h.viewState.fire();
  assert.equal(h.locks(), 0, 'tab model has not caught up yet');
  h.setTab(CHAT_TAB);
  h.tabs.fire();
  assert.equal(h.locks(), 1);
});

test('tab change first while the panel is not active does not lock; a later view-state change locks', () => {
  const h = harness({ active: false, tab: TEXT_TAB });
  h.attach();
  h.setTab(CHAT_TAB);
  h.tabs.fire();
  assert.equal(h.locks(), 0, 'panel not active yet');
  h.setActive(true);
  h.viewState.fire();
  assert.equal(h.locks(), 1);
});

test('a non-active restored panel does not lock at attach and locks on its first activation', () => {
  const h = harness({ active: false, tab: TEXT_TAB });
  h.attach();
  assert.equal(h.locks(), 0);
  assert.equal(h.viewState.live(), 1, 'still listening for activation');
  assert.equal(h.tabs.live(), 1);
  h.setActive(true);
  h.setTab(CHAT_TAB);
  h.viewState.fire();
  assert.equal(h.locks(), 1);
});

test('does not lock while another webview is the active tab, even though the panel reports active', () => {
  const h = harness({ active: true, tab: DOCS_REVIEW_TAB });
  h.attach();
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 0);
});

test('never locks while disabled; locks at the next event after the setting is turned on', () => {
  const h = harness({ active: true, tab: CHAT_TAB, enabled: false });
  h.attach();
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 0);
  h.setEnabled(true);
  h.tabs.fire();
  assert.equal(h.locks(), 1);
});

test('events that land while the command is still in flight do not issue it again', () => {
  const h = harness({ active: true, tab: CHAT_TAB, lock: 'pending' });
  h.attach();
  assert.equal(h.locks(), 1);
  // Not settled yet: both event kinds fire around a fresh open.
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 1, 'finished is set before the command is invoked');
  h.settle();
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 1);
});

test('a panel disposed before locking disposes both subscriptions and never locks', () => {
  const h = harness({ active: false, tab: TEXT_TAB });
  h.attach();
  h.disposePanel();
  assert.equal(h.viewState.live(), 0);
  assert.equal(h.tabs.live(), 0);
  h.setActive(true);
  h.setTab(CHAT_TAB);
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 0);
});

test('a rejecting lock command is reported via warn, does not throw, and is not retried', async () => {
  const h = harness({ active: true, tab: CHAT_TAB, lock: 'reject' });
  assert.doesNotThrow(() => h.attach());
  await new Promise((r) => setImmediate(r));
  assert.equal(h.locks(), 1);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0]!, /command rejected/);
  h.viewState.fire();
  h.tabs.fire();
  assert.equal(h.locks(), 1, 'no retry of a command that failed');
});

test('a synchronously throwing lock command is reported via warn, does not throw, and is not retried', () => {
  const h = harness({ active: true, tab: CHAT_TAB, lock: 'throw' });
  assert.doesNotThrow(() => h.attach());
  assert.equal(h.locks(), 1);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0]!, /no such command/);
  h.tabs.fire();
  assert.equal(h.locks(), 1);
});

test('a throwing tab subscription is reported via warn, does not throw, and leaves no listener behind', () => {
  // An editor fork without window.tabGroups: attach must never throw into panel create/restore.
  const viewState = emitter();
  let locks = 0;
  const warnings: string[] = [];
  const lock = createChatGroupLock({
    enabled: () => true,
    viewType: CHAT_VIEW_TYPE,
    activeTabInput: () => CHAT_TAB,
    onTabsChanged: () => {
      throw new Error('no tabGroups');
    },
    lockActiveGroup: () => {
      locks += 1;
      return Promise.resolve();
    },
    warn: (m) => warnings.push(m),
  });
  assert.doesNotThrow(() =>
    lock.attach({ active: true, onDidChangeViewState: (l) => viewState.on(l), onDidDispose: () => undefined }),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /no tabGroups/);
  assert.equal(viewState.live(), 0, 'the view-state subscription taken before the failure is disposed');
  assert.equal(locks, 0, 'no lock without a working tab source');
});

test('a throwing enabled() is reported via warn and a later event retries and locks', () => {
  const h = harness({ active: true, tab: CHAT_TAB, enabledThrowsOnce: true });
  assert.doesNotThrow(() => h.attach());
  assert.equal(h.locks(), 0);
  assert.match(h.warnings[0]!, /config boom/);
  h.tabs.fire();
  assert.equal(h.locks(), 1);
});

test('a throwing activeTabInput() is reported via warn and a later event retries and locks', () => {
  const h = harness({ active: true, tab: CHAT_TAB, tabThrowsOnce: true });
  assert.doesNotThrow(() => h.attach());
  assert.equal(h.locks(), 0);
  assert.match(h.warnings[0]!, /tabs boom/);
  h.viewState.fire();
  assert.equal(h.locks(), 1);
});
