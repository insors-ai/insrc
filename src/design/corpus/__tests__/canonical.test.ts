import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashCanonical, hashBytes, CorpusInputError } from '../canonical.js';

test('canonical golden bytes and SHA256 match independent vectors', () => {
  assert.equal(canonicalJson({ z: -0, a: [true, null, 'é'] }), '{"a":[true,null,"é"],"z":0}');
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(hashCanonical({ b: 2, a: 1 }), '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  assert.equal(hashBytes('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(hashCanonical(['a', 'b']), hashCanonical(['b', 'a']));
});
test('canonical input rejects unsafe JSON without invoking accessors', () => {
  let calls = 0;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { calls++; return 1; } });
  const cyclic: unknown[] = []; cyclic.push(cyclic);
  for (const value of [undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1n, Symbol(), () => 1,
    '\ud800', '\udc00', new Date(), getter, cyclic, [undefined], new Array(2), { [Symbol()]: 1 }]) {
    assert.throws(() => canonicalJson(value), CorpusInputError);
  }
  assert.equal(calls, 0);
  assert.equal(canonicalJson('😀'), '"😀"');
  assert.equal(canonicalJson({ a: { b: 1 }, c: { b: 1 } }), '{"a":{"b":1},"c":{"b":1}}');
});
test('canonical depth and byte limits fail explicitly', () => {
  assert.equal(canonicalJson('a', 3), '"a"');
  assert.throws(() => canonicalJson('a', 2), /limit/);
  let deep: unknown = 0; for (let i = 0; i < 66; i++) deep = [deep];
  assert.throws(() => canonicalJson(deep), /limit/);
  assert.throws(() => canonicalJson('x'.repeat(1024 * 1024)), /limit/);
});
