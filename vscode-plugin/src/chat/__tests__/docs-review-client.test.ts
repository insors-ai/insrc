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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// ---------------------------------------------------------------------------
// S001/t2 (Epic build-vs-code-plugin-ui-integration, sc1) — the four STRUCTURED
// records carried through content() UNCHANGED. s1 consumes none of them; these
// tests are the verified pass-through s2/s3/s4 inherit, so each asserts
// byte-identity rather than mere presence.
// ---------------------------------------------------------------------------

const FD = { commitments: [{ id: 'fr1', statement: 'read a document as structured' }] };
const ER = { entities: [{ name: 'Artifact', fields: [{ name: 'id', type: 'string' }] }] };
const UX = { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text: 'mock' }] };
const CO = [{ kind: 'ux-mock', relPath: 'docs/epics/x/S007/ux-mock.html', title: 'UX mock' }];

test('t2: content() round-trips a view carrying all four structured records, each one unmodified', async () => {
  const view = {
    artifactId: 'LLD-abc-s7',
    kind: 'LLD',
    renderedMarkdown: '# LLD\nbody',
    openQuestions: [],
    approvable: true,
    functionalDefinition: FD,
    erDefinition: ER,
    uxDefinition: UX,
    companions: CO,
  };
  const { client } = fakeIpc((m) => (m === 'workflow.artifactContent' ? view : { error: 'x' }));
  const content = await createDocsReviewClient(client).content('docs/x/LLD.md');

  // Byte-identical on the far side: deep-equal AND reference-equal, since a
  // pass-through must not clone or reshape (s2/s3/s4 rely on exactly this).
  assert.deepEqual(content.functionalDefinition, FD);
  assert.deepEqual(content.erDefinition, ER);
  assert.deepEqual(content.uxDefinition, UX);
  assert.deepEqual(content.companions, CO);
  assert.equal(content.functionalDefinition, view.functionalDefinition);
  assert.equal(content.erDefinition, view.erDefinition);
  assert.equal(content.uxDefinition, view.uxDefinition);
  assert.equal(content.companions, view.companions);
  // the three pre-existing members keep their current meaning
  assert.equal(content.markdown, '# LLD\nbody');
  assert.deepEqual(content.openQuestions, []);
  assert.equal(content.blocked, false);
});

test('t2: content() on a view carrying none of the four yields all four ABSENT', async () => {
  const { client } = fakeIpc((m) =>
    m === 'workflow.artifactContent'
      ? { artifactId: 'x', kind: 'DEF', renderedMarkdown: 'b', openQuestions: [], approvable: true }
      : { error: 'x' },
  );
  const content = await createDocsReviewClient(client).content('docs/x/DEF.md');
  for (const k of ['functionalDefinition', 'erDefinition', 'sequenceDefinition', 'uxDefinition', 'companions'] as const) {
    // An absent key, not a key holding undefined — so `=== undefined` is the
    // single absence test on this side of the IPC too.
    assert.equal(k in content, false, `${k} must be absent, not present-but-empty`);
    assert.equal(content[k], undefined);
  }
});

test('t2: content() still throws on the daemon { error } arm — unavailable stays distinguishable from empty', async () => {
  const { client } = fakeIpc(() => ({ error: 'repo unresolved' }));
  const c = createDocsReviewClient(client);
  await assert.rejects(() => c.content('docs/x/LLD.md'), /repo unresolved/);
  // and an EMPTY-but-valid view is NOT an error — the two stay distinct.
  const { client: ok } = fakeIpc((m) =>
    m === 'workflow.artifactContent'
      ? { artifactId: 'x', kind: 'DEF', renderedMarkdown: '', openQuestions: [], approvable: true }
      : { error: 'x' },
  );
  const empty = await createDocsReviewClient(ok).content('docs/x/DEF.md');
  assert.equal(empty.markdown, '');
  assert.equal(empty.blocked, false);
});

test('t2: source-scan — no new rpc method name appears in docs-review-client', async () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'docs-review-client.ts'),
    'utf8',
  );
  const methods = [...src.matchAll(/'(workflow\.[A-Za-z.]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    [...new Set(methods)],
    ['workflow.approve', 'workflow.artifactContent', 'workflow.pending', 'workflow.resolveComment'],
    'the widening rides the existing four IPCs — no new rpc method name',
  );
});

// ---------------------------------------------------------------------------
// S003/t1 (AMD-bfe98ff7f97178cf-1) — `sequenceDefinition` is carried through on
// the same terms as the four sc1 siblings: reference-identical pass-through on
// presence, an ABSENT KEY on absence, and INDEXED off ArtifactReviewView rather
// than restated so the daemon and client shapes cannot drift.
// ---------------------------------------------------------------------------

const SQ = {
  id: 's2-render-order',
  participants: [{ id: 'host', label: 'openDoc (extension host)' }, { id: 'webview', label: 'renderContent (webview)' }],
  messages: [{ from: 'host', to: 'webview', label: 'docs-content' }],
};

test('t2/s3: content() carries sequenceDefinition through by REFERENCE, unmodified', async () => {
  const view = {
    artifactId: 'LLD-bfe98ff7f97178cf-s2',
    kind: 'LLD',
    renderedMarkdown: '# LLD\nbody',
    openQuestions: [],
    approvable: true,
    sequenceDefinition: SQ,
  };
  const { client } = fakeIpc((m) => (m === 'workflow.artifactContent' ? view : { error: 'x' }));
  const content = await createDocsReviewClient(client).content('docs/x/LLD.md');

  // Reference equality is the assertion that matters: a clone would deep-equal
  // and still prove the pass-through had reshaped something.
  assert.deepEqual(content.sequenceDefinition, SQ);
  assert.equal(content.sequenceDefinition, view.sequenceDefinition);
});

test('t2/s3: a view carrying sequenceDefinition but no other record leaves the other four ABSENT', async () => {
  // The real shape of this Epic's own S002 LLD: a sequence record and companions,
  // no erDefinition. Nothing may be backfilled for the records it does not carry.
  const { client } = fakeIpc((m) =>
    m === 'workflow.artifactContent'
      ? { artifactId: 'x', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: true, sequenceDefinition: SQ }
      : { error: 'x' },
  );
  const content = await createDocsReviewClient(client).content('docs/x/LLD.md');
  assert.equal(content.sequenceDefinition, SQ);
  for (const k of ['functionalDefinition', 'erDefinition', 'uxDefinition', 'companions'] as const) {
    assert.equal(k in content, false, `${k} must stay absent when only sequenceDefinition is carried`);
  }
});

test('t2/s3: DocsContent indexes sequenceDefinition off ArtifactReviewView rather than restating it', () => {
  // A SOURCE SCAN, because the property is structural: an independently restated
  // type would compile and pass every behavioural test above while being free to
  // drift from the daemon's. Comments are stripped first — a scan that reads prose
  // has produced false results in this repo before.
  const src = readFileSync(new URL('../docs-review-client.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(
    src,
    /readonly sequenceDefinition\?: ArtifactReviewView\['sequenceDefinition'\];/,
    'the field must be indexed off the daemon view, like its four siblings',
  );
  // And all five siblings are indexed the same way — no odd one out.
  for (const k of ['functionalDefinition', 'erDefinition', 'sequenceDefinition', 'uxDefinition', 'companions']) {
    assert.ok(
      src.includes(`readonly ${k}?: ArtifactReviewView['${k}'];`),
      `${k} must be declared as ArtifactReviewView['${k}']`,
    );
  }
});
