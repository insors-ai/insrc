import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApplicationInventory, digest } from '../release-descriptor.js';
import { runtimePolicy } from '../runtime-policy.js';
import { ollamaDistributionAsset, isDistributionArtifact } from '../distribution-artifacts.js';
import { ollamaPolicies } from '../ollama-catalog.js';

test('app-only inventory rejects ordinary and renamed pinned Node Ollama archives executables and build inputs', () => {
  const digests = [...Object.values(runtimePolicy.archives), ...Object.values(runtimePolicy.profiles).map(profile => profile.nodeSha256), runtimePolicy.supplemental.headers.sha256,
    ...Object.values(runtimePolicy.supplemental.libraries).map(asset => asset.sha256), ollamaDistributionAsset.sha256];
  for (const sha256 of digests) {
    assert.throws(() => parseApplicationInventory({ schemaVersion: 1, files: [{ path: 'out/assets/renamed-resource.dat', bytes: 42, sha256, mode: 0o644 }] }), /runtime distribution contribution/);
  }
  for (const path of ['tools/node/bin/node', 'tools/node/include/node/node.h', 'runtime/node.tar.gz', 'bin/ollama.exe']) {
    assert.throws(() => parseApplicationInventory({ schemaVersion: 1, files: [{ path, bytes: 1, sha256: digest('fixture'), mode: 0o644 }] }), /runtime distribution contribution/);
  }
});
test('app-only inventory permits native application dependencies and runtime policy metadata', () => {
  const files = ['node_modules/native/addon.node', 'out/installer/native/control.node', 'node_modules/ollama/dist/index.js', 'out/installer/runtime-policy.json'].map(path => ({ path, bytes: 7, sha256: digest('fixture'), mode: 0o644 }));
  assert.equal(parseApplicationInventory({ schemaVersion: 1, files }).files.length, files.length);
});
test('enabled Ollama policy assets share the application exclusion metadata without changing qualification', () => {
  for (const policy of ollamaPolicies) assert.equal(isDistributionArtifact(policy.asset.sha256), true);
  assert.deepEqual(ollamaPolicies[0]?.asset, ollamaDistributionAsset);
});
