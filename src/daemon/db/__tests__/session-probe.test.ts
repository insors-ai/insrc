import test from 'node:test';
import { runProbeMatrix } from './fixtures/session-probe-matrix.js';
test('CM-S3-COMPAT: actual source and compiled temporary edit and new draft workers validate owner revision cancel and drain without commits', async () => { await runProbeMatrix(['end']); });
test('CM-S3-EXPIRY: actual active probe deadline and replacement drain every worker and socket', async () => { await runProbeMatrix(['deadline', 'restart']); });
