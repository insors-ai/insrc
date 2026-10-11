/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGuidanceRecord } from '../validate.js';
import { recordFixture, sealRecord, specimenPaths } from './fixtures.js';
import type { GuidanceRecord } from '../contracts.js';
const validate = (record: unknown) => validateGuidanceRecord(record, { mode: 'publication', contentPaths: specimenPaths });

test('record completeness and platform examples fail closed', () => {
  const valid = sealRecord(recordFixture());
  assert.equal(validate(valid).ok, true);
  for (const property of ['provenance', 'applicability', 'noMeasurableChecksRationale']) {
    const broken = { ...valid } as Record<string, unknown>; delete broken[property];
    assert.equal(validate(broken).ok, false, property);
  }
  assert.equal(validate(sealRecord({ ...valid, checks: [{ check: 'Measure', requiredInputs: [], exceptions: [], limits: [] }] })).ok, false);
  for (const uiType of ['mobile-ios', 'mobile-android'] as const) {
    assert.equal(validate(sealRecord({ ...valid, applicability: { ...valid.applicability, uiTypes: [uiType] } })).ok, false);
    const mobile = sealRecord({ ...valid, applicability: { ...valid.applicability, uiTypes: [uiType] }, examples: valid.examples.map(e => ({ ...e, uiType })) });
    assert.equal(validate(mobile).ok, true);
    assert.equal(validate(sealRecord({ ...mobile, examples: mobile.examples.slice(0, 1) })).ok, false);
  }
  assert.equal(validateGuidanceRecord(valid, { mode: 'publication' }).ok, false);
  let calls = 0;
  const getter = { get schemaVersion() { calls++; return 1; } };
  assert.equal(validate(getter).ok, false); assert.equal(calls, 0);
});
test('authorship branches preserve attribution and require justified provenance', () => {
  for (const authorship of ['original', 'derived', 'imported', 'inferred'] as const) {
    const source = recordFixture();
    const withSources = sealRecord({ ...source, provenance: { ...source.provenance, authorship, sourceRefs: ['source:fixture'] } });
    const result = validate(withSources); assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.provenance.authorship, authorship);
    assert.equal(validate(sealRecord({ ...withSources, provenance: { ...withSources.provenance, sourceRefs: [] } })).ok, authorship === 'original');
  }
  const original = recordFixture();
  const inferred = sealRecord({ ...original, rationale: 'Independently inferred by the attributed author from the fixture scenario.', provenance: { ...original.provenance, authorship: 'inferred' } });
  assert.equal(validate(inferred).ok, true);
});
test('conditional domain payloads compose and color references must resolve', () => {
  const source = recordFixture();
  const all: GuidanceRecord = { ...source, domains: ['Color', 'Layout', 'Visual style'], domainPayload: {
    color: { roles: [{ name: 'ink', value: '#111111' }, { name: 'paper', value: '#ffffff' }], pairings: [{ foregroundRole: 'ink', backgroundRole: 'paper', usage: 'Body text' }] },
    layout: { contentPriority: ['Main task'], adaptationRules: [{ condition: 'Narrow viewport', rule: 'Stack content' }] },
    style: { composition: 'Calm', typography: 'Readable', color: 'Neutral', interaction: 'Explicit' },
  } };
  assert.equal(validate(sealRecord(all)).ok, true);
  for (const key of ['color', 'layout', 'style'] as const) {
    const domainPayload = { ...all.domainPayload }; delete domainPayload[key];
    assert.equal(validate(sealRecord({ ...all, domainPayload })).ok, false);
  }
  const color = all.domainPayload.color!;
  assert.equal(validate(sealRecord({ ...all, domainPayload: { ...all.domainPayload, color: { ...color, roles: [color.roles[0]!, color.roles[0]!] } } })).ok, false);
  assert.equal(validate(sealRecord({ ...all, domainPayload: { ...all.domainPayload, color: { ...color, pairings: [{ foregroundRole: 'missing', backgroundRole: 'paper', usage: 'Test' }] } } })).ok, false);
});
