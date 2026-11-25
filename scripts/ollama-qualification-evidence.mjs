/** Publisher/test evidence only. No consumer install authority and no target fallback. */
import assert from 'node:assert/strict';
import { closeSync, openSync, readSync, readFileSync } from 'node:fs';
import { machine, release } from 'node:os';

export function observeLinuxMachine() {
  assert.equal(process.platform, 'linux', 'this collector qualifies Linux only');
  const fd = openSync('/proc/self/exe', 'r'), elf = Buffer.alloc(64);
  try { assert.equal(readSync(fd, elf, 0, elf.length, 0), elf.length); } finally { closeSync(fd); }
  assert.equal(elf.subarray(0, 4).toString('hex'), '7f454c46');
  const header = process.report.getReport().header;
  return { platform: process.platform, arch: process.arch, machine: machine(), kernelRelease: release(), uid: process.getuid(),
    node: { executable: process.execPath, version: process.version, elfMachine: elf.readUInt16LE(18) },
    report: { arch: header.arch, osMachine: header.osMachine, osName: header.osName, glibcVersionRuntime: header.glibcVersionRuntime },
    osRelease: readFileSync('/etc/os-release', 'utf8'), cpuInfo: readFileSync('/proc/cpuinfo', 'utf8'),
    maps: readFileSync('/proc/self/maps', 'utf8') };
}

export function validateNativeProvenance(policy, observed, upstream) {
  // Exact currently supported qualification route; no guessed equivalence or
  // accepting a caller-authored native/translated flag in place of observations.
  assert.equal(policy.target.os, 'linux'); assert.equal(observed.platform, policy.target.os);
  assert.ok(Number.isSafeInteger(observed.uid) && observed.uid > 0);
  assert.equal(observed.arch, policy.target.arch); assert.equal(observed.report.arch, observed.arch);
  assert.equal(observed.node.version, 'v22.22.1'); assert.ok(observed.node.executable.startsWith('/'));
  const expectedMachine = { arm64: 'aarch64', x64: 'x86_64' }[observed.arch];
  assert.ok(expectedMachine); assert.equal(observed.machine, expectedMachine); assert.equal(observed.report.osMachine, expectedMachine);
  assert.equal(observed.node.elfMachine, observed.arch === 'arm64' ? 183 : 62);
  const cpuNative = observed.arch === 'arm64' ? /^CPU architecture\s*:\s*8\s*$/m.test(observed.cpuInfo)
    : /^flags\s*:.*\blm\b/m.test(observed.cpuInfo);
  assert.ok(cpuNative, 'kernel CPU information must match executable architecture');
  assert.equal(/qemu|rosetta|FEXCore|box64/i.test(observed.maps), false, 'mapped translator prevents native qualification');
  assert.ok(observed.osRelease.includes('ID=') && observed.osRelease.includes('VERSION_ID='));
  assert.equal(observed.report.osName, 'Linux');
  assert.equal(`glibc-${observed.report.glibcVersionRuntime}`, policy.target.baseline);
  assert.equal(upstream.source, `https://api.github.com/repos/ollama/ollama/releases/tags/v${policy.version}`);
  assert.deepEqual(upstream.release, JSON.parse(upstream.raw), 'parsed upstream data must match retained raw response');
  assert.equal(upstream.status, 200); assert.equal(upstream.release.tag_name, `v${policy.version}`);
  assert.equal(upstream.release.html_url, `https://github.com/ollama/ollama/releases/tag/v${policy.version}`);
  assert.equal(upstream.release.draft, false); assert.equal(upstream.release.prerelease, false);
  const assets = upstream.release.assets.filter(asset => asset.browser_download_url === policy.asset.url);
  assert.equal(assets.length, 1); const asset = assets[0];
  assert.equal(asset.name, new URL(policy.asset.url).pathname.split('/').at(-1));
  assert.equal(asset.state, 'uploaded'); assert.equal(asset.size, policy.asset.bytes);
  assert.equal(asset.digest, `sha256:${policy.asset.sha256}`);
  return { native: true, translated: false, glibc: observed.report.glibcVersionRuntime,
    translationChecks: ['kernel machine', 'Node process/report architecture', 'Node ELF machine', 'kernel CPU architecture', 'no mapped known translator'],
    limits: 'Observed Linux process/kernel/ELF/CPU/map agreement in the named native OrbStack VM; not an adversarial hypervisor or exhaustive translator-detection proof.',
    upstream: { source: upstream.source, fetchedAt: upstream.fetchedAt, url: asset.browser_download_url, bytes: asset.size, sha256: asset.digest.slice(7), assetId: asset.id } };
}

export async function fetchOfficialProvenance(policy) {
  const source = `https://api.github.com/repos/ollama/ollama/releases/tags/v${policy.version}`;
  const response = await fetch(source, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'insrc-native-qualification' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  assert.equal(response.status, 200); const parts = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; assert.ok(bytes <= 4 * 1024 * 1024); parts.push(chunk); }
  const raw = Buffer.concat(parts).toString('utf8');
  return { source, status: response.status, fetchedAt: new Date().toISOString(),
    headers: Object.fromEntries(['etag', 'last-modified', 'content-type', 'x-github-request-id'].map(key => [key, response.headers.get(key)])),
    raw, release: JSON.parse(raw) };
}
