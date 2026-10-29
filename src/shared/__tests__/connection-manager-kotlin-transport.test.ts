import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-TRANSPORT-KT: actual Kotlin socket UTF8 framing, partial writes, multiplexing, bounded limits, disposal and one-shot compatibility', {timeout:180000},()=>{
 runConnectionJUnit('ai.insors.insrc.jetbrains.daemon.PersistentDaemonLaneTest',10);
 runConnectionJUnit('ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpcParseTest',13);
});
