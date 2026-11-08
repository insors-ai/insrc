/**
 * Story E20261016315d510c:S003 / t10 — the repo tracker rows contract, VS Code side.
 * Renders the Repo Configuration panel from the shared fixture (see the terminal test's header) and
 * checks the Tracker section shows the same key, label, kind and note per row, in order; a row added
 * to a copy of the table appears with no change to the renderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRepoTrackerWriteHandler, renderRepoConfig } from '../repo-config.js';
import type { ConsentOutcome } from '../../surfaces/consent-gate.js';
import type { RepoFieldDef } from '../../../../src/config/repo-fields.js';
import type { RepoSettingsPayload } from '../../../../src/daemon/repo-settings.js';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../src/config/__tests__/fixtures/repo-fields-catalog.json', import.meta.url)), 'utf8'),
) as { repoFields: RepoFieldDef[]; settings: RepoSettingsPayload };

const REPO = FIXTURE.settings.repo;

const unescape = (s: string): string => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function render(fields: readonly RepoFieldDef[], settings = FIXTURE.settings): Promise<string> {
  return await renderRepoConfig({
    registeredRepos: async () => [{ path: REPO, name: 'repo-a' }],
    rawConfig: async () => ({}),
    mcpRegistration: async () => [],
    repoFields: async () => fields,
    repoSettings: async () => ({ ok: true, payload: settings }),
  })(REPO);
}

/** The Tracker section's rows as the user sees them, in display order. */
function trackerRows(html: string): Array<{ key: string; label: string; kind: string; note: string | null }> {
  const section = /<details id="insrc-tracker" class="section">([\s\S]*?)<\/details>/.exec(html)?.[1] ?? '';
  return [...section.matchAll(/<(div|label|tr) [^>]*data-kind="(status|local|policy)"[^>]*>[\s\S]*?<\/\1>/g)].map((m) => {
    const key = /data-(?:tracker|readonly)-key="([^"]*)"/.exec(m[0])![1]!;
    const label = /<(?:dt|th scope="row"|span class="tracker-label")>([^<]*)<\//.exec(m[0])![1]!;
    const note = /<span class="tracker-hint">([^<]*)<\/span>/.exec(m[0])?.[1];
    return { key: unescape(key), label: unescape(label), kind: m[2]!, note: note === undefined ? null : unescape(note) };
  });
}

const contract = (rows: ReadonlyArray<{ key: string; label: string; kind: string; note?: string | undefined }>) =>
  ['status', 'local', 'policy'].flatMap(kind => rows.filter(r => r.kind === kind)
    .map(r => ({ key: r.key, label: r.label, kind: r.kind, note: r.note ?? null })));

test('VS Code rows equal the shared catalog fixture and a new row appears', async () => {
  const initial = await render(FIXTURE.repoFields);
  assert.match(initial, /<details id="insrc-tracker" class="section"><summary class="section-head">Tracker<\/summary>/);
  assert.match(initial, /<h3 id="tracker-config-heading">Tracker configuration<\/h3>/);
  const policyTable = /<h3 id="tracker-policies-heading">Policies<\/h3><table[^>]*>([\s\S]*?)<\/table>/.exec(initial)?.[1];
  assert.ok(policyTable);
  assert.match(policyTable, /<th scope="col">Policy<\/th><th scope="col">Value<\/th>/);
  assert.doesNotMatch(policyTable, /data-tracker-key|<input|<select/);
  assert.deepEqual(trackerRows(initial), contract(FIXTURE.repoFields), 'key, label, kind and note per row, in each group');

  // A row added to a copy of the table appears with no renderer change, editable when it is local.
  const extra: RepoFieldDef = {
    key: 'reviewers', label: 'Default reviewers', type: 'string', description: 'd', group: 'Tracker', kind: 'local', note: 'saved; not used yet',
  };
  const copy = [...FIXTURE.repoFields, extra];
  const html = await render(copy);
  assert.deepEqual(trackerRows(html), contract(copy));
  assert.match(html, /data-tracker-key="reviewers"/, 'the new local row is an input');

  // A new read-only row (status or policy) appears read-only.
  const policy: RepoFieldDef = { key: 'newRule', label: 'New rule', type: 'string', description: 'd', group: 'Tracker', kind: 'policy', note: 'set by the team policy' };
  const html2 = await render([...FIXTURE.repoFields, policy]);
  assert.deepEqual(trackerRows(html2), contract([...FIXTURE.repoFields, policy]));
  assert.match(html2, /data-readonly-key="newRule"/);
  assert.doesNotMatch(html2, /data-tracker-key="newRule"/);
});

