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
    const values = { runtime_url: `https://nodejs.org/download/release/v${policy.nodeVersion}/${root}.${windows ? 'zip' : 'tar.gz'}`, runtime_sha: policy.archives[target], runtime_root: root, bootstrap_url: asset.bootstrap.url, bootstrap_sha: asset.bootstrap.sha256, native_url: asset.native.url, native_sha: asset.native.sha256 };
    const assignments = Object.entries(values).map(([name, value]) => `${windows ? '$' + name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) : name}=${quote(value)}`).join(windows ? '; ' : '\n');
    cases.push(windows ? `${quote(target)} { ${assignments} }` : `${target})\n${assignments}\n;;`);
  }
  const targets = windows ? `$runtimeUrl = $null\nswitch ($target) {\n${cases.join('\n')}\n}` : `case "$target" in\n${cases.join('\n')}\nesac`;
  const source = readFileSync(new URL(windows ? './install.ps1' : './install.sh', import.meta.url), 'utf8');
  const runtime = windows
    ? `& $node -e ${quote(publisher)} runtime $runtimeStage (Join-Path $HomeDirectory "runtimes/22.22.1/$target") $os $arch\n    if ($LASTEXITCODE -ne 0) { throw 'runtime-invalid' }`
    : `"$node" -e ${quote(publisher)} runtime "$stage/$runtime_root" "$home/runtimes/22.22.1/$target" "$os" "$arch" || fail 'runtime-invalid'`;
  const control = windows
    ? `& $node -e ${quote(publisher)} control $controlStage $control $os $arch\n    if ($LASTEXITCODE -ne 0) { throw 'control publication failed' }`
    : `"$node" -e ${quote(publisher)} control "$stage/control" "$control" "$os" "$arch" || fail 'control publication failed'`;
  return source.replace('# @@TARGETS@@', targets).replace('# @@PUBLISH_RUNTIME@@', runtime).replace('# @@PUBLISH_CONTROL@@', control);
}
