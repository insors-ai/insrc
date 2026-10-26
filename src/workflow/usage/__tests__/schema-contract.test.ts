/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('types preserve HLD contracts and reject invalid v1 payloads', () => {
  const fixture = fileURLToPath(new URL('./fixtures/types-contract.ts', import.meta.url));
  const output = execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'), '--noEmit', '--strict',
    '--exactOptionalPropertyTypes', '--noUncheckedIndexedAccess', '--skipLibCheck',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022',
    '--resolveJsonModule', '--esModuleInterop', '--types', 'node', '--pretty', 'false', fixture,
  ], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(output, '');
});

import { Ajv } from 'ajv';
import {
  createUsageAvroType, ledgerRecordV1Schema, ledgerRecordV1AvroSchema,
} from '../schemas.js';

const binding = {
  repo: '/repo', rootArtifactId: 'EPIC-0123456789abcdef', artifactId: 'TASK-0123456789abcdef-s1-t1',
  workItemId: 's1/t1', workflowRunId: 'run', version: 'v1', provenance: 'stored-owner',
};
const observation = {
  outcome: 'success', reportedModel: null, finishedAt: '2026-10-26T00:00:00.000Z', quality: 'reported',
  counters: { inputUncachedTokens: Number.MAX_SAFE_INTEGER, cacheReadTokens: null, cacheWriteTokens: 0, outputTokens: 3, reasoningTokens: null },
  normalizationVersion: 'disjoint-v1', nativeUnit: 'tokens', sourceCapabilityId: 'cap', reason: null, cumulative: null,
};
const context = {
  logicalRequestId: 'logical', invocationId: null, nativeSessionId: null, parentCallId: null,
  workflow: 'build', runId: 'run', stepId: 'step', activity: 'task-implement', attempt: 1,
  source: { provider: 'fixture', transport: 'test', version: null, evidenceId: 'evidence' },
  granularity: 'model-call', modelSliceId: 'slice', modelKind: 'completion', requestedModel: 'requested', reportedModel: null,
  review: null, binding,
};
const transfer = {
  transferId: 'transfer', originalObservationRef: { rootArtifactId: binding.rootArtifactId, eventId: 'finish', callId: 'call' },
  sourceRootId: binding.rootArtifactId, destinationRootId: 'EPIC-fedcba9876543210',
  fromArtifactId: binding.artifactId, destinationArtifactId: 'LLD-fedcba9876543210-s1', expectedBindingVersion: 'v1', reason: 'fixture',
};
function envelope(recordKind: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 1, eventId: 'event', rootArtifactId: binding.rootArtifactId, artifactId: binding.artifactId,
    sequence: Number.MAX_SAFE_INTEGER, recordedAt: '2026-10-26T00:00:00.000Z', recordKind, payloadDigest: 'a'.repeat(64),
    callId: null, context: null, observation: null, control: null, ...payload };
}
const fixtures = [
  envelope('request.started', { callId: 'call', context }),
  envelope('request.finished', { callId: 'call', observation }),
  envelope('usage.corrected', { callId: 'call', observation, control: { supersedesEventId: 'previous', reason: 'fixture', provenanceEventIds: [] } }),
  envelope('usage.reconciled', { control: { group: { invocationId: 'invocation', modelSliceId: 'slice', isolatedCallId: null }, candidateEventIds: ['finish'], selectedEventIds: ['finish'], excludedEventIds: [], previousReconciliationEventId: null, coverage: 'aggregate-fallback', sourceCapabilityId: 'cap', evidenceEventIds: [], reason: 'fixture' } }),
  ...['root.reserved', 'artifact.bound', 'binding.reconciled'].map(kind => envelope(kind, { control: { binding, expectedPreviousVersion: null, reason: 'fixture', authorityEvidenceId: 'evidence' } })),
  envelope('batch.commit', { control: { batchId: 'batch', eventIds: ['finish'], priorDigest: 'prior', groupDigest: 'group' } }),
  envelope('transfer.prepared', { control: { ...transfer, mode: 'cross-root', preparedEventId: null, acceptedEventId: null } }),
  envelope('transfer.accepted', { control: { ...transfer, mode: 'cross-root', preparedEventId: 'prepare', acceptedEventId: null } }),
  envelope('transfer.committed', { control: { ...transfer, mode: 'cross-root', preparedEventId: 'prepare', acceptedEventId: 'accept' } }),
  envelope('transfer.committed', { control: { ...transfer, destinationRootId: transfer.sourceRootId, mode: 'same-root', preparedEventId: null, acceptedEventId: null } }),
];

// The test removes explicit Avro branch wrappers, retaining every field and null.
function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrap);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value);
  if (entries.length === 1 && /^(insrc\.usage\.v1\.|string$|long$)/.test(entries[0]![0])) return unwrap(entries[0]![1]);
  return Object.fromEntries(entries.map(([key, child]) => [key, unwrap(child)]));
}

