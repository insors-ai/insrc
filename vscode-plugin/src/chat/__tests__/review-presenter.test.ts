// Story E20261013e62a9269:S001 — a document a chat turn presents for approval is opened in
// the review pane: the presenter's rule, and the review host's quiet open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPresenter, type PendingDocument } from '../review-presenter.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing', async () => {
  const A = doc('LLD-aaa-S001');
  const B = doc('PLAN-bbb-S001');
  const k = kit([A]);
  const turn = k.presenter.begin();
  await settle();
  // The turn's work makes a document pending and a result names it, as a workflow's done response does.
  k.list.push(B);
  const handle = turn as unknown as Record<string, unknown>;
  assert.equal(handle['toolResult'], undefined, 'the handle takes no tool result');
  assert.equal(typeof handle['declared'], 'function');
  assert.equal(typeof handle['end'], 'function');
  // Even a result that is handed over by a caller still on the old contract is not read.
  (handle['toolResult'] as ((o: string) => void) | undefined)?.(presenting(B.mdPath));
  turn.end();
  turn.end(); // a second call does nothing
  await settle();
  assert.deepEqual(k.opened, [], 'nothing opens: not for the result, not for what became pending, not at the end');
  assert.equal(k.reads, 0, 'the pending list is not even read without a declaration');

  // A later turn is as fresh: a document pending before it began is opened only when declared.
  const next = k.presenter.begin();
  next.end();
  await settle();
  assert.deepEqual(k.opened, []);
  assert.deepEqual(ids(k), []);
  const out = await k.presenter.begin().declared([B.id]);
  assert.deepEqual(out.opened, [B.id]);
  assert.deepEqual(ids(k), [B.id]);
});

test('the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const mod = (await import('../review-presenter.js')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(mod).sort(), ['createReviewPresenter'], 'the module exports only the presenter factory (and types)');
  for (const file of ['review-presenter.ts', 'chat-panel.ts']) {
    const text = readFileSync(join(here, '..', file), 'utf8');
    assert.ok(!text.includes('presentedPathOf'), `${file} no longer names presentedPathOf`);
    assert.ok(!text.includes('pendingApproval'), `${file} no longer looks for a pendingApproval block`);
    assert.ok(!/\.toolResult\(/.test(text), `${file} no longer passes a tool result to the presenter`);
  }
  const presenter = readFileSync(join(here, '..', 'review-presenter.ts'), 'utf8');
  assert.ok(!/state\.before|before:\s|became pending/.test(presenter.replace(/\/\*[\s\S]*?\*\//g, '')), 'no start list, so no end-of-turn guess');
});

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
