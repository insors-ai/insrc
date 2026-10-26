/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSourceCapability } from '../capabilities.js';
import { capability } from './fixtures/domain-fixtures.js';

test('capability declarations reject malformed or unqualified native completeness', () => {
  assert.deepEqual(validateSourceCapability(capability), []);
  assert.deepEqual(validateSourceCapability({ ...capability, version: null, sourceRevision: 'fixture-revision' }), []);
  for (const bad of [
    { ...capability, unknown: true }, { ...capability, provider: '' }, { ...capability, version: undefined },
    { ...capability, granularity: 'future' }, { ...capability, supportedCounterBuckets: ['inputTokens'] },
    { ...capability, supportedCounterBuckets: ['outputTokens', 'outputTokens'] },
    { ...capability, version: null, sourceRevision: null }, { ...capability, evidenceRefs: [] },
    { ...capability, evidenceRefs: ['same', 'same'] }, { ...capability, qualification: 'unqualified' },
    { ...capability, qualification: 'recorded-fixture' }, { ...capability, granularity: 'invocation-total' },
    { ...capability, granularity: 'cumulative-snapshot', physicalCallCoverage: 'unknown', baselineRequired: false },
  ]) assert.ok(validateSourceCapability(bad).length > 0);
  const unknown = { ...capability, version: null, sourceRevision: null, evidenceRefs: [], qualification: 'unqualified', physicalCallCoverage: 'unknown', granularity: 'unknown', observedModelIdentity: 'unknown', inputConvention: 'unknown', reasoningInOutput: 'unknown', supportedCounterBuckets: [] };
  assert.deepEqual(validateSourceCapability(unknown), []);
  assert.equal(unknown.physicalCallCoverage, 'unknown');
  let calls = 0;
  assert.ok(validateSourceCapability(Object.defineProperty({}, 'capabilityId', { enumerable: true, get() { calls++; return 'fixture'; } })).length);
  assert.equal(calls, 0);
  assert.ok(validateSourceCapability(new Date()).length);
});

test('version/source-evidence survey distinguishes inspected wrappers from synthetic external-host cases', async () => {
  const { readFile } = await import('node:fs/promises');
  const survey = JSON.parse(await readFile(new URL('./fixtures/source-capabilities.v1.json', import.meta.url), 'utf8'));
  assert.equal(survey.schemaVersion, 1);
  assert.equal(survey.sources.length, 2);
  for (const source of survey.sources) {
    assert.match(source.lastCommit, /^[a-f0-9]{40}$/); assert.match(source.blob, /^[a-f0-9]{40}$/);
  }
  for (const declaration of survey.capabilities) {
    assert.deepEqual(validateSourceCapability(declaration), []);
    assert.equal(declaration.physicalCallCoverage === 'complete', false);
    assert.equal(declaration.reasoningInOutput, 'unknown');
    if (declaration.provider === 'synthetic-external-host') {
      assert.equal(declaration.qualification, 'recorded-fixture');
      assert.ok(declaration.evidenceRefs.every((ref: string) => ref.includes('synthetic')));
      assert.ok(validateSourceCapability({ ...declaration, physicalCallCoverage: 'complete' }).length);
      if (declaration.granularity === 'cumulative-snapshot') {
        assert.equal(declaration.baselineRequired, true);
        assert.ok(validateSourceCapability({ ...declaration, baselineRequired: false }).length);
      }
    } else if (declaration.transport === 'cli') {
      assert.equal(declaration.granularity, 'unknown');
      assert.deepEqual(declaration.supportedCounterBuckets, []);
      assert.ok(declaration.version);
    }
  }
});

test('Ollama source final missing-counter warm-up and zero cases preserve absent metrics without estimates', async () => {
  const { readFile } = await import('node:fs/promises');
  const { OllamaProvider } = await import('../../../agent/providers/ollama.js');
  const survey = JSON.parse(await readFile(new URL('./fixtures/source-capabilities.v1.json', import.meta.url), 'utf8'));
  for (const scenario of survey.ollamaCases) {
    const provider = new OllamaProvider('synthetic-test-model');
    (provider as unknown as { client: unknown }).client = {
      async chat() { return (async function* () { yield { message: { content: '' }, ...scenario.chunk }; })(); },
    };
    const response = await provider.complete([{ role: 'user', content: 'synthetic' }]);
    assert.deepEqual(response.usage ?? null, scenario.expectedUsage, scenario.name);
    if (response.usage) {
      assert.equal(response.usage.cacheReadTokens, undefined);
      assert.equal(response.usage.cacheWriteTokens, undefined);
    }
  }
});
