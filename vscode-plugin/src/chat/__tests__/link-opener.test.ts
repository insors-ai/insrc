/**
 * Epic babd84c6e2fb480a Story S001 t3: the host side of a clicked link or code reference.
 * The opener is run over a real temporary workspace; the two hosts are driven with a
 * recording opener; extension.ts is scanned for the column rule (it cannot run here).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLinkOpener, type LinkOpener } from '../link-opener.js';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createDocsReviewHost } from '../docs-review-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { DocsReviewClient } from '../docs-review-client.js';

interface Harness {
  readonly root: string;
  readonly outside: string;
  readonly externals: string[];
  readonly files: Array<{ path: string; line: number | undefined }>;
  readonly warnings: string[];
  readonly opener: LinkOpener;
  cleanup(): void;
}

function harness(o: { openExternal?: (url: string) => PromiseLike<boolean>; openFile?: (path: string, line: number | undefined) => PromiseLike<unknown>; root?: 'none' } = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'insrc-links-'));
  const outside = mkdtempSync(join(tmpdir(), 'insrc-links-out-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'foo.ts'), 'one\ntwo\n');
  writeFileSync(join(outside, 'secret.ts'), 'secret');
  const externals: string[] = [];
  const files: Array<{ path: string; line: number | undefined }> = [];
  const warnings: string[] = [];
  const opener = createLinkOpener({
    root: () => (o.root === 'none' ? undefined : root),
    openExternal: o.openExternal ?? (async (url) => { externals.push(url); return true; }),
    openFile: o.openFile ?? (async (path, line) => { files.push({ path, line }); }),
    log: { warn: (m) => void warnings.push(m) },
  });
  return { root, outside, externals, files, warnings, opener, cleanup: () => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); } };
}

test('the host opens a valid http url externally and refuses a non-http url', async () => {
  const h = harness();
  try {
    await h.opener.openLink('https://example.com/a?b=1');
    await h.opener.openLink('http://example.com');
    assert.deepEqual(h.externals, ['https://example.com/a?b=1', 'http://example.com/']);
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'vscode://x/y', 'data:text/html,hi', 'example.com', '', 7, null, undefined]) {
      await h.opener.openLink(bad);
    }
    assert.equal(h.externals.length, 2, 'nothing else reached the browser');
    assert.equal(h.warnings.length, 9, 'each refusal is logged');
  } finally { h.cleanup(); }
});

test('the host opens an existing in-workspace path with the line selected', async () => {
  const h = harness();
  try {
    const real = realpathSync(join(h.root, 'src', 'foo.ts'));
    await h.opener.openCodeRef('src/foo.ts', 42);
    await h.opener.openCodeRef('src/foo.ts', undefined);
    await h.opener.openCodeRef('src/foo.ts', 0);
    await h.opener.openCodeRef('src/foo.ts', 1.5);
    await h.opener.openCodeRef('src/foo.ts', '7');
    assert.deepEqual(h.files, [
      { path: real, line: 42 },
      { path: real, line: undefined },
      { path: real, line: undefined },
      { path: real, line: undefined },
      { path: real, line: undefined },
    ], 'a line that is not a positive whole number opens the file at its top');
    assert.deepEqual(h.warnings, []);
  } finally { h.cleanup(); }
});

test('the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder', async () => {
  const h = harness();
  const none = harness({ root: 'none' });
  try {
    await h.opener.openCodeRef(join(h.root, 'src', 'foo.ts'), 1);
    await h.opener.openCodeRef(join(h.outside, 'secret.ts'), 1);
    await h.opener.openCodeRef('../' + h.outside.split('/').pop() + '/secret.ts', 1);
    await h.opener.openCodeRef('src/../src/foo.ts', 1);
    await h.opener.openCodeRef('src/missing.ts', 1);
    await h.opener.openCodeRef('src', 1);
    await h.opener.openCodeRef('', 1);
    await h.opener.openCodeRef(7, 1);
    assert.deepEqual(h.files, []);
    assert.equal(h.warnings.length, 8, 'each refusal is logged');
    await none.opener.openCodeRef('src/foo.ts', 1);
    assert.deepEqual(none.files, []);
    assert.match(none.warnings[0] ?? '', /no workspace folder/);
  } finally { h.cleanup(); none.cleanup(); }
});

test('the host refuses a symlink inside the workspace that points outside it', async () => {
  const h = harness();
  try {
    symlinkSync(join(h.outside, 'secret.ts'), join(h.root, 'src', 'leak.ts'));
    symlinkSync(h.outside, join(h.root, 'out'));
    await h.opener.openCodeRef('src/leak.ts', 1);
    await h.opener.openCodeRef('out/secret.ts', 1);
    assert.deepEqual(h.files, []);
    assert.equal(h.warnings.length, 2);
  } finally { h.cleanup(); }
});

test('the host logs and survives an open that rejects or resolves false', async () => {
  const falsy = harness({ openExternal: async () => false });
  const rejecting = harness({ openExternal: async () => { throw new Error('no browser'); }, openFile: async () => { throw new Error('no editor'); } });
  const syncThrow = harness({ openFile: () => { throw new Error('sync failure'); } });
  try {
    await falsy.opener.openLink('https://example.com');
    assert.match(falsy.warnings[0] ?? '', /did not open/);
    await rejecting.opener.openLink('https://example.com');
    await rejecting.opener.openCodeRef('src/foo.ts', 3);
    assert.equal(rejecting.warnings.length, 2);
    assert.match(rejecting.warnings.join('\n'), /no browser/);
    assert.match(rejecting.warnings.join('\n'), /no editor/);
    await syncThrow.opener.openCodeRef('src/foo.ts', 3);
    assert.match(syncThrow.warnings[0] ?? '', /sync failure/);
  } finally { falsy.cleanup(); rejecting.cleanup(); syncThrow.cleanup(); }
});

test('the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension.ts'), 'utf8');
  const open = /const linkOpener = createLinkOpener\(\{[\s\S]*?\n    \}\);/.exec(src)?.[0];
  assert.ok(open !== undefined, 'extension.ts builds the link opener');
  assert.match(open, /viewColumn: reviewColumn\(\) \?\? vscode\.ViewColumn\.Beside/, 'the column is the review pane rule, and Beside when it picks none');
  assert.match(open, /selection: new vscode\.Range\(new vscode\.Position\(line - 1, 0\), new vscode\.Position\(line - 1, 0\)\)/, 'the line is selected');
  assert.match(open, /vscode\.env\.openExternal\(vscode\.Uri\.parse\(url\)\)/);
  assert.ok(src.indexOf('const reviewColumn = ') < src.indexOf('const linkOpener = '), 'the column rule is defined before the opener uses it');
  assert.match(src, /createChatPanelHost\(\{\s*links: linkOpener,/, 'the chat host gets the opener');
  assert.match(src, /createDocsReviewHost\(\{\s*client: reviewClient,\s*links: linkOpener,/, 'the review host gets the opener');
});

// The two hosts hand a click to the opener and ignore it when there is none.
function recording(): { links: LinkOpener; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    links: {
      openLink: async (url) => { calls.push(['link', url]); },
      openCodeRef: async (path, line) => { calls.push(['code', path, line]); },
    },
  };
}
function channel(): { channel: ChatPanelChannel; send: (type: string, extra?: Record<string, unknown>) => void } {
  let onMsg: ((m: unknown) => void) | undefined;
  return {
    channel: { setHtml: () => {}, postMessage: () => {}, onMessage: (l) => { onMsg = l; }, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} },
    send: (type, extra = {}) => onMsg?.({ v: 1, payload: { type, ...extra } }),
  };
}
const reviewClient: DocsReviewClient = {
  async pending() { return []; },
  async content() { throw new Error('not used'); },
  async decide() { throw new Error('not used'); },
};

test('the chat host and the review host hand a clicked link and code reference to the opener', () => {
  const r = recording();
  const chat = channel();
  const chatHost = createChatPanelHost({
    createPanel: () => chat.channel,
    providers: { available: [], get() { throw new Error('unused'); } },
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    links: r.links,
  });
  chatHost.open();
  chat.send('open-link', { url: 'https://example.com' });
  chat.send('open-code-ref', { path: 'src/foo.ts', line: 42 });

  const review = channel();
  const reviewHost = createDocsReviewHost({ createPanel: () => review.channel, client: reviewClient, links: r.links });
  reviewHost.open();
  review.send('open-link', { url: 'https://example.org' });
  review.send('open-code-ref', { path: 'docs/a.md' });

  assert.deepEqual(r.calls, [
    ['link', 'https://example.com'],
    ['code', 'src/foo.ts', 42],
    ['link', 'https://example.org'],
    ['code', 'docs/a.md', undefined],
  ]);

  // With no opener a click is ignored, never an error.
  const bare = channel();
  const bareHost = createChatPanelHost({ createPanel: () => bare.channel, providers: { available: [], get() { throw new Error('unused'); } }, store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  bareHost.open();
  assert.doesNotThrow(() => { bare.send('open-link', { url: 'https://example.com' }); bare.send('open-code-ref', { path: 'a' }); });
});
