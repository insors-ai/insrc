import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-OUTCOME-KT: project-memory unknown-operation retention and scope-lane recovery with no repeated create', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionMutationControllerTest',6);
});
