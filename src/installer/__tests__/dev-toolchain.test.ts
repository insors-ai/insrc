import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { archiveFixture } from './_runtime-fixture.js';
import { runtimeArchive } from '../runtime-policy.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

async function fixture(scenarios: string[], corrupt?: 'headers' | 'npm' | 'missing'): Promise<void> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-dev-toolchain-')), children: ChildProcess[] = [];
  try {
    const archive = await archiveFixture(), target = { os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64' };
    const identity = runtimeArchive(target), quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const unpack = target.os === 'win32'
      ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(root)}`], { stdio: 'ignore' })
      : spawnFixture('tar', ['-xzf', archive, '-C', root, `${identity.root}/bin/node`, `${identity.root}/lib/node_modules/npm`, `${identity.root}/include/node`, `${identity.root}/LICENSE`], { stdio: 'ignore' });
    children.push(unpack); assert.equal((await once(unpack, 'close'))[0], 0);
    const runtime = join(root, identity.root), node = join(runtime, target.os === 'win32' ? 'node.exe' : 'bin/node');
    if (target.os === 'win32') for (const name of ['npm', 'npm.cmd', 'npm.ps1', 'npx', 'npx.cmd', 'npx.ps1']) rmSync(join(runtime, name), { force: true });
    const npmRoot = join(runtime, target.os === 'win32' ? 'node_modules/npm' : 'lib/node_modules/npm');
    if (corrupt === 'headers') writeFileSync(join(runtime, 'include/node/node_version.h'), '#define NODE_MAJOR_VERSION 99\n#define NODE_MINOR_VERSION 0\n#define NODE_PATCH_VERSION 0\n');
    if (corrupt === 'npm') writeFileSync(join(npmRoot, 'package.json'), JSON.stringify({ version: '99.0.0' }));
    if (corrupt === 'missing') rmSync(join(runtime, 'include/node/node_version.h'));
    for (const scenario of scenarios) {
      const checkout = join(root, `checkout-${scenario}`); mkdirSync(checkout);
      writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: 'dev-toolchain-fixture', version: '1.0.0', scripts: { preinstall: 'node install-probe.cjs', probe: 'node probe.cjs' } }));
      writeFileSync(join(checkout, 'install-probe.cjs'), "const fs=require('node:fs');if(!fs.existsSync('.insrc/tmp/test-harness/active/writer'))throw Error('writer missing');fs.writeFileSync('install-owned','yes');");
      writeFileSync(join(checkout, 'package-lock.json'), JSON.stringify({ name: 'dev-toolchain-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'dev-toolchain-fixture', version: '1.0.0' } } }));
      writeFileSync(join(checkout, 'probe.cjs'), `const fs=require('node:fs'),cp=require('node:child_process');const npm=cp.execSync('npm --version',{encoding:'utf8'}).trim();fs.writeFileSync('observed.json',JSON.stringify({node:process.execPath,version:process.version,npm,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,nodeOptions:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null}));`);
      mkdirSync(join(checkout, 'scripts/test-harness'), { recursive: true });
      for (const name of ['build.mjs', 'context.mjs', 'process.mjs']) copyFileSync(`scripts/test-harness/${name}`, join(checkout, 'scripts/test-harness', name === 'build.mjs' ? 'owner.mjs' : name));
      copyFileSync('scripts/build-installer-control.mjs', join(checkout, 'scripts/build-installer-control.mjs'));
      mkdirSync(join(checkout, 'src/installer/native'), { recursive: true });
      copyFileSync('src/installer/native/control.c', join(checkout, 'src/installer/native/control.c'));
      writeFileSync(join(checkout, 'scripts/test-harness/build.mjs'), "export {withWriter,prepareBuild} from './owner.mjs'; export const buildStages=(run,{npmCli})=>[['accepted-checkout-helper',npmCli]];");
      const tsx = realpathSync('node_modules/tsx/dist/loader.mjs'), file = realpathSync('src/installer/__tests__/dev-toolchain-fixture.mjs');
      const child = spawnFixture(node, ['--import', tsx, file, checkout, runtime, scenario], { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
      let output = ''; child.stdout!.on('data', data => { output += String(data); }); child.stderr!.on('data', data => { output += String(data); });
      const code = (await once(child, 'close'))[0];
      if (corrupt) { assert.notEqual(code, 0, output); assert.match(output, /runtime-invalid|source-prerequisite-missing|Private npm version|native headers|Missing regular private toolchain/); }
      else assert.equal(code, 0, output);
      assert.equal(existsSync(join(checkout, '.insrc/tmp/test-harness/active')), false);
      if (corrupt) assert.equal(existsSync(join(checkout, 'node_modules')), false);
    }
  } finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
}
test('dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper', async () => { await fixture(['normal']); });
test('dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting', async () => { await fixture(['cuda-empty', 'cuda-custom']); });
test('missing-or-mismatched-private-toolchain-headers-and-prerequisites-refuse-without-elevation', async () => {
  await fixture(['prerequisite']);
  for (const corrupt of ['headers', 'npm', 'missing'] as const) await fixture(['bad'], corrupt);
});
