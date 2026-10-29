import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { connectionCorpusDirectory, loadConnectionCorpus, verifyConnectionCorpus } from './fixtures/connection-corpus.js';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index', () => {
 const corpus = loadConnectionCorpus();
 assert.equal(corpus.wire.filter(c => c.valid).length, 8);
 assert.equal(corpus.wire.filter(c => !c.valid).length, 10);
 assert.equal(new Set(corpus.wire.map(c => c.id)).size, corpus.wire.length);
 assert.equal(corpus.transcripts.length, 12);
 assert.ok(corpus.transcripts.every(c => c.events.length && c.expected && Array.isArray(c.effects)));
 const lld = JSON.parse(readFileSync(new URL('../../../.insrc/artifacts/LLD-484fcef7efaf229e-s5.json', import.meta.url), 'utf8'));
 const subjects = lld.body.testStrategy.testLevels.flatMap((level: { subjects: string[] }) => level.subjects);
 assert.deepEqual(corpus.coverage.map(c => c.requirement), subjects);
 assert.equal(new Set(corpus.coverage.map(c => c.subject)).size, 20);
 assert.ok(corpus.coverage.every(c => c.acceptance === 'pending' && c.fixtureEvidenceOnly));
 const snapshots = JSON.parse(readFileSync(new URL('../../../docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/consumer-contract-fixtures.json', import.meta.url), 'utf8'));
 assert.deepEqual(corpus.removalSnapshots, snapshots.cases);
 assert.equal(corpus.removalSnapshots.length, 20);
 const bytes = readFileSync(new URL('corpus.json', connectionCorpusDirectory));
 const manifest = JSON.parse(readFileSync(new URL('manifest.json', connectionCorpusDirectory), 'utf8'));
 assert.throws(() => verifyConnectionCorpus(Buffer.concat([bytes, Buffer.from(' ')]), manifest), /digest mismatch/);
 assert.throws(() => verifyConnectionCorpus(bytes, { ...manifest, version: 2 }), /version/);
 const next = Buffer.from(JSON.stringify({ ...corpus, version: 2 }));
 assert.throws(() => verifyConnectionCorpus(next, { ...manifest, sha256: createHash('sha256').update(next).digest('hex') }), /version/);
 const native = corpus.coverage.find(c => c.subject === 'CM-S5-UI');
 assert.equal(native?.requiredEvidence, 'native/live');
 assert.equal(corpus.fixturesAreAcceptance, false);
 assert.equal(corpus.releaseEnabled, false);
});

test('CM-S5-SYNC-FIXTURES: JUnit reads the identical packaged corpus and rejects digest/version drift', { timeout: 180000 }, () => {
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionCorpusTest',2);
});
