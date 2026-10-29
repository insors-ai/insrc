import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionProtocolTest',6);
});
