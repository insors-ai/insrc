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

test('pending() maps PendingArtifact -> DocsArtifactSummary (id/kind/title/status, and the open-question count)', async () => {
  const { client } = fakeIpc((m) => (m === 'workflow.pending' ? PENDING : { error: 'x' }));
  const c = createDocsReviewClient(client);
  const list = await c.pending();
  assert.deepEqual(list, [
    { id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending', openQuestions: 1 },
    { id: 'PLAN-abc-s7', kind: 'PLAN', title: 'Docs review plan', status: 'pending', openQuestions: 0 },
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

test("docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields", async () => {
  const RESULT = { artifactId: 'LLD-abc-s7', decision: 'reject', outcome: 'rejected', reason: 'tighten it', recorded: 2, entryIds: ['e1', 'e2'], author: 'Rev Iewer' };
  const VIEW = {
    artifactId: 'LLD-abc-s7', kind: 'LLD', renderedMarkdown: '# LLD', openQuestions: [], approvable: true,
    docPath: 'docs/epics/x/S007/LLD.md',
    contentVersion: '0123456789abcdef',
    feedback: [{ id: 'f1', author: 'Rev Iewer', timestamp: '2026-10-13T09:00:00.000Z', target: { file: 'docs/epics/x/S007/LLD.md' }, comment: 'First.', decision: 'feedback', batchId: 'b1', anchor: { quote: 'LLD' } }],
    reviewer: { name: 'Rev Iewer', source: 'git' },
    state: 'pending',
  };
  const { client, calls } = fakeIpc((m) => {
    if (m === 'workflow.pending') return PENDING;
    if (m === 'workflow.reviewDecision') return RESULT;
    if (m === 'workflow.artifactContent') return VIEW;
    return { error: 'x' };
  });
  const c = createDocsReviewClient(client);
  await c.pending(); // the id map now knows LLD-abc-s7 -> docs/epics/x/S007/LLD.md

  const comments = [{ comment: 'tighten it' }, { comment: 'say which', version: '0123456789abcdef', anchor: { quote: 'the pane', sectionSlug: 'lld' } }];
  const res = await c.decide('docs/standalone/y/S001/LLD.md', 'reject', comments);
  assert.deepEqual(res, RESULT, 'the daemon result is returned as it is');
  const sent = calls.filter((x) => x.method === 'workflow.reviewDecision');
  assert.equal(sent.length, 1, 'one call');
  assert.deepEqual(sent[0]!.params, { mdPath: 'docs/standalone/y/S001/LLD.md', decision: 'reject', comments });
  assert.deepEqual(calls.map((x) => x.method), ['workflow.pending', 'workflow.reviewDecision'], 'no approve, no resolveComment, no second call');

  // A path only: an artifact id is sent as it was given, never looked up.
  await c.decide('LLD-abc-s7', 'feedback', [comments[0]!]);
  assert.deepEqual(calls.at(-1)!.params, { mdPath: 'LLD-abc-s7', decision: 'feedback', comments: [comments[0]] }, 'the id map is not consulted');
  // No comments is an empty list, not an absent key.
  await c.decide('docs/standalone/y/S001/LLD.md', 'approve', []);
  assert.deepEqual(calls.at(-1)!.params, { mdPath: 'docs/standalone/y/S001/LLD.md', decision: 'approve', comments: [] });

  // A withheld approval is a result, not an error.
  const withheld = fakeIpc(() => ({ ...RESULT, decision: 'approve', outcome: 'withheld', reason: 'unresolved HIGH finding', recorded: 0, entryIds: [] }));
  assert.equal((await createDocsReviewClient(withheld.client).decide('docs/x/LLD.md', 'approve', [])).outcome, 'withheld');

  // The error arm, and a socket failure, are thrown.
  const refused = fakeIpc(() => ({ error: "workflow.reviewDecision: cannot approve 'LLD-abc-s7': it is already approved, not awaiting review" }));
  await assert.rejects(() => createDocsReviewClient(refused.client).decide('docs/x/LLD.md', 'approve', []), /already approved/);
  const down = fakeIpc(() => { throw new Error('socket closed'); });
  await assert.rejects(() => createDocsReviewClient(down.client).decide('docs/x/LLD.md', 'approve', []), /socket closed/);

  // content forwards the five new view fields unchanged, by reference.
  const content = await c.content('LLD-abc-s7');
  assert.equal(content.docPath, VIEW.docPath);
  assert.equal(content.contentVersion, VIEW.contentVersion);
  assert.equal(content.feedback, VIEW.feedback);
  assert.equal(content.reviewer, VIEW.reviewer);
  assert.equal(content.state, 'pending');
  assert.equal(content.markdown, '# LLD', 'beside the existing fields');
  // A daemon that sends none of them (older than the plugin): absent keys, not undefined values.
  const old = fakeIpc(() => ({ artifactId: 'x', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: true }));
  const bare = await createDocsReviewClient(old.client).content('docs/x/LLD.md');
  for (const key of ['docPath', 'contentVersion', 'feedback', 'reviewer', 'state']) assert.equal(key in bare, false, `${key} is an absent key`);
});

test('MED-2: an empty mdPath (unresolvable sentinel) is NOT cached, so content falls back to the raw id (never send "")', async () => {
  const EMPTY = { artifacts: [{ artifactId: 'LLD-legacy', kind: 'LLD', title: 'legacy', mdPath: '', openQuestionCount: 0, state: 'pending' }] };
  const { client, calls } = fakeIpc((m) => {
    if (m === 'workflow.pending') return EMPTY;
    if (m === 'workflow.artifactContent') return { artifactId: 'LLD-legacy', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: true };
    return { error: 'x' };
  });
  const c = createDocsReviewClient(client);
  await c.pending();
  await c.content('LLD-legacy');
  const ac = calls.find((x) => x.method === 'workflow.artifactContent')!.params as { mdPath: string };
  assert.equal(ac.mdPath, 'LLD-legacy', 'content falls back to the raw id, not ""');
});

test('every method throws on the daemon { error } arm (never a silent empty result)', async () => {
  const { client } = fakeIpc(() => ({ error: 'repo unresolved' }));
  const c = createDocsReviewClient(client);
  await assert.rejects(() => c.pending(), /repo unresolved/);
  await assert.rejects(() => c.content('x'), /repo unresolved/);
  await assert.rejects(() => c.decide('x', 'approve', []), /repo unresolved/);
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

test('t2: source-scan — docs-review-client calls exactly its three daemon methods', async () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'docs-review-client.ts'),
    'utf8',
  );
  const methods = [...src.matchAll(/'(workflow\.[A-Za-z.]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    [...new Set(methods)],
    ['workflow.artifactContent', 'workflow.pending', 'workflow.reviewDecision'],
    'the list, the content and the one decision call; approve and resolveComment are no longer called from here',
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

// Found in the hand check of E202610138d4b90c9:S001: a daemon started outside the IDE has
// no default repository, and the pane sent none, so its list read failed with "repo is required".
test('every call names the repository it is given, and none when no folder is open', async () => {
  const answer = (m: string): unknown =>
    m === 'workflow.pending' ? PENDING
      : m === 'workflow.artifactContent' ? { artifactId: 'x', kind: 'LLD', renderedMarkdown: 'b', openQuestions: [], approvable: true }
        : { artifactId: 'x', decision: 'feedback', outcome: 'recorded', recorded: 1, entryIds: ['e1'], author: 'A' };
  const { client, calls } = fakeIpc(answer);
  let repo: string | undefined = '/work/repo';
  const c = createDocsReviewClient(client, { repo: () => repo });
  await c.pending();
  await c.content('LLD-abc-s7');
  await c.decide('docs/x/LLD.md', 'feedback', [{ comment: 'c' }]);
  assert.deepEqual(calls.map((x) => x.params), [
    { repo: '/work/repo' },
    { repo: '/work/repo', mdPath: 'docs/epics/x/S007/LLD.md' },
    { repo: '/work/repo', mdPath: 'docs/x/LLD.md', decision: 'feedback', comments: [{ comment: 'c' }] },
  ]);
  // No folder open: the key is absent, so the daemon's own default (or its error) applies.
  for (const none of [undefined, '']) {
    repo = none;
    calls.length = 0;
    await c.pending();
    await c.content('docs/x/LLD.md');
    assert.deepEqual(calls.map((x) => x.params), [{}, { mdPath: 'docs/x/LLD.md' }]);
  }
});

// Story E202610131f74c81f:S001 t2: what the pane's table shows beside the title.
test('docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise', async () => {
  const { client } = fakeIpc(() => ({
    artifacts: [
      { artifactId: 'LLD-abc-s7', kind: 'LLD', title: 'With both', mdPath: 'docs/x/LLD.md', workItemId: 'E20261013abc:S007', openQuestionCount: 3, state: 'pending' },
      { artifactId: 'CR-abc-S001', kind: 'CR', title: 'No work item', mdPath: 'docs/x/CR.md', openQuestionCount: 0, state: 'pending' },
      { artifactId: 'DEF-old', kind: 'DEF', title: 'From an older daemon', mdPath: 'docs/x/DEF.md', state: 'pending' },
      { artifactId: 'ISSUE-odd', kind: 'ISSUE', title: 'Odd values', mdPath: '', workItemId: '', openQuestionCount: '2', state: 'pending' },
    ],
  }));
  const list = await createDocsReviewClient(client).pending();
  assert.deepEqual(list, [
    { id: 'LLD-abc-s7', kind: 'LLD', title: 'With both', status: 'pending', openQuestions: 3, workItemId: 'E20261013abc:S007' },
    { id: 'CR-abc-S001', kind: 'CR', title: 'No work item', status: 'pending', openQuestions: 0 },
    { id: 'DEF-old', kind: 'DEF', title: 'From an older daemon', status: 'pending' },
    { id: 'ISSUE-odd', kind: 'ISSUE', title: 'Odd values', status: 'pending' },
  ], 'a count of 0 is given; an absent, empty or wrongly typed value is an absent key');
  for (const key of ['openQuestions', 'workItemId']) assert.equal(key in list[2]!, false);
});