test('Tracker validates catalog values and rechecks selection and registration after consent', async () => {
  const writes: unknown[] = [];
  const notices: string[] = [];
  let current = true;
  let registered = true;
  let approve: ((value: ConsentOutcome) => void) | undefined;
  const handle = createRepoTrackerWriteHandler({
    repoFields: async () => FIXTURE.repoFields,
    registeredRepos: async () => registered ? [{ path: REPO, name: 'repo' }] : [],
    consent: { ask: () => new Promise(resolve => { approve = resolve; }) },
    writeRepoSetting: async (_repo, key, value) => { writes.push([key, value]); return { ok: true }; },
    status: { current: () => ({ state: 'ready' }), set: ({ detail }) => { if (detail) notices.push(detail); } } as Parameters<typeof createRepoTrackerWriteHandler>[0]['status'],
    logger: { warn: message => assert.fail(message) },
    refresh: () => {},
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const send = (key: string, value: string | boolean | null) => handle({ repoPath: REPO, key, value }, () => current);
  for (const value of [true, false, null]) {
    send('gitHooks', value);
    await tick();
    assert.ok(approve);
    approve('accepted');
    await tick();
  }
  approve = undefined;
  send('type', 'bogus');
  send('signin', null);
  await tick();
  assert.equal(approve, undefined);
  assert.match(notices.join(' '), /must be one of.*read-only/);

  send('gitHooks', true);
  await tick();
  current = false;
  assert.ok(approve);
  approve('accepted');
  await tick();
  current = true;
  send('gitHooks', true);
  await tick();
  registered = false;
  approve('accepted');
  await tick();
  assert.deepEqual(writes, [true, false, null].map(value => ['gitHooks', value]));
});

test('Tracker write outcomes refresh saved values and only accepted consent reaches the daemon', { timeout: 5000 }, async () => {
  const original = 'original.example.test';
  const requested = 'requested.example.test';
  const cases = [
    { consent: 'declined', outcome: 'unused', detail: undefined },
    { consent: 'dismissed', outcome: 'unused', detail: undefined },
    { consent: 'accepted', outcome: 'saved', detail: /Updated ghHost/ },
    { consent: 'accepted', outcome: 'refused', detail: /Tracker setting refused: read only/ },
    { consent: 'accepted', outcome: 'failed', detail: /Could not update the tracker setting/ },
  ] as const;

  for (const { consent, outcome, detail } of cases) {
    const events: string[] = [];
    const notices: string[] = [];
    const warnings: string[] = [];
    const refreshed = Promise.withResolvers<string>();
    let saved = original;
    const handle = createRepoTrackerWriteHandler({
      repoFields: async () => FIXTURE.repoFields,
      registeredRepos: async () => [{ path: REPO, name: 'repo' }],
      consent: { ask: async () => { events.push('consent'); return consent; } },
      writeRepoSetting: async (repo, key, value) => {
        events.push('write');
        assert.deepEqual([repo, key, value], [REPO, 'ghHost', requested]);
        if (outcome === 'failed') throw new Error('transport closed');
        if (outcome === 'refused') return { ok: false, reason: 'read only' };
        saved = requested;
        return { ok: true };
      },
      status: {
        current: () => ({ state: 'ready' }),
        set: ({ detail: notice }) => { if (notice) notices.push(notice); },
      } as Parameters<typeof createRepoTrackerWriteHandler>[0]['status'],
      logger: { warn: message => warnings.push(message) },
      refresh: () => {
        events.push('refresh');
        void render(FIXTURE.repoFields, { ...FIXTURE.settings, values: { ghHost: saved } })
          .then(refreshed.resolve, refreshed.reject);
      },
    });
    handle({ repoPath: REPO, key: 'ghHost', value: requested }, () => true);
    const html = await refreshed.promise;
    assert.deepEqual(events, consent === 'accepted' ? ['consent', 'write', 'refresh'] : ['consent', 'refresh'], outcome);
    const actual = /data-tracker-key="ghHost" value="([^"]*)"/.exec(html)?.[1];
    assert.equal(actual, outcome === 'saved' ? requested : original, outcome);
    if (detail) assert.match(notices.join(' '), detail);
    else assert.deepEqual(notices, []);
    if (outcome === 'failed') assert.match(warnings.join(' '), /transport closed/);
    else assert.deepEqual(warnings, []);
  }
});

test('Tracker escapes catalog and setting text and degrades without removing model controls', async () => {
  const read = renderRepoConfig({
    registeredRepos: async () => [{ path: REPO, name: 'repo' }],
    rawConfig: async () => ({}),
    mcpRegistration: async () => [],
    repoFields: async () => FIXTURE.repoFields.map(field => field.key === 'ghHost' ? { ...field, label: '<img>', note: '"quoted"' } : field),
    repoSettings: async () => ({ ok: true, payload: {
      ...FIXTURE.settings, values: { ghHost: '"><script>' }, policy: { ok: false, reason: '<missing>' },
    } }),
  });
  const html = await read(REPO);
  assert.match(html, /&lt;img&gt;.*&quot;&gt;&lt;script&gt;.*&quot;quoted&quot;/);
  assert.match(html, /Policy unavailable: &lt;missing&gt;/);
  assert.doesNotMatch(html, /class="tracker-policies"/);
  const degraded = await renderRepoConfig({
    registeredRepos: async () => [{ path: REPO, name: 'repo' }],
    rawConfig: async () => ({}),
    mcpRegistration: async () => [],
    repoFields: async () => { throw new Error('offline'); },
  })(REPO);
  assert.match(degraded, /Core floor/);
  assert.match(degraded, /Tracker settings are unavailable/);
  assert.doesNotMatch(degraded, /data-tracker-key/);
});
