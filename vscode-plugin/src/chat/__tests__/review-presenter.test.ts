// Story E20261013e62a9269:S001 — a document a chat turn presents for approval is opened in
// the review pane: the presenter's rule, and the review host's quiet open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPresenter, presentedPathOf, type PendingDocument } from '../review-presenter.js';
import { createDocsReviewHost } from '../docs-review-panel.js';
import type { DocsReviewClient } from '../docs-review-client.js';
import type { ChatPanelChannel } from '../chat-panel.js';

const ROOT = '/home/dev/repo';
/** A pending document with the absolute path the daemon gives. */
const doc = (id: string, rel = `docs/standalone/x/${id}.md`): PendingDocument => ({ id, mdPath: `${ROOT}/${rel}` });
/** The text of a workflow tool's done response naming a document, as the chat host sees it. */
const presenting = (mdPath: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ next: 'done', markdown: '# A long document\n'.repeat(50), pendingApproval: { artifactPath: mdPath, guidance: 'Present and ask.' }, ...extra });
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

interface Kit {
  /** What the pending list holds now. */
  list: PendingDocument[];
  opened: string[];
  reads: number;
  logged: string[];
  failReads: boolean;
  presenter: ReturnType<typeof createReviewPresenter>;
}
function kit(initial: PendingDocument[] = [], o: { open?: (id: string) => void; gate?: () => Promise<void> } = {}): Kit {
  const k: Kit = {
    list: [...initial], opened: [], reads: 0, logged: [], failReads: false,
    presenter: createReviewPresenter({
      pendingDocuments: async () => {
        k.reads += 1;
        const now = [...k.list];
        const fail = k.failReads;
        if (o.gate !== undefined) await o.gate();
        if (fail) throw new Error('daemon down');
        return now;
      },
      open: (t) => {
        k.opened.push(`${t.artifactId}@${t.mdPath}`);
        o.open?.(t.artifactId);
      },
      log: { warn: (m) => void k.logged.push(m), error: (m) => void k.logged.push(m) },
    }),
  };
  return k;
}
const ids = (k: Kit): string[] => k.opened.map((x) => x.slice(0, x.indexOf('@')));

