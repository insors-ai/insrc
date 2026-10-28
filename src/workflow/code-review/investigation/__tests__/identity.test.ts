/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '../../../../design/corpus/canonical.js';
import { snapshotValue, digestValue, identifySubject } from '../identity.js';
import type { ReviewSubjectV1, ReviewRuntimePortsV1 } from '../types.js';

test('sc1/sc6 canonical identity, invalid value and type contract fixtures', () => {
 assert.equal(digestValue({ b: 2, a: [1] }), hashCanonical({ a: [1], b: 2 }));
 assert.equal(digestValue({ b: 2, a: 1 }), digestValue({ a: 1, b: 2 }));
 for (const value of [{ a: undefined }, { a: NaN }, new Date(), { get a() { throw Error('getter invoked'); } }]) {
  assert.throws(() => snapshotValue(value), { name: 'SubjectPreparationError', code: 'invalid-input' });
 }
 const cyclic: Record<string, unknown> = {}; cyclic['self'] = cyclic;
 assert.throws(() => snapshotValue(cyclic));
 assert.throws(() => snapshotValue({ a: '123456' }, 3), { code: 'resource-limit' });
 const input: Omit<ReviewSubjectV1, 'subjectId' | 'subjectDigest'> = { version: 1, repoId: 'repo', rootArtifactId: 'root', storyId: 's1',
  build: { artifactId: 'build', revision: 1, sourceCommit: 'a'.repeat(40) }, contracts: [], taskBasis: 'approved-upstream', tasks: [], packets: [], contextTree: 'b'.repeat(40), ambiguities: [] };
 const subject = identifySubject(input); assert.ok(Object.isFrozen(subject.build));
 assert.notEqual(subject.build, input.build); assert.equal(subject.subjectDigest, hashCanonical(input));
 const accept: ReviewRuntimePortsV1['stageImmutableValue'] = async (_run, value) => ({ reference: 'r', digest: digestValue(value) });
 void accept('run', { nested: { a: 1 } }); void accept('run', 'plain');
});
