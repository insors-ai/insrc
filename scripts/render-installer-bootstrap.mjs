import { readFileSync } from 'node:fs';
import policy from '../src/installer/runtime-policy.json' with { type: 'json' };
const quoteSh = value => "'" + value.replaceAll("'", "'\\''") + "'";
const quotePs = value => "'" + value.replaceAll("'", "''") + "'";
const publisher = readFileSync(new URL('./bootstrap-publish.cjs', import.meta.url), 'utf8');
/** Pure publisher helper. runtime policy overrides are deliberately not accepted.
 * Test fixtures replace download tools/bytes, never product URL/hash overrides. */
export function renderInstallerBootstrap(platform, assets) {
  if (!['posix', 'powershell'].includes(platform)) throw new Error('unknown bootstrap platform');
  const windows = platform === 'powershell', quote = windows ? quotePs : quoteSh;
  const cases = [];
  for (const [target, asset] of Object.entries(assets)) {
    if (!(target in policy.archives) || windows !== target.startsWith('win32-')) throw new Error('wrong bootstrap target');
    for (const kind of ['bootstrap', 'native']) {
      if (!/^https:\/\//.test(asset[kind]?.url ?? '') || !/^[a-f0-9]{64}$/.test(asset[kind]?.sha256 ?? '') || /[\r\n\0]/.test(asset[kind].url)) throw new Error('invalid digest-bound control asset');
    }
    const root = `node-v${policy.nodeVersion}-${target.replace('win32-', 'win-')}`;
    const baseline = asset.target?.baseline;
    if (typeof baseline !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(baseline) || `${asset.target.os}-${asset.target.arch}` !== target) throw new Error('invalid bootstrap target identity');
    const profile = policy.profiles[target], headers = policy.supplemental.headers, library = policy.supplemental.libraries[target.endsWith('-arm64') ? 'arm64' : 'x64'];
    const values = { runtime_url: `https://nodejs.org/download/release/v${policy.nodeVersion}/${root}.${windows ? 'zip' : 'tar.gz'}`, runtime_sha: policy.archives[target], runtime_bytes: String(profile.archiveBytes), runtime_root: root, node_sha: profile.nodeSha256, baseline,
      headers_url: headers.url, headers_sha: headers.sha256, headers_bytes: String(headers.bytes), library_url: library.url, library_sha: library.sha256, library_bytes: String(library.bytes),
      bootstrap_url: asset.bootstrap.url, bootstrap_sha: asset.bootstrap.sha256, native_url: asset.native.url, native_sha: asset.native.sha256 };
    const assignments = Object.entries(values).map(([name, value]) => `${windows ? '$' + name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) : name}=${quote(value)}`).join(windows ? '; ' : '\n');
    cases.push(windows ? `${quote(target)} { ${assignments} }` : `${target})\n${assignments}\n;;`);
  }
  const targets = windows ? `$runtimeUrl = $null\nswitch ($target) {\n${cases.join('\n')}\n}` : `case "$target" in\n${cases.join('\n')}\nesac`;
  const source = readFileSync(new URL(windows ? './install.ps1' : './install.sh', import.meta.url), 'utf8');
  const publication = windows
    ? `& $node -e ${quote(publisher)} $HomeDirectory $InstallationId $stage $controlSource $bootstrapSha $nativeSha`
    : `"$node" -e ${quote(publisher)} "$home" "$identity" "$stage" "$control_source" "$bootstrap_sha" "$native_sha"`;
  return source.replace('# @@TARGETS@@', targets).replace('# @@PUBLISH_FOUNDATION@@', publication);
}
