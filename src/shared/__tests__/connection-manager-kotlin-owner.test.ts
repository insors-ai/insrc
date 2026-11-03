import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-OWNER-KT: actual PROJECT Disposable owner independent from APP gateway and manager views', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsSessionServiceTest',4);
});
