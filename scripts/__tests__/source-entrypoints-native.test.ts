import test from 'node:test';
import { matrix } from './helpers/source-entrypoint-matrix.js';
// Controlled source/application fixtures prove routing and ownership. Production native/data qualification is t9–t11.
test('Current packaged installer upgrades existing legacy/bound target without old npm', { timeout: 1_800_000, skip: process.platform !== 'darwin' }, async t => {
 t.diagnostic(`Entrypoint receipts: ${await matrix(false)}`);
});
test('Shell selected-root routing and update/restart semantics under hostile PATH', { timeout: 2_400_000, skip: process.platform !== 'darwin' }, async t => {
 t.diagnostic(`Shell receipts: ${await matrix(true)}`);
});
