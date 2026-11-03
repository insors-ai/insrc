import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-RENDER-KT: native Swing manager event wiring, EDT/disposal guards, labels/password controls and immediate-action separation',{timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsManagerPanelTest',6);
});
