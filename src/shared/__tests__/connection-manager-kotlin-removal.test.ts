import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-REMOVE-KT: S004 snapshots plus actual Kotlin effect paths preserve old-generation cleanup and source-data guarantee',{timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionRemovalsTest',4);
});
