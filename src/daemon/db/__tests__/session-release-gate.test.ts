import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyConnectionManagementRelease, CONNECTION_FOUNDATION_GATE_FILES, CONNECTION_TEST_GATE_FILES, CONNECTION_SESSION_GATE_FILES, CONNECTION_REMOVAL_GATE_FILES } from '../management-enablement.js';

const root = new URL('../../../../', import.meta.url);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const scopes = ['sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sc6', 'sc7', 'sc8'];
type Build = { version: number; producerDigest: string; sourceFiles: Record<string, string>; compiledFiles: Record<string, string> };
/** Private verifier input, never shipped inventory or product acceptance evidence. */
function verificationInventory(sourceFiles: Record<string, string>): Buffer {
	return Buffer.from(JSON.stringify({
		productionFiles: sourceFiles,
		files: Object.fromEntries(Object.entries(sourceFiles).map(([path, sourceDigest]) => ['src/' + path, {
			sourceDigest, classification: 'verification-fixture',
			rationale: 'Private copied verifier fixture; no product evidence claim.',
		}])),
	}));
}
test('CM-S3-GATE: stale/missing/mixed source+compiled evidence fails closed and release stays disabled', { timeout: 120000 }, async () => {
	const directory = await mkdtemp(join(tmpdir(), 'cm-session-gate-'));
	try {
		const build = JSON.parse(await readFile(new URL('out/assets/connection-management-build.json', root), 'utf8')) as Build;
		const inventoryBytes = verificationInventory(build.sourceFiles);
		// Synthetic completion statuses are private positive verifier controls, never shipped/client acceptance.
		const report = JSON.parse(await readFile(new URL('src/assets/connection-management-evidence.json', root), 'utf8'));
		report.releaseReady = true;
		for (const item of Object.values(report.externalPrerequisites) as any[]) item.status = 'verified';
		for (const client of Object.values(report.externalPrerequisites.S005.clients) as any[]) { client.status = 'verified'; client.evidence = ['private-verification-fixture']; }
		for (const proof of Object.values(report.proofs) as any[]) { proof.status = 'verified'; if (!proof.records.length) proof.records = [{ privateVerificationFixture: true }]; }
		const reportBytes = JSON.stringify(report); await writeFile(join(directory, 'inventory.json'), inventoryBytes); await writeFile(join(directory, 'report.json'), reportBytes);
		const valid = { version: 2, ready: true, sourceFiles: build.sourceFiles, compiledFiles: build.compiledFiles, inventoryFile: 'inventory.json', testReportFile: 'report.json', inventoryDigest: digest(inventoryBytes), testReportDigest: digest(reportBytes), scopes };
		const path = join(directory, 'proof.json');
		const compiled = await import(new URL('out/daemon/db/management-enablement.js', root).href) as typeof import('../management-enablement.js');
		for (const verify of [connectionManagementEnablement, compiled.verifyConnectionManagementRelease]) {
			const check = async (proof: unknown) => { await writeFile(path, JSON.stringify(proof)); return (await verify(pathToFileURL(path), ['sc5'])).ready; };
			assert.equal(await check(valid), true, 'a complete current build must be a positive verification control');
   assert.equal((await verify(pathToFileURL(path),['sc6'])).ready,true,'sc6 standalone verification still consumes full session prerequisites');
			// A new build must not turn an older, self-consistent inventory into current evidence.
			const stale = JSON.parse(inventoryBytes.toString());
			stale.productionFiles['shared/connection-persistence.ts'] = '0'.repeat(64);
			stale.files['src/shared/connection-persistence.ts'].sourceDigest = '0'.repeat(64);
			const staleBytes = JSON.stringify(stale);
			await writeFile(join(directory, 'inventory.json'), staleBytes);
			assert.equal(await check({ ...valid, inventoryDigest: digest(staleBytes) }), false);
			await writeFile(join(directory, 'inventory.json'), inventoryBytes);
			for (const proof of [
				{ ...valid, inventoryDigest: 'a'.repeat(64) }, { ...valid, testReportDigest: 'b'.repeat(64) }, { ...valid, inventoryFile: 'missing.json' }, { ...valid, testReportFile: 'missing.json' },
				{ ...valid, ready: false }, { ...valid, sourceFiles: {} }, { ...valid, compiledFiles: {} },
				{ ...valid, scopes: scopes.filter(scope => scope !== 'sc7') }, { ...valid, scopes: scopes.filter(scope => scope !== 'sc6') },
				{ ...valid, sourceFiles: { ...valid.sourceFiles, 'shared/connection-persistence.ts': '0'.repeat(64) } },
				{ ...valid, compiledFiles: { ...valid.compiledFiles, 'shared/connection-persistence.js': '0'.repeat(64) } },
				{ ...valid, sourceFiles: valid.compiledFiles, compiledFiles: valid.sourceFiles },
				{ ...valid, sourceFiles: { ...valid.sourceFiles, '../outside.ts': '0'.repeat(64) } },
			]) assert.equal(await check(proof), false);
			await writeFile(join(directory, 'inventory.json'), Buffer.concat([inventoryBytes, Buffer.from(' ')])); assert.equal(await check(valid), false); await writeFile(join(directory, 'inventory.json'), inventoryBytes);
			await writeFile(join(directory, 'report.json'), reportBytes + ' '); assert.equal(await check(valid), false); await writeFile(join(directory, 'report.json'), reportBytes);
			const pending = JSON.stringify({ ...report, releaseReady: false }); await writeFile(join(directory, 'report.json'), pending); assert.equal(await check({ ...valid, testReportDigest: digest(pending) }), false); await writeFile(join(directory, 'report.json'), reportBytes);
			for (const key of Object.keys(report.externalPrerequisites)) {
				const pendingReport = JSON.parse(reportBytes); pendingReport.externalPrerequisites[key].status = 'pending'; const bytes = JSON.stringify(pendingReport); await writeFile(join(directory, 'report.json'), bytes);
				assert.equal(await check({ ...valid, testReportDigest: digest(bytes) }), false, key + ' pending cannot be cleared by a ready flag');
    assert.equal((await verify(pathToFileURL(path),['sc6'])).ready,false,key+' pending also blocks sc6-only verifier calls');
			}
			await writeFile(join(directory, 'report.json'), reportBytes);
			const incomplete = JSON.parse(inventoryBytes.toString()); delete incomplete.files['src/shared/connection-persistence.ts']; const incompleteBytes = JSON.stringify(incomplete); await writeFile(join(directory, 'inventory.json'), incompleteBytes);
			assert.equal(await check({ ...valid, inventoryDigest: digest(incompleteBytes) }), false); await writeFile(join(directory, 'inventory.json'), inventoryBytes);
			assert.equal((await verify(new URL('missing.json', pathToFileURL(directory + '/')), ['sc5'])).ready, false);
			assert.equal((await verify(undefined, ['sc5'])).ready, false, 'shipped capability must stay disabled');
		}
		for (const location of ['src', 'out']) {
			const shipped = JSON.parse(await readFile(new URL(location + '/assets/connection-management-gates.json', root), 'utf8')) as { ready: boolean; scopes: string[] };
			assert.equal(shipped.ready, false); assert.deepEqual(shipped.scopes, []);
		}

		// A private copied verifier proves stale-build linkage without changing shared source/out files.
		const copy = join(directory, 'deployment');
		const names = [...new Set([...CONNECTION_FOUNDATION_GATE_FILES, ...CONNECTION_TEST_GATE_FILES, ...CONNECTION_SESSION_GATE_FILES, ...CONNECTION_REMOVAL_GATE_FILES, 'shared/pure-session-helper'])];
		const sourceFiles: Record<string, string> = {}, compiledFiles: Record<string, string> = {};
		const actualGate = await readFile(new URL('out/daemon/db/management-enablement.js', root), 'utf8');
		const gateCode = actualGate.replace("'./management-tickets.js'", JSON.stringify(new URL('out/daemon/db/management-tickets.js', root).href)); assert.notEqual(gateCode, actualGate);
		for (const name of names) {
			for (const [tree, extension, content, files] of [
				['src', '.ts', '// source generation one: ' + name, sourceFiles],
				['out', '.js', name === 'daemon/db/management-enablement' ? gateCode : '// compiled generation one: ' + name, compiledFiles],
			] as const) {
				const relative = name + extension, target = join(copy, tree, relative); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); files[relative] = digest(content);
			}
		}
		const producer = await readFile(new URL('copy-assets.mjs', root)); await writeFile(join(copy, 'copy-assets.mjs'), producer); await writeFile(join(copy, 'package.json'), '{"type":"module"}');
		const manifestPath = join(copy, 'out/assets/connection-management-build.json'); await mkdir(dirname(manifestPath), { recursive: true });
		const manifest = { version: 1, producerDigest: digest(producer), sourceFiles: { ...sourceFiles }, compiledFiles: { ...compiledFiles } };
		await writeFile(manifestPath, JSON.stringify(manifest));
		const copied = await import(pathToFileURL(join(copy, 'out/daemon/db/management-enablement.js')).href) as typeof import('../management-enablement.js');
		const proof = { ...valid, sourceFiles, compiledFiles }, proofPath = pathToFileURL(join(copy, 'proof.json'));
		const ready = async () => {
			const inventory = verificationInventory(sourceFiles);
			await writeFile(join(copy, 'inventory.json'), inventory); await writeFile(join(copy, 'report.json'), reportBytes); proof.inventoryDigest = digest(inventory); proof.testReportDigest = digest(reportBytes);
			await writeFile(proofPath, JSON.stringify(proof)); return (await copied.verifyConnectionManagementRelease(proofPath, ['sc5'])).ready;
		};
		assert.equal(await ready(), true);
		const helper = join(copy, 'src/shared/pure-session-helper.ts'); await writeFile(helper, '// source generation two'); sourceFiles['shared/pure-session-helper.ts'] = digest(await readFile(helper));
		assert.equal(await ready(), false, 'current individual hashes cannot turn an old compiled build into current source evidence');
		const compiledHelper = join(copy, 'out/shared/pure-session-helper.js'); await writeFile(compiledHelper, '// compiled generation two'); compiledFiles['shared/pure-session-helper.js'] = digest(await readFile(compiledHelper));
		await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceFiles, compiledFiles })); assert.equal(await ready(), true);
		delete sourceFiles['shared/pure-session-helper.ts']; delete compiledFiles['shared/pure-session-helper.js']; await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceFiles, compiledFiles }));
		assert.equal(await ready(), false, 'a present helper omitted from both evidence and manifest must still refuse');
		sourceFiles['shared/pure-session-helper.ts'] = digest(await readFile(helper)); compiledFiles['shared/pure-session-helper.js'] = digest(await readFile(compiledHelper)); await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceFiles, compiledFiles }));
		await rename(manifestPath, manifestPath + '.absent'); assert.equal(await ready(), false); await rename(manifestPath + '.absent', manifestPath);
  for(const name of CONNECTION_REMOVAL_GATE_FILES){
   const src=name+'.ts',js=name+'.js',srcPath=join(copy,'src',src),jsPath=join(copy,'out',js),sourceBytes=await readFile(srcPath),compiledBytes=await readFile(jsPath);
   delete sourceFiles[src];delete compiledFiles[js];await rm(srcPath);await rm(jsPath);
   await writeFile(manifestPath,JSON.stringify({...manifest,sourceFiles,compiledFiles}));
   assert.equal(await ready(),false,'even a self-consistent deployment cannot omit required sc6 helper '+name);
   await writeFile(srcPath,sourceBytes);await writeFile(jsPath,compiledBytes);sourceFiles[src]=digest(sourceBytes);compiledFiles[js]=digest(compiledBytes);
   await writeFile(manifestPath,JSON.stringify({...manifest,sourceFiles,compiledFiles}));assert.equal(await ready(),true);
  }
		await writeFile(manifestPath, JSON.stringify({ ...manifest, producerDigest: '0'.repeat(64), sourceFiles, compiledFiles })); assert.equal(await ready(), false);

		// The actual build producer cannot refresh evidence over missing/stale compiler input maps.
		const mini = join(directory, 'producer'); await mkdir(join(mini, 'src'), { recursive: true }); await mkdir(join(mini, 'out'));
		await writeFile(join(mini, 'copy-assets.mjs'), producer); await writeFile(join(mini, 'src/main.ts'), '// source generation two'); await writeFile(join(mini, 'out/main.js'), '// compiled generation one');
		const runProducer = () => execFileSync(process.execPath, [join(mini, 'copy-assets.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
		assert.throws(runProducer);
		await writeFile(join(mini, 'out/main.js.map'), JSON.stringify({ sourcesContent: ['// source generation one'] })); assert.throws(runProducer);
		await writeFile(join(mini, 'out/main.js'), '// compiled generation two'); await writeFile(join(mini, 'out/main.js.map'), JSON.stringify({ sourcesContent: ['// source generation two'] })); runProducer();
		const generated = JSON.parse(await readFile(join(mini, 'out/assets/connection-management-build.json'), 'utf8')) as Build;
		assert.equal(generated.sourceFiles['main.ts'], digest('// source generation two')); assert.equal(generated.compiledFiles['main.js'], digest('// compiled generation two'));
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test('CM-S5-LIFETIME-COPY: external S005 both-client pre-add copy evidence recorded pending only; this task does not implement or claim client acceptance', async () => {
	const reportUrl = new URL('docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/task34-release-evidence.json', root);
	const bytes = await readFile(reportUrl), report = JSON.parse(bytes.toString());
	assert.equal(report.releaseReady, false);
	for (const prerequisite of ['S001', 'S002SqlServer', 'S002Sweep', 'providerService', 'S004', 'S005']) assert.equal(report.externalPrerequisites[prerequisite].status, 'pending', prerequisite);
	for (const client of ['vscode', 'jetbrains']) { assert.equal(report.externalPrerequisites.S005.clients[client].status, 'pending'); assert.deepEqual(report.externalPrerequisites.S005.clients[client].evidence, []); }
	assert.deepEqual(report.externalPrerequisites.S005.requiredPreAddCopy, { retain: ['panel-close', 'root-switch'], expire: ['workbench-end', 'lease-loss', 'daemon-restart'] });
	for (const label of ['INVENTORY', 'AUTH', 'RECONNECT', 'STREAM', 'MEMORY', 'REPLAY', 'COLLISION', 'NAMESPACE', 'LEASE', 'ISOLATION', 'DRIVER-LOGS', 'FILES', 'COMPAT', 'MCP', 'CLIENT-EGRESS', 'CONTEXT', 'SCOPE', 'FREEFORM', 'CACHE', 'RECURSION', 'PROVIDER', 'CONSUMER-LOGS', 'EMBED-DENY', 'ADHERENCE-CACHE', 'EXPIRY', 'GATE']) assert.ok(report.proofs['CM-S3-' + label].records.length > 0, label);
	assert.equal(report.proofs['CM-S3-SWEEP'].status, 'full-sweep-recorded');
	const historical = JSON.parse(await readFile(new URL('docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/task33-release-evidence.json', root), 'utf8'));
	assert.equal(historical.proofs['CM-S3-SWEEP'].status, 'pending-t34');
	for (const tree of ['src', 'out']) {
		const gate = JSON.parse(await readFile(new URL(tree + '/assets/connection-management-gates.json', root), 'utf8'));
		assert.equal(gate.ready, false); assert.deepEqual(gate.scopes, []); assert.equal(gate.testReportDigest, digest(bytes)); assert.equal(gate.inventoryDigest, report.inventory.deployedSha256, 'disabled gate retains the historical deployment identity; current source audits are separate');
		assert.equal((await verifyConnectionManagementRelease(new URL(tree + '/assets/connection-management-gates.json', root), ['sc5'])).ready, false, 'current audit changes never enable the historical pending gate');
	}
});

test('CM-S4-GATE: required removal helpers and sc6 session prerequisites remain unadvertised in shipped bundles',async()=>{
 assert.deepEqual([...CONNECTION_REMOVAL_GATE_FILES],['shared/connection-removal','daemon/db/removal-retirement']);
 const build=JSON.parse(await readFile(new URL('out/assets/connection-management-build.json',root),'utf8')) as Build;
 for(const name of CONNECTION_REMOVAL_GATE_FILES){assert.ok(build.sourceFiles[name+'.ts']);assert.ok(build.compiledFiles[name+'.js']);}
 for(const tree of ['src','out']){
  const gate=JSON.parse(await readFile(new URL(tree+'/assets/connection-management-gates.json',root),'utf8'));
  assert.equal(gate.ready,false);assert.deepEqual(gate.scopes,[]);
 }
 assert.equal((await verifyConnectionManagementRelease(undefined,['sc6'])).ready,false);
 assert.equal((await verifyConnectionManagementRelease(undefined,['sc5','sc6'])).ready,false);
});
