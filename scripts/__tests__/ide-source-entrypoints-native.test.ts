import test from 'node:test';
import { matrix } from './helpers/source-entrypoint-matrix.js';
test('VS Code controller reaches packaged current bootstrap and selected runtime', { timeout: 1_800_000, skip: process.platform !== 'darwin' }, async t => {
 t.diagnostic(`IDE source-routing receipts: ${await matrix(false, true)}`);
});
