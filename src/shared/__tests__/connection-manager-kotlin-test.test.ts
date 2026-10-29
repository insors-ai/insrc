import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-TEST-KT: Kotlin test identity/cancel parity, disposed-view and EDT delivery guards',{timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionDraftTestsTest',4);
});