test('review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing', async () => {
  const A = doc('LLD-aaa-S001');
  const B = doc('PLAN-bbb-S001');
  const k = kit([A, B]);
  const turn = k.presenter.begin();
  await settle();
  assert.equal(k.reads, 1, 'the list is read once when the turn begins');

  // The block's path is the list's path: both absolute, equal.
  turn.toolResult(presenting(A.mdPath));
  await settle();
  assert.deepEqual(k.opened, [`LLD-aaa-S001@${A.mdPath}`], 'opened by its id and the path the list gives');
  assert.equal(k.reads, 2, 'the list is read again for a presenting result');
  // The same document again in the turn (a re-run of the step, a second mention).
  turn.toolResult(presenting(A.mdPath));
  await settle();
  assert.equal(k.opened.length, 1, 'opened once in a turn');

  // Nothing is opened, and the list is not even read, for a result that presents nothing.
  const before = k.reads;
  for (const output of [
    'ok\n42 passing',
    '',
    'see pendingApproval in the docs',                                   // names the word, is not JSON
    '{"pendingApproval": {"artifactPath": ',                             // cut-off JSON
    JSON.stringify({ next: 'emit_step', prompt: 'do it' }),              // JSON without the block
    JSON.stringify({ pendingApproval: null }),
    JSON.stringify({ pendingApproval: 'yes' }),
    JSON.stringify({ pendingApproval: { artifactPath: '' } }),
    JSON.stringify({ pendingApproval: { artifactPath: 7 } }),
    JSON.stringify({ pendingApproval: { epicHash: 'abc' } }),
    JSON.stringify([{ pendingApproval: { artifactPath: B.mdPath } }]),   // not the response's own block
    JSON.stringify({ result: { pendingApproval: { artifactPath: B.mdPath } } }),
    JSON.stringify('pendingApproval'),
    'null',
  ]) {
    assert.equal(presentedPathOf(output), undefined, output.slice(0, 40));
    turn.toolResult(output);
  }
  await settle();
  assert.equal(k.opened.length, 1);
  assert.equal(k.reads, before, 'no read for a result that presents nothing');

  // A path that is not pending: approved meanwhile, or another repository's.
  turn.toolResult(presenting(`${ROOT}/docs/standalone/x/GONE.md`));
  turn.toolResult(presenting('/elsewhere/docs/standalone/x/PLAN-bbb-S001.md'));
  await settle();
  assert.equal(k.opened.length, 1, 'a path no pending document has opens nothing');

  // Tolerance only: a list that gives a repo-relative path still matches the block's absolute one.
  const rel = kit([{ id: 'DEF-ccc', mdPath: 'docs/epics/y/DEF.md' }, { id: 'HLD-ccc', mdPath: 'docs/epics/y/HLD.md' }]);
  const t2 = rel.presenter.begin();
  t2.toolResult(presenting(`${ROOT}/docs/epics/yy/HLD.md`));
  t2.toolResult(presenting(`${ROOT}/xdocs/epics/y/HLD.md`));
  await settle();
  assert.deepEqual(ids(rel), [], 'the tail must begin at a path separator');
  t2.toolResult(presenting(`${ROOT}/docs/epics/y/HLD.md`));
  await settle();
  assert.deepEqual(ids(rel), ['HLD-ccc']);

  // A revision of a document that was already pending before the turn is opened when it is named.
  const rev = kit([A]);
  const t3 = rev.presenter.begin();
  t3.toolResult(presenting(A.mdPath));
  t3.end();
  await settle();
  assert.deepEqual(ids(rev), ['LLD-aaa-S001']);
});

