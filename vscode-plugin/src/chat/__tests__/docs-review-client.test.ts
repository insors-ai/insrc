/**
 * Story E20260925edb76e2e:S007 / t6 — DocsReviewClient unit (over a fake IpcClient).
 *
 * Proves the client maps the daemon's review IPCs onto the sc3 shapes, resolves the
 * artifactId->mdPath the sc3 summary drops, and normalizes every { error } arm into a
 * throw (never a silent empty result). No vscode, no daemon.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/docs-review-client.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewClient } from '../docs-review-client.js';

interface Call { method: string; params: unknown }

function fakeIpc(responder: (method: string, params: unknown) => unknown) {
  const calls: Call[] = [];
  const client = {
    async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params });
      return responder(method, params) as T;
    },
    // The DocsReviewClient only uses rpc(); the rest of IpcClient is unused here.
  } as unknown as import('../../../../src/shared/ipc-client.js').IpcClient;
  return { client, calls };
}

const PENDING = {
  artifacts: [
    { artifactId: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', mdPath: 'docs/epics/x/S007/LLD.md', openQuestionCount: 1, state: 'pending' },
    { artifactId: 'PLAN-abc-s7', kind: 'PLAN', title: 'Docs review plan', mdPath: 'docs/epics/x/S007/PLAN.md', openQuestionCount: 0, state: 'pending' },
  ],
};

test('pending() maps PendingArtifact -> DocsArtifactSummary (id/kind/title/status)', async () => {
  const { client } = fakeIpc((m) => (m === 'workflow.pending' ? PENDING : { error: 'x' }));
  const c = createDocsReviewClient(client);
  const list = await c.pending();
  assert.deepEqual(list, [
    { id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' },
    { id: 'PLAN-abc-s7', kind: 'PLAN', title: 'Docs review plan', status: 'pending' },
  ]);
});

test('content(id) resolves the retained mdPath and maps renderedMarkdown/openQuestions/blocked', async () => {
  const { client, calls } = fakeIpc((m) => {
    if (m === 'workflow.pending') return PENDING;
    if (m === 'workflow.artifactContent') {
      return {
        artifactId: 'LLD-abc-s7',
        kind: 'LLD',
        renderedMarkdown: '# LLD\nbody',
        openQuestions: [{ id: 'q1', text: 'which pane?', status: 'open' }],
        approvable: true,
        blockReason: null,
      };
    }
    return { error: 'x' };
  });
  const c = createDocsReviewClient(client);
  await c.pending(); // populate id->mdPath
  const content = await c.content('LLD-abc-s7');
  assert.equal(content.markdown, '# LLD\nbody');
  assert.deepEqual(content.openQuestions, ['which pane?']);
  assert.equal(content.blocked, false);
  // resolved the .md path the daemon needs from the id the host holds.
  const ac = calls.find((x) => x.method === 'workflow.artifactContent');
  assert.deepEqual(ac!.params, { mdPath: 'docs/epics/x/S007/LLD.md' });
});

test('content() maps approvable:false -> blocked:true', async () => {
  const { client } = fakeIpc((m) =>
    m === 'workflow.artifactContent'
      ? { artifactId: 'x', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: false, blockReason: 'HIGH finding' }
      : { error: 'x' },
  );
  const c = createDocsReviewClient(client);
  const content = await c.content('docs/x/LLD.md'); // raw path fallback (no pending() first)
  assert.equal(content.blocked, true);
});

test('approve(id) resolves mdPath into workflow.approve { artifactPath } and returns the result', async () => {
  const RESULT = { approved: [{ path: 'docs/epics/x/S007/LLD.md', result: {} }], skipped: [], codeReview: [] };
  const { client, calls } = fakeIpc((m) => {
    if (m === 'workflow.pending') return PENDING;
    if (m === 'workflow.approve') return RESULT;
    return { error: 'x' };
  });
  const c = createDocsReviewClient(client);
  await c.pending();
  const res = await c.approve('LLD-abc-s7');
  assert.equal(res.approved.length, 1);
  const ap = calls.find((x) => x.method === 'workflow.approve');
  assert.deepEqual(ap!.params, { artifactPath: 'docs/epics/x/S007/LLD.md' });
});

test('comment() posts workflow.resolveComment with { artifactId, comments:[{body}] }', async () => {
  const { client, calls } = fakeIpc((m) => (m === 'workflow.resolveComment' ? { recorded: 1, resolutions: [] } : { error: 'x' }));
  const c = createDocsReviewClient(client);
  await c.comment('LLD-abc-s7', 'please tighten the error path');
  const rc = calls.find((x) => x.method === 'workflow.resolveComment')!.params as {
    artifactId: string;
    comments: Array<{ id: string; anchor: unknown; body: string }>;
  };
  assert.equal(rc.artifactId, 'LLD-abc-s7');
  assert.equal(rc.comments.length, 1);
  assert.equal(rc.comments[0]!.body, 'please tighten the error path');
});

test('MED-2: an empty mdPath (unresolvable sentinel) is NOT cached, so content/approve fall back to the raw id (never send "")', async () => {
  const EMPTY = { artifacts: [{ artifactId: 'LLD-legacy', kind: 'LLD', title: 'legacy', mdPath: '', openQuestionCount: 0, state: 'pending' }] };
  const { client, calls } = fakeIpc((m) => {
    if (m === 'workflow.pending') return EMPTY;
    if (m === 'workflow.artifactContent') return { artifactId: 'LLD-legacy', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: true };
    if (m === 'workflow.approve') return { approved: [], skipped: [], codeReview: [] };
    return { error: 'x' };
  });
  const c = createDocsReviewClient(client);
  await c.pending();
  await c.content('LLD-legacy');
  await c.approve('LLD-legacy');
  const ac = calls.find((x) => x.method === 'workflow.artifactContent')!.params as { mdPath: string };
  const ap = calls.find((x) => x.method === 'workflow.approve')!.params as { artifactPath: string };
  assert.equal(ac.mdPath, 'LLD-legacy', 'content falls back to the raw id, not ""');
  assert.equal(ap.artifactPath, 'LLD-legacy', 'approve falls back to the raw id, not ""');
});

test('every method throws on the daemon { error } arm (never a silent empty result)', async () => {
  const { client } = fakeIpc(() => ({ error: 'repo unresolved' }));
  const c = createDocsReviewClient(client);
  await assert.rejects(() => c.pending(), /repo unresolved/);
  await assert.rejects(() => c.content('x'), /repo unresolved/);
  await assert.rejects(() => c.approve('x'), /repo unresolved/);
  await assert.rejects(() => c.comment('x', 'n'), /repo unresolved/);
});
