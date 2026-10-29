import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-STATE-KT: Kotlin sc7 model matches common state/effect transcripts without platform I/O', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsManagerModelTest',2);
});