test('review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged', async () => {
  const OLD = doc('LLD-old-S001');
  const k = kit([OLD]);
  const turn = k.presenter.begin();
  await settle();
  // During the turn: a build record and a code review record appear (no tool result names them),
  // and a design the tool result does name.
  const BUILD = doc('BUILD-new-S001');
  const CR = doc('CR-new-S001');
  const LLD = doc('LLD-new-S001');
  k.list.push(BUILD, LLD, CR);
  turn.toolResult(presenting(LLD.mdPath));
  await settle();
  assert.deepEqual(ids(k), ['LLD-new-S001']);
  turn.end();
  await settle();
  assert.deepEqual(ids(k), ['LLD-new-S001', 'BUILD-new-S001', 'CR-new-S001'], 'the rest that became pending, in the list\'s order; not the one already opened, not the one pending before');
  k.list.push(doc('PLAN-late-S001'));
  turn.end();
  await settle();
  assert.equal(k.opened.length, 3, 'a second end does nothing, whatever became pending since');

  // A turn that makes nothing pending opens nothing.
  const quiet = kit([OLD]);
  const q = quiet.presenter.begin();
  q.toolResult('ok');
  q.end();
  await settle();
  assert.deepEqual(quiet.opened, []);

  // The read at the turn's END fails: nothing is opened, it is logged, the caller sees no throw.
  const endFails = kit([OLD]);
  const e = endFails.presenter.begin();
  await settle();
  endFails.list.push(BUILD);
  endFails.failReads = true;
  assert.doesNotThrow(() => e.end());
  await settle();
  assert.deepEqual(endFails.opened, []);
  assert.equal(endFails.logged.length, 1);
  assert.match(endFails.logged[0]!, /pending list could not be read at the end of the turn: daemon down/);

  // The read at the turn's START fails: what was pending before is unknown, so the end opens
  // nothing (it cannot tell what is new), while a tool result still opens what it names.
  const startFails = kit([OLD]);
  startFails.failReads = true;
  const s = startFails.presenter.begin();
  await settle();
  startFails.failReads = false;
  startFails.list.push(BUILD, LLD);
  s.toolResult(presenting(LLD.mdPath));
  s.end();
  await settle();
  assert.deepEqual(ids(startFails), ['LLD-new-S001'], 'named by the result: opened; only new by the list: not, since the start list is unknown');
  assert.match(startFails.logged[0]!, /at the start of the turn/);

  // The read for a tool result fails: nothing opened for that call; the end still works.
  const midFails = kit([OLD]);
  const m = midFails.presenter.begin();
  await settle();
  midFails.list.push(LLD);
  midFails.failReads = true;
  m.toolResult(presenting(LLD.mdPath));
  await settle();
  assert.deepEqual(midFails.opened, []);
  midFails.failReads = false;
  m.end();
  await settle();
  assert.deepEqual(ids(midFails), ['LLD-new-S001'], 'picked up at the end');

  // An open that throws is logged, is not tried again in the turn, and does not stop the others.
  const throws = kit([OLD], { open: (id) => { if (id === 'BUILD-new-S001') throw new Error('no window'); } });
  const t = throws.presenter.begin();
  await settle();
  throws.list.push(BUILD, CR);
  t.toolResult(presenting(BUILD.mdPath));
  await settle();
  t.end();
  await settle();
  assert.deepEqual(ids(throws), ['BUILD-new-S001', 'CR-new-S001'], 'the failed one once, then the other');
  assert.ok(throws.logged.some((l) => /BUILD-new-S001 could not be opened: no window/.test(l)));

  // The turn's calls keep their order however slow the reads are: a result fed before the
  // start read has answered is still judged after it.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let first = true;
  const slow = kit([OLD], { gate: async () => { if (first) { first = false; await held; } } });
  const sl = slow.presenter.begin();
  slow.list.push(LLD, BUILD);
  sl.toolResult(presenting(LLD.mdPath));
  sl.end();
  await settle();
  assert.deepEqual(slow.opened, [], 'nothing until the start read answers');
  release();
  await settle();
  assert.deepEqual(ids(slow), ['LLD-new-S001', 'BUILD-new-S001']);
});

test('review presenter: a later turn opens a document again when it is presented again; several documents in one turn are opened in order, so the last presented is the one on show', async () => {
  const k = kit([]);
  const A = doc('DEF-a');
  const B = doc('HLD-a');
  const C = doc('LLD-a-s1');
  // One turn presents three documents, one after another.
  const t1 = k.presenter.begin();
  await settle();
  k.list.push(A);
  t1.toolResult(presenting(A.mdPath));
  k.list.push(B);
  t1.toolResult(presenting(B.mdPath));
  k.list.push(C);
  t1.toolResult(presenting(C.mdPath));
  t1.end();
  await settle();
  assert.deepEqual(ids(k), ['DEF-a', 'HLD-a', 'LLD-a-s1'], 'in the order presented: the last is the one the pane shows');

  // The next turn: the three are pending before it, so its end opens none of them,
  const t2 = k.presenter.begin();
  t2.end();
  await settle();
  assert.equal(k.opened.length, 3);
  // but a revision presented in a later turn is opened again, once.
  const t3 = k.presenter.begin();
  t3.toolResult(presenting(B.mdPath));
  t3.toolResult(presenting(B.mdPath));
  t3.end();
  await settle();
  assert.deepEqual(ids(k), ['DEF-a', 'HLD-a', 'LLD-a-s1', 'HLD-a']);
});

