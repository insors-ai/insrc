/** Derive publisher summary from raw successful qualification outputs. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateNativeProvenance } from './ollama-qualification-evidence.mjs';
const directory = resolve(process.argv[2]), prior = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'));
const spec = read('candidate-spec.json'), native = read('native-install.json'), machine = read('install-machine.json'), provenance = validateNativeProvenance(spec.policy, machine, read('install-upstream.json'));
const warm = read('fresh-inspection-warm.json'), advised = read('fresh-inspection-after-cache-advice.json'), decline = read('decline.json'), cache = read('cache-advice.json');
for (const result of [native, warm, advised, decline, cache]) assert.equal(result.status, 'pass');
assert.equal(native.uid, machine.uid); assert.equal(native.node.version, machine.node.version);
assert.equal(native.files, prior.archive.materializedFiles); assert.equal(native.materializedBytes, prior.archive.materializedBytes);
assert.deepEqual(native.asset, spec.policy.asset); assert.deepEqual(native.target, spec.policy.target);
assert.equal(native.modelFiles, 0); assert.equal(native.reusedWithoutMutation, true); assert.equal(native.applicationDataUnchanged, true);
assert.equal(decline.dependencyFilesUnchanged, true); assert.equal(warm.attemptsUnchanged, true); assert.equal(advised.attemptsUnchanged, true);
for (const result of [warm, advised]) { assert.ok(result.elapsedMs < 3000); assert.ok(result.readCharacters < 16 * 1024 * 1024); }
const closure = native.finiteEvidence.filter(file => /\.closed\.json$/.test(file.path));
assert.equal(closure.length, 2); for (const file of closure) assert.equal(file.content.closed, true);
const disposal = native.finiteEvidence.find(file => /\.disposed\.json$/.test(file.path)); assert.equal(disposal.content.stageRemoved, true);
assert.ok(cache.uid > 0 && cache.results.length >= native.files); for (const result of cache.results) assert.equal(result.result, 0);
for (const phase of ['decline', 'install', 'inspect']) {
  const observed = read(`${phase}-write-observations.json`); assert.equal(observed.status, 'observed');
  assert.equal(observed.before.length, 3); assert.equal(observed.after.length, 3); assert.ok(observed.limits.includes('not detect transient'));
  assert.equal(observed.before.some(scope => scope.truncated), false); assert.equal(observed.after.some(scope => scope.truncated), false);
}
const vm = read('orbstack-machine.json').record; assert.equal(vm.image.arch, machine.arch); assert.equal(vm.config.isolated, true);
const result = { schemaVersion: 1, status: 'pass', date: read('install-upstream.json').fetchedAt.slice(0,10), task: 'c3d71313f34bce71/s3/t17', catalogEnabled: true,
  machine: { name: vm.name, id: vm.id, os: /^PRETTY_NAME="([^"]+)"$/m.exec(machine.osRelease)?.[1], platform: machine.platform, arch: machine.arch,
    glibc: provenance.glibc, native: provenance.native, translated: provenance.translated, isolated: vm.config.isolated,
    memoryLimitBytes: vm.config.memory_limit_mib * 1024 * 1024, cpuQuota: vm.config.cpu_limit, uid: machine.uid },
  provenance, policySha256: native.policySha256, asset: native.asset, archive: prior.archive,
  observed: { nativeInstallSeconds: native.elapsedMs / 1000, executableVersion: native.availability.version, apiVersion: native.availability.version,
    privateNode: machine.node.version.slice(1), modelFiles: native.modelFiles, declinePreservedDependencyFiles: decline.dependencyFilesUnchanged,
    reusePreservedAttemptRecords: advised.attemptsUnchanged, finitePreparationAndHandoffClosed: closure.every(file=>file.content.closed), stageDisposed: disposal.content.stageRemoved,
    retainedService: native.retainedService, endpointOwnership: native.endpointOwnership, fullDaemonInstallation: native.fullDaemonInstallation,
    warmFreshInspectionMs: warm.elapsedMs, coldFreshInspectionMs: advised.elapsedMs, inspectionReadCharacters: advised.readCharacters,
    cacheAdvice: cache.action, cacheAdviceLimits: cache.limits, filesystemObservationLimits: read('install-write-observations.json').limits },
  targets: prior.targets.map(target=>target.status==='qualified'?{...target,reason:`Observed native ${machine.platform}/${machine.arch}/${provenance.glibc} provenance and exact official live acquisition/readiness/reuse/decline/inspection passed on ${vm.name}.`}:target),
  history: 'Previous successful and failed pre-review results remain unchanged in ../s3-ollama-native-qualification-2026-11-25/.',
  cleanup: 'The named disposable VM is stopped after collection; retained service termination is accounted at that VM boundary, not through PID ownership or daemon shutdown.' };
writeFileSync(join(directory, 'qualification.json'), JSON.stringify(result,null,2)+'\n');
