import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ollamaPolicies } from '../ollama-catalog.js';
import { validateNativeProvenance } from '../../../scripts/ollama-qualification-evidence.mjs';

function fixture() {
  const policy = ollamaPolicies[0]!;
  const observed = { platform: 'linux', arch: 'arm64', machine: 'aarch64', uid: 1000,
    node: { executable: '/private/node/bin/node', version: 'v22.22.1', elfMachine: 183 },
    report: { arch: 'arm64', osMachine: 'aarch64', osName: 'Linux', glibcVersionRuntime: '2.35' },
    osRelease: 'ID=ubuntu\nVERSION_ID="22.04"\n', cpuInfo: 'CPU architecture: 8\n', maps: '/private/node/bin/node\n' };
  const upstream = { source: `https://api.github.com/repos/ollama/ollama/releases/tags/v${policy.version}`, status: 200, fetchedAt: 'fixture',
    release: { tag_name: `v${policy.version}`, html_url: `https://github.com/ollama/ollama/releases/tag/v${policy.version}`, draft: false, prerelease: false,
      assets: [{ name: 'ollama-linux-arm64.tar.zst', state: 'uploaded', browser_download_url: policy.asset.url, size: policy.asset.bytes, digest: `sha256:${policy.asset.sha256}` }] } };
  Object.assign(upstream, { raw: JSON.stringify(upstream.release) });
  return { policy, observed, upstream };
}

test('native-evidence-validator-rejects-wrong-platform-glibc-digest-and-translated-observations', () => {
  const valid = fixture(); assert.equal(validateNativeProvenance(valid.policy, valid.observed, valid.upstream).native, true);
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.observed.platform = 'darwin'; },
    f => { f.observed.arch = 'x64'; }, f => { f.observed.machine = 'x86_64'; },
    f => { f.observed.report.osMachine = 'x86_64'; }, f => { f.observed.report.glibcVersionRuntime = '2.36'; },
    f => { f.observed.node.elfMachine = 62; }, f => { f.observed.cpuInfo = 'CPU architecture: 7\n'; },
    f => { f.observed.maps += '/usr/libexec/rosetta/runtime\n'; }, f => { f.observed.maps += '/usr/bin/qemu-aarch64\n'; },
    f => { f.observed.uid = 0; }, f => { f.observed.node.version = 'v26.5.1'; },
    f => { f.upstream.source = 'https://mirror.invalid/release'; }, f => { f.upstream.status = 404; },
    f => { f.upstream.release.tag_name = 'v0.0.0'; }, f => { f.upstream.release.assets[0]!.digest = 'sha256:' + '0'.repeat(64); },
    f => { f.upstream.release.assets[0]!.size--; }, f => { f.upstream.release.assets[0]!.browser_download_url += '?other'; },
    f => { f.upstream.release.assets.push(f.upstream.release.assets[0]!); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const f = fixture(); Object.assign(f.observed, { native: true, translated: false }); mutate(f);
    // Keep the response internally consistent so each mutation reaches its
    // intended platform/release/asset check rather than the raw-body check.
    Object.assign(f.upstream, { raw: JSON.stringify(f.upstream.release) });
    assert.throws(() => validateNativeProvenance(f.policy, f.observed, f.upstream), `mutation ${index} cannot qualify by claiming native=true`);
  }
});

test('native-evidence-validator-rejects-raw-response-inconsistency', () => {
  const f = fixture(); f.upstream.release.assets[0]!.digest = 'sha256:' + '0'.repeat(64);
  assert.throws(() => validateNativeProvenance(f.policy, f.observed, f.upstream), /parsed upstream data must match retained raw response/);
});