test("review presenter: a turn begun while the one before it has not ended takes over that turn's start list and what it opened; the earlier turn's end then opens nothing and the later turn's end opens what became pending since the earlier one began", async () => {
  const OLD = doc('LLD-old-S001');
  const k = kit([OLD]);
  const A = k.presenter.begin();
  await settle();
  // Turn A makes two documents pending and a tool result names the first.
  const D1 = doc('LLD-one-S001');
  const D2 = doc('BUILD-one-S001');
  k.list.push(D1, D2);
  A.toolResult(presenting(D1.mdPath));
  await settle();
  assert.deepEqual(ids(k), ['LLD-one-S001']);

  // The user sends another message: turn B begins while A is still running.
  const readsBefore = k.reads;
  const B = k.presenter.begin();
  await settle();
  assert.equal(k.reads, readsBefore, "B reads no start list of its own: it carries A's on");
  // A, superseded, writes one more document and its process ends.
  const D3 = doc('CR-one-S001');
  k.list.push(D3);
  A.end();
  await settle();
  assert.deepEqual(ids(k), ['LLD-one-S001'], "the earlier turn's end opens nothing");
  // B's end: everything that became pending since A began and was not opened yet.
  B.end();
  await settle();
  assert.deepEqual(ids(k), ['LLD-one-S001', 'BUILD-one-S001', 'CR-one-S001'], 'D1 was opened by A and is not opened again; D2 and D3 are');

  // Both over: the next turn starts afresh, reading its own start list.
  const C = k.presenter.begin();
  await settle();
  assert.equal(k.reads > readsBefore + 1, true);
  C.toolResult(presenting(D1.mdPath));
  C.end();
  await settle();
  assert.deepEqual(ids(k).slice(3), ['LLD-one-S001'], 'a fresh turn may open again what an earlier one opened');

  // Ends in the other order (B over before A): B, the newest, opens; A's later end opens nothing more.
  const k2 = kit([]);
  const A2 = k2.presenter.begin();
  await settle();
  const B2 = k2.presenter.begin();
  k2.list.push(D1);
  B2.end();
  await settle();
  assert.deepEqual(ids(k2), ['LLD-one-S001']);
  k2.list.push(D2);
  A2.end();
  await settle();
  assert.deepEqual(ids(k2), ['LLD-one-S001'], 'not the newest: nothing');
});

// ---------------------------------------------------------------------------
// The review host's quiet open.
// ---------------------------------------------------------------------------