test('logical and typed Avro schemas preserve v1 payloads and reject illegal shapes', () => {
  const validate = new Ajv({ strict: false, useDefaults: false, removeAdditional: false }).compile(ledgerRecordV1Schema);
  const type = createUsageAvroType();
  for (const fixture of fixtures) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    const encoded = type.toBuffer(type.clone(fixture, { wrapUnions: true }));
    const decoded = unwrap(type.fromBuffer(encoded));
    assert.deepEqual(decoded, fixture, fixture.recordKind as string);
    assert.equal(validate(decoded), true);
  }
  const finish = fixtures[1]!;
  for (const invalid of [
    { ...finish, future: true }, { ...finish, schemaVersion: 2 }, { ...finish, recordKind: 'future' },
    { ...finish, callId: null }, { ...finish, context }, { ...finish, observation: null },
    { ...finish, sequence: Number.MAX_SAFE_INTEGER + 1 }, { ...finish, sequence: -1 },
    { ...finish, observation: { ...observation, counters: { ...observation.counters, outputTokens: 0.5 } } },
    { ...finish, observation: { ...observation, counters: { ...observation.counters, outputTokens: -1 } } },
    { ...finish, observation: { ...observation, counters: { ...observation.counters, outputTokens: Number.MAX_SAFE_INTEGER + 1 } } },
    { ...finish, observation: { ...observation, counters: { ...observation.counters, tokens: 1 } } },
    { ...finish, observation: { ...observation, reportedModel: undefined } },
    envelope('transfer.prepared', { control: { ...transfer, mode: 'same-root', preparedEventId: null, acceptedEventId: null } }),
    envelope('transfer.committed', { control: { ...transfer, mode: 'cross-root', preparedEventId: null, acceptedEventId: null } }),
    envelope('transfer.committed', { control: { ...transfer, mode: 'same-root', preparedEventId: 'prepare', acceptedEventId: 'accept' } }),
  ]) assert.equal(validate(invalid), false, JSON.stringify(invalid));

  // Nullable Avro defaults are physical decoding defaults, never permission for
  // the logical boundary to silently fill absent source fields before hashing.
  function checkDefaults(schema: unknown): void {
    if (Array.isArray(schema)) { for (const child of schema) checkDefaults(child); return; }
    if (!schema || typeof schema !== 'object') return;
    const item = schema as Record<string, unknown>;
    if (Array.isArray(item.fields)) for (const field of item.fields as Record<string, unknown>[]) {
      if (field.type === 'null' || Array.isArray(field.type) && field.type[0] === 'null') assert.equal(field.default, null);
    }
    for (const child of Object.values(item)) checkDefaults(child);
  }
  checkDefaults(ledgerRecordV1AvroSchema);
  const missingNull = { ...context } as Record<string, unknown>;
  delete missingNull.reportedModel;
  assert.equal(validate(envelope('request.started', { callId: 'call', context: missingNull })), false);
  assert.deepEqual(unwrap(type.clone(envelope('request.started', { callId: 'call', context: missingNull }), { wrapUnions: true })), fixtures[0]);
  assert.equal(Object.isFrozen(ledgerRecordV1Schema.$defs.Context.properties), true);
  assert.equal(Object.isFrozen(ledgerRecordV1AvroSchema.fields), true);
});

test('isolated compiled-output public imports load matching schemas and round-trip records with no source tree', async () => {
  const { mkdtemp, cp, writeFile, symlink, readFile, rm, stat } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const isolated = await mkdtemp(join(tmpdir(), 'insrc-usage-package-'));
  try {
    const compiled = join(isolated, 'compiled'), packaged = join(isolated, 'package');
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', join(root, 'tsconfig.json'), '--outDir', compiled], { encoding: 'utf8', timeout: 60_000 });
    await cp(join(compiled, 'workflow/usage'), join(packaged, 'usage'), { recursive: true });
    await cp(join(compiled, 'workflow/artifact-ids.js'), join(packaged, 'artifact-ids.js'));
    await writeFile(join(packaged, 'package.json'), JSON.stringify({ type: 'module' }));
    await symlink(resolve(root, 'node_modules'), join(packaged, 'node_modules'), 'dir');
    // The test imports only this production subset; sibling modules are absent.
    await rm(compiled, { recursive: true });
    await assert.rejects(stat(join(isolated, 'src')));
    await assert.rejects(stat(join(packaged, 'src')));
    for (const name of ['ledger-record.v1.schema.json', 'ledger-record.v1.avsc.json']) {
      // TypeScript reformats JSON on emit; compare the complete schema value.
      const digest = (bytes: Buffer) => createHash('sha256').update(JSON.stringify(JSON.parse(bytes.toString('utf8')))).digest('hex');
      assert.equal(digest(await readFile(join(packaged, 'usage', name))), digest(await readFile(new URL(`../${name}`, import.meta.url))));
    }
    const script = `
      import assert from 'node:assert/strict';
      import { DefaultUsageReducer, DefaultUsageAttributionPolicy, ledgerRecordV1Schema, ledgerRecordV1AvroSchema, createUsageAvroType } from './usage/index.js';
      assert.ok(new DefaultUsageReducer()); assert.ok(new DefaultUsageAttributionPolicy());
      assert.equal(Object.isFrozen(ledgerRecordV1Schema), true);
      assert.equal(Object.isFrozen(ledgerRecordV1AvroSchema), true);
      const type = createUsageAvroType();
      const fixtures = ${JSON.stringify(fixtures)};
      const unwrap = ${unwrap.toString()};
      for (const record of fixtures) assert.deepEqual(unwrap(type.fromBuffer(type.toBuffer(type.clone(record, { wrapUnions: true })))), record);
      process.stdout.write('packaged-roundtrips-ok');
    `;
    await writeFile(join(packaged, 'smoke.mjs'), script);
    assert.equal(execFileSync(process.execPath, [join(packaged, 'smoke.mjs')], { cwd: packaged, encoding: 'utf8', timeout: 30_000 }), 'packaged-roundtrips-ok');
  } finally { await rm(isolated, { recursive: true, force: true }); }
});
