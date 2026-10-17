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

import { renderRepoConfig } from '../repo-config.js';
import type { RepoFieldDef } from '../../../../src/config/repo-fields.js';
import type { RepoSettingsPayload } from '../../../../src/daemon/repo-settings.js';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../src/config/__tests__/fixtures/repo-fields-catalog.json', import.meta.url)), 'utf8'),
) as { repoFields: RepoFieldDef[]; settings: RepoSettingsPayload };

const REPO = FIXTURE.settings.repo;

const unescape = (s: string): string => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function render(fields: readonly RepoFieldDef[]): Promise<string> {
  return await renderRepoConfig({
    registeredRepos: async () => [{ path: REPO, name: 'repo-a' }],
    rawConfig: async () => ({}),
    repoFields: async () => fields,
    repoSettings: async () => ({ ok: true, payload: FIXTURE.settings }),
  })(REPO);
}

/** The Tracker section's rows as the user sees them: key, label, kind and the row's own note. */
function trackerRows(html: string): Array<{ key: string; label: string; kind: string; note: string | null }> {
  const section = /<section id="insrc-tracker">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  return [...section.matchAll(/<label class="field tracker-row" data-kind="([^"]*)">([\s\S]*?)<\/label>/g)].map((m) => {
    const body = m[2]!;
    const key = /data-(?:tracker|readonly)-key="([^"]*)"/.exec(body)![1]!;
    const label = unescape(body.slice(0, body.search(/ <(?:input|span class="value)/)));
    const notes = [...body.matchAll(/<span class="note">([\s\S]*?)<\/span>/g)].map((n) => unescape(n[1]!)).filter((n) => n !== '(read-only)');
    return { key: unescape(key), label, kind: m[1]!, note: notes[0] ?? null };
  });
}

const contract = (rows: ReadonlyArray<{ key: string; label: string; kind: string; note?: string | undefined }>) =>
  rows.map((r) => ({ key: r.key, label: r.label, kind: r.kind, note: r.note ?? null }));

test('VS Code rows equal the shared catalog fixture and a new row appears', async () => {
  const rows = trackerRows(await render(FIXTURE.repoFields));
  assert.deepEqual(rows, contract(FIXTURE.repoFields), 'key, label, kind and note per row, in order');

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
