/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016315d510c:S003 / t10 — the repo tracker rows contract, terminal side.
 *
 * One shared fixture (src/config/__tests__/fixtures/repo-fields-catalog.json) holds the
 * `repoFields` of the config.catalog payload and one repo.settings.get payload. Each client
 * (this file: terminal; vscode-plugin/.../repo-fields-contract.test.ts; jetbrains-plugin
 * RepoFieldsContractTest) renders rows from it and must show the same key, label, kind and note
 * per row, in the same order. A row added to a copy of the table appears in every client with
 * no client change.
 *
 * To regenerate the fixture's repoFields after a change to REPO_TRACKER_FIELDS, write
 * `JSON.stringify(REPO_TRACKER_FIELDS, null, 2)` into its `repoFields` (the first test fails until you do).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildSettingsRows } from '../panes/repo-settings-model.js';
import { REPO_TRACKER_FIELDS } from '../../config/repo-fields.js';
import type { RepoFieldDef } from '../../config/repo-fields.js';
import { buildSettingsCatalog } from '../../config/settings-catalog.js';
import type { RepoSettingsPayload } from '../../daemon/repo-settings.js';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../config/__tests__/fixtures/repo-fields-catalog.json', import.meta.url)), 'utf8'),
) as { repoFields: RepoFieldDef[]; settings: RepoSettingsPayload };

/** What every client must agree on, per row. */
const contract = (rows: ReadonlyArray<{ key: string; label: string; kind: string; note?: string | undefined }>) =>
  rows.map((r) => ({ key: r.key, label: r.label, kind: r.kind, note: r.note ?? null }));

test('the shared fixture equals the daemon table and the config.catalog payload', () => {
  assert.deepEqual(FIXTURE.repoFields, JSON.parse(JSON.stringify(REPO_TRACKER_FIELDS)), 'fixture repoFields == REPO_TRACKER_FIELDS');
  assert.deepEqual(JSON.parse(JSON.stringify(buildSettingsCatalog({}).repoFields)), FIXTURE.repoFields, 'and what config.catalog returns');
});

test('terminal rows equal the shared catalog fixture', () => {
  const rows = buildSettingsRows(FIXTURE.repoFields, FIXTURE.settings);
  assert.deepEqual(contract(rows), contract(FIXTURE.repoFields), 'key, label, kind and note per row, in order');
  // Only local rows are editable.
  assert.deepEqual(rows.filter((r) => r.editable).map((r) => r.key), FIXTURE.repoFields.filter((f) => f.kind === 'local').map((f) => f.key));
  // Values come from the payload.
  assert.equal(rows.find((r) => r.key === 'ghHost')?.value, 'ghe.example.com');
  assert.equal(rows.find((r) => r.key === 'signin')?.value, 'missing-signin: gh is not signed in');
});

test('a row added to a copy of the table appears in the terminal rows with no client change', () => {
  const extra: RepoFieldDef = {
    key: 'reviewers', label: 'Default reviewers', type: 'string', description: 'd', group: 'Tracker', kind: 'local', note: 'saved; not used yet',
  };
  const copy = [...FIXTURE.repoFields, extra];
  const rows = buildSettingsRows(copy, FIXTURE.settings);
  assert.deepEqual(contract(rows), contract(copy));
  const added = rows.find((r) => r.key === 'reviewers');
  assert.ok(added?.editable, 'a new local row is editable');
  assert.equal(added.value, '(not set)');
  assert.equal(added.note, 'saved; not used yet');
});
