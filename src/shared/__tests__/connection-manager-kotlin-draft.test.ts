import assert from 'node:assert/strict';
import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';
import { decodePublicConnectionPatch } from '../connection-manager/wire.js';

test('CM-S5-FORM-KT: Kotlin descriptor/credential serialization and dirty navigation parity without Settings persistence', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionDraftTest',4);
});
test('CM-S5-FORM-KT: shared public fields require strict UTF8 percent decoding in both clients',()=>{
 for(const c of loadConnectionCorpus().publicFieldCases){
  const value={kind:'csv',path:c.value};
  if(c.valid)assert.deepEqual(decodePublicConnectionPatch(value),value);else assert.throws(()=>decodePublicConnectionPatch(value));
 }
});