interface PaneKit {
  host: ReturnType<typeof createDocsReviewHost>;
  /** One entry per pane created: the options it was created with. */
  created: Array<Record<string, unknown>>;
  /** One entry per reveal of an existing pane: its argument. */
  reveals: unknown[];
  posted: Array<Record<string, unknown>>;
  close(): void;
}
function pane(): PaneKit {
  const created: Array<Record<string, unknown>> = [];
  const reveals: unknown[] = [];
  const posted: Array<Record<string, unknown>> = [];
  let onClose: (() => void) | undefined;
  const channel: ChatPanelChannel = {
    setHtml: () => {},
    postMessage: (m) => { posted.push((m as { payload: Record<string, unknown> }).payload); },
    onMessage: () => {},
    onDidDispose: (l) => { onClose = l; },
    reveal: (opts) => { reveals.push(opts); },
    dispose: () => {},
  };
  const client = {
    pending: async () => [{ id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' }],
    pendingDocuments: async () => [],
    content: async () => ({ markdown: '# Doc', openQuestions: [], blocked: false }),
    decide: async () => { throw new Error('not used'); },
  } as unknown as DocsReviewClient;
  const host = createDocsReviewHost({ createPanel: (opts) => { created.push({ ...opts }); return channel; }, client });
  return { host, created, reveals, posted, close: () => onClose?.() };
}
const TARGET = { artifactId: 'LLD-abc-s7', mdPath: '/home/dev/repo/docs/epics/x/S007/LLD.md' };
const contents = (p: PaneKit): Array<Record<string, unknown>> => p.posted.filter((m) => m['type'] === 'docs-content');

test('docs review host: openArtifact with quiet creates the pane with quiet when there is none and reveals an existing one without taking focus; without quiet both are as before', async () => {
  // QUIET, no pane yet: created with quiet, not revealed; the document is opened with reveal.
  const q = pane();
  q.host.openArtifact({ ...TARGET, quiet: true });
  await settle();
  assert.deepEqual(q.created, [{ viewType: 'insrc.docsReviewPanel', title: 'insrc docs review', quiet: true }]);
  assert.deepEqual(q.reveals, []);
  assert.equal(contents(q).length, 1);
  assert.equal(contents(q)[0]!['artifactId'], 'LLD-abc-s7');
  assert.equal(contents(q)[0]!['reveal'], true, "the pane's document view shows it");
  // QUIET, the pane exists (perhaps as a background tab): brought forward without focus, not created again.
  q.host.openArtifact({ ...TARGET, quiet: true });
  await settle();
  assert.equal(q.created.length, 1);
  assert.deepEqual(q.reveals, [{ preserveFocus: true }]);
  assert.equal(contents(q).length, 2);

  // NOT QUIET on the same pane (the delivery board): revealed as before, with no argument.
  q.host.openArtifact(TARGET);
  q.host.openArtifact({ ...TARGET, quiet: false });
  q.host.open();
  await settle();
  assert.deepEqual(q.reveals.slice(1), [undefined, undefined, undefined]);
  assert.equal(q.created.length, 1);

  // NOT QUIET, no pane: created exactly as before, with no quiet key at all.
  const b = pane();
  b.host.openArtifact(TARGET);
  await settle();
  assert.deepEqual(b.created, [{ viewType: 'insrc.docsReviewPanel', title: 'insrc docs review' }]);
  const c = pane();
  c.host.open();
  assert.deepEqual(c.created, [{ viewType: 'insrc.docsReviewPanel', title: 'insrc docs review' }]);
  // A pane the user closed is created again by the next quiet open.
  q.close();
  q.host.openArtifact({ ...TARGET, quiet: true });
  await settle();
  assert.deepEqual(q.created.at(-1), { viewType: 'insrc.docsReviewPanel', title: 'insrc docs review', quiet: true });
});

// ---- Story E20261015067b05b6:S001: the turn declares the documents it presents ----

test('a declared artifact id and a declared path each open the matching pending document once, in order', async () => {
  const A = doc('LLD-aaa-S001');
  const B = doc('PLAN-bbb-S001', 'docs/standalone/x/S001/PLAN.md');
  const C = doc('BUILD-ccc-S001');
  const k = kit([A, B, C]);
  const turn = k.presenter.begin();
  const outcome = await turn.declared(['PLAN-bbb-S001', 'docs/standalone/x/S001/PLAN.md', 'LLD-aaa-S001', B.mdPath]);
  // The id and the repo-relative path both name B, which opens once; then A; the absolute path is B again.
  assert.deepEqual(ids(k), ['PLAN-bbb-S001', 'LLD-aaa-S001']);
  assert.deepEqual(k.opened[0], `PLAN-bbb-S001@${B.mdPath}`, 'opened with the path the list gives');
  assert.deepEqual(outcome.opened, ['PLAN-bbb-S001', 'docs/standalone/x/S001/PLAN.md', 'LLD-aaa-S001', B.mdPath]);
  assert.deepEqual(outcome.notPending, []);
  // C is pending but was never declared: it is not opened.
  assert.ok(!ids(k).includes('BUILD-ccc-S001'));
});

test('a declared name that is not pending opens nothing and is reported by name', async () => {
  const A = doc('LLD-aaa-S001');
  const k = kit([A]);
  const turn = k.presenter.begin();
  const outcome = await turn.declared(['LLD-zzz-S001', 'docs/nowhere/LLD.md', 'LLD-aaa-S001']);
  assert.deepEqual(outcome, { opened: ['LLD-aaa-S001'], notPending: ['LLD-zzz-S001', 'docs/nowhere/LLD.md'], unreadable: false });
  assert.deepEqual(ids(k), ['LLD-aaa-S001']);
  // A path that is only a tail of a file name does not match (a name must be a whole path segment run).
  const partial = await k.presenter.begin().declared(['LLD.md']);
  assert.deepEqual(partial.notPending, ['LLD.md']);
});

test('the same document declared twice in a turn opens once', async () => {
  const A = doc('LLD-aaa-S001');
  const k = kit([A]);
  const turn = k.presenter.begin();
  const first = await turn.declared(['LLD-aaa-S001']);
  const second = await turn.declared(['lld-aaa-s001', 'LLD-aaa-S001']);
  assert.equal(k.opened.length, 1, 'opened once for the turn');
  assert.deepEqual(first.opened, ['LLD-aaa-S001']);
  assert.deepEqual(second.opened, ['lld-aaa-s001', 'LLD-aaa-S001'], 'still shown, so not reported as missing');
  assert.deepEqual(second.notPending, []);
});

test('an unreadable pending list and a failing open are logged and never thrown', async () => {
  const A = doc('LLD-aaa-S001');
  const B = doc('PLAN-bbb-S001');
  const k = kit([A, B], { open: (id) => { if (id === 'LLD-aaa-S001') throw new Error('pane gone'); } });
  const turn = k.presenter.begin();
  await settle();
  // A failing open: logged, the other document still opens, and the failed one is left out of the outcome.
  const outcome = await turn.declared(['LLD-aaa-S001', 'PLAN-bbb-S001']);
  assert.deepEqual(outcome, { opened: ['PLAN-bbb-S001'], notPending: [], unreadable: false });
  assert.ok(k.logged.some((m) => m.includes('LLD-aaa-S001 could not be opened') && m.includes('pane gone')), k.logged.join('\n'));
  // The failed one is not tried again in the turn.
  await turn.declared(['LLD-aaa-S001']);
  assert.equal(ids(k).filter((i) => i === 'LLD-aaa-S001').length, 1);

  // An unreadable list: nothing opens, no name is classified, it is logged, nothing is thrown.
  const k2 = kit([A]);
  const turn2 = k2.presenter.begin();
  await settle();
  k2.failReads = true;
  const down = await turn2.declared(['LLD-aaa-S001']);
  assert.deepEqual(down, { opened: [], notPending: [], unreadable: true });
  assert.deepEqual(k2.opened, []);
  assert.ok(k2.logged.some((m) => m.includes('pending list could not be read') && m.includes('daemon down')), k2.logged.join('\n'));
  // The turn goes on: a later declaration, once the list reads again, opens.
  k2.failReads = false;
  assert.deepEqual((await turn2.declared(['LLD-aaa-S001'])).opened, ['LLD-aaa-S001']);
});

test('declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable', async () => {
  const k = kit([doc('LLD-aaa-S001')]);
  const turn = k.presenter.begin();
  const outcome = await turn.declared(['LLD-aaa-S001', 'nope']);
  assert.deepEqual(Object.keys(outcome).sort(), ['notPending', 'opened', 'unreadable']);
  assert.deepEqual(outcome, { opened: ['LLD-aaa-S001'], notPending: ['nope'], unreadable: false });
  // An empty declaration opens nothing and says so.
  assert.deepEqual(await turn.declared([]), { opened: [], notPending: [], unreadable: false });
});

test("a declared artifact id matches the pending list's id without regard to the case of its story part", async () => {
  // The daemon lists LLD-<hash>-s5 for some records and LLD-<hash>-S001 for others.
  const lower = doc('LLD-abc123-s5');
  const upper = doc('LLD-def456-S001');
  const k = kit([lower, upper]);
  const turn = k.presenter.begin();
  const outcome = await turn.declared(['LLD-abc123-S5', 'LLD-def456-s001']);
  assert.deepEqual(ids(k), ['LLD-abc123-s5', 'LLD-def456-S001'], 'opened by the id the list holds');
  assert.deepEqual(outcome, { opened: ['LLD-abc123-S5', 'LLD-def456-s001'], notPending: [], unreadable: false });
});
