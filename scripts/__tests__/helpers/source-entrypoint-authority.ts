/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import policy from '../../../src/assets/node-runtime-policy.json' with { type: 'json' };
const project = resolve('.');
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Entrypoint test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible', formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
export async function sourceEntrypointAuthority(root: string, target: 'linux-arm64' | 'linux-x64', appSource?: string) {
 const origin = join(root, 'origin'); mkdirSync(origin);
 const key = join(root, 'key'), installer = join(root, 'installer.sh');
 execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
 const { buildSync } = await import('esbuild');
 const bundle = (entry: string) => buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' }).outputFiles[0]!.text;
 const app = join(root, 'app.mjs');
 writeFileSync(app, appSource ?? `import fs from'node:fs';import net from'node:net';import{spawn,execFileSync}from'node:child_process';
import{daemonRunFiles as f}from${JSON.stringify(join(project, 'src/daemon/run-file-ownership.ts'))};
import{PATHS}from${JSON.stringify(join(project, 'src/shared/paths.ts'))};
const startup=f.lease();if(f.isAlreadyRunning()){startup.release();process.exit(1);}const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
const commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=net.createServer(s=>s.once('data',b=>{const r=JSON.parse(b);if(r.method==='daemon.status')s.end(JSON.stringify({id:r.id,result:{installedCommit:commit}})+'\\n');if(r.method==='daemon.shutdown'){s.end(JSON.stringify({id:r.id,result:{ok:true}})+'\\n');child.once('close',()=>{const g=f.lease();f.assertSocketOwned();server.close(()=>{f.markListenerClosed();f.clearRunFiles();g.release();process.exit(0);});});child.kill('SIGTERM');}}));
server.listen(PATHS.sockFile,()=>{f.claimSocket();f.writePid();startup.release();});`);
 mkdirSync(join(origin, 'raw'), { recursive: true });
 writeFileSync(join(origin, 'raw/daemon.b64'), Buffer.from(bundle(app)).toString('base64'));
 writeFileSync(join(origin, '.gitignore'), '/out/\n/node_modules/\n/packages/\n');
 const manifest = { name: 'source-entrypoint-fixture', version: '1.0.0', type: 'module', scripts: { preinstall: 'node record.mjs preinstall', build: 'node build.mjs' } };
 writeFileSync(join(origin, 'package.json'), JSON.stringify(manifest));
 writeFileSync(join(origin, 'package-lock.json'), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: manifest.version } } }));
 writeFileSync(join(origin, '.npmrc'), 'offline=true\naudit=false\nfund=false\n');
 writeFileSync(join(origin, 'record.mjs'), `import fs from'node:fs';import{dirname,resolve}from'node:path';if(process.cwd()===process.env.INCUMBENT_ROOT){fs.writeFileSync(process.env.INCUMBENT_TRACE,'old npm');process.exit(91);}const npmVersion=JSON.parse(fs.readFileSync(resolve(dirname(process.env.npm_execpath),'../package.json'))).version;fs.appendFileSync(process.env.BUILD_TRACE,JSON.stringify({phase:process.argv[2],cwd:process.cwd(),exe:process.execPath,version:process.versions.node,npm:process.env.npm_execpath,npmVersion,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,python:process.env.PYTHONDONTWRITEBYTECODE,target:process.env.npm_config_target,nativeRuntime:process.env.npm_config_runtime,cxx:process.env.CXXFLAGS})+'\\n');`);
 writeFileSync(join(origin, 'build.mjs'), `import fs from'node:fs';import'./record.mjs';for(const d of['out/daemon','out/bin','node_modules','packages/project-memory'])fs.mkdirSync(d,{recursive:true});fs.writeFileSync('out/daemon/index.js',Buffer.from(fs.readFileSync('raw/daemon.b64','utf8'),'base64'));`);
 mkdirSync(join(origin, 'scripts'));
 const historicalCtl = execFileSync('/usr/bin/git', ['show', 'a30aa7f91a50409e129b0af25ff3d897be1b45b6:scripts/daemon-ctl.sh'], { cwd: project, encoding: 'utf8' });
 writeFileSync(join(origin, 'scripts/daemon-ctl.sh'), historicalCtl, { mode: 0o700 });
 assert.equal(readFileSync(join(origin, 'scripts/daemon-ctl.sh'), 'utf8'), historicalCtl);
 git(origin, 'init', '-qb', 'main'); git(origin, 'add', '.'); git(origin, 'commit', '-qm', 'historical fixture');
 const prior = git(origin, 'rev-parse', 'HEAD'), priorTree = git(origin, 'rev-parse', 'HEAD^{tree}');
 for (const path of ['scripts/provision-node-runtime.sh', 'scripts/node-runtime-archive.sh', 'scripts/node-runtime-env.sh', 'scripts/node-runtime-policy.sh', 'scripts/node-runtime-policy.mjs', 'scripts/node-runtime-store.mjs', 'scripts/daemon-ctl.sh', 'scripts/insrc', 'scripts/insrc-mcp', 'scripts/source-selection-env.sh', 'src/assets/node-runtime-policy.json']) {
  mkdirSync(dirname(join(origin, path)), { recursive: true }); cpSync(join(project, path), join(origin, path));
 }
 // The public installer still provisions the official archive. This routing fixture then
 // delegates repeated runtime-owner lookups to that fixed distribution; full repeated
 // archive/inventory coverage remains available with INSRC_ENTRYPOINT_FULL_RUNTIME=1.
 if (process.env['INSRC_ENTRYPOINT_FULL_RUNTIME'] !== '1') {
  const identity = `${policy.nodeVersion}:${target}:${policy.targets[target].sha256}`;
  const relative = `runtimes/node-v${policy.nodeVersion}-${target}/${policy.targets[target].sha256}/distribution`;
  writeFileSync(join(origin, 'scripts/node-runtime-env.sh'), `insrc_source_toolchain() {
 unset NODE_OPTIONS NODE_PATH
 local distribution="$2/${relative}"
 NODE_BIN="$distribution/bin/node"
 NPM_CLI="$distribution/lib/node_modules/npm/bin/npm-cli.js"
 [ -x "$NODE_BIN" ] && [ -f "$NPM_CLI" ] || return 2
 TOOLCHAIN_ID='${identity}'
 SOURCE_RUNTIME_BOUND=1
 export PYTHONDONTWRITEBYTECODE=1
 export ONNXRUNTIME_NODE_INSTALL_CUDA="\${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}"
 export npm_config_target='${policy.nodeVersion}' npm_config_runtime=node
 export PATH="$distribution/bin:\${PATH:-/usr/bin:/bin}"
}\n`);
 }
 writeFileSync(join(origin, 'raw/controller.b64'), Buffer.from(bundle(join(project, 'src/bin/insrc-source-control.ts'))).toString('base64'));
 for (const path of ['daemon/source-store-probe', 'shared/paths', 'shared/source-release-compatibility', 'shared/source-release-target', 'bin/insrc-source-startup-barrier']) {
  mkdirSync(dirname(join(origin, `raw/out/${path}.js`)), { recursive: true }); cpSync(join(project, `out/${path}.js`), join(origin, `raw/out/${path}.js`));
 }
 cpSync(join(project, 'src/native/source-actor'), join(origin, 'raw/native/source-actor'), { recursive: true });
 cpSync(join(project, 'src/native/process-broker'), join(origin, 'raw/native/process-broker'), { recursive: true });
 const baseBuild = readFileSync(join(origin, 'build.mjs'), 'utf8');
 writeFileSync(join(origin, 'build.mjs'), baseBuild + `
import{execFileSync}from'node:child_process';fs.cpSync('raw/out','out',{recursive:true});fs.writeFileSync('out/bin/insrc-source-control.js',Buffer.from(fs.readFileSync('raw/controller.b64','utf8'),'base64'));fs.writeFileSync('out/bin/insrc-runtime-smoke.js','process.exit(0);');fs.writeFileSync('out/bin/insrc-daemon-supervisor.js','process.exit(0);');for(const p of ['out/cli/index.js','out/bin/insrc-mcp.js']){fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(p,\"process.stdout.write(JSON.stringify({root:process.cwd(),exe:process.execPath,args:process.argv.slice(2),cwd:process.env.INSRC_CWD}));\");}
execFileSync('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','raw/native/source-actor/main.c','-o','out/bin/insrc-source-actor']);execFileSync('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','raw/native/process-broker/main.c','raw/native/process-broker/linux.c','-o','out/bin/insrc-process-broker']);`);
 // Exercise a real spontaneous daemon stop during npm, while update staging owns
 // mutation exclusion. The subsequent activation must recheck its signed profile.
 writeFileSync(join(origin, 'build.mjs'), readFileSync(join(origin, 'build.mjs'), 'utf8') + `
if(process.env.SOURCE_FIXTURE_STOP_DURING_BUILD==='1'){
 const net=await import('node:net'),pid=process.env.HOME+'/.insrc/daemon.pid';
 await new Promise((resolve,reject)=>{const s=net.connect(process.env.HOME+'/.insrc/daemon.sock');s.setTimeout(10000,()=>s.destroy(Error('fixture shutdown timed out')));s.on('connect',()=>s.write(JSON.stringify({id:1,method:'daemon.shutdown',params:{}})+'\\n'));s.on('data',()=>{});s.on('error',reject);s.on('end',resolve);});
 const deadline=Date.now()+10000;while(fs.existsSync(pid)){if(Date.now()>deadline)throw Error('fixture daemon did not exit');await new Promise(r=>setTimeout(r,25));}
}`);
 mkdirSync(join(origin, 'release')); let sequence = 0;
 const predecessors: Record<string, unknown> = { [prior]: { declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'], recovery: { tree: priorTree } } };
 const publish = () => {
  const previous = git(origin, 'rev-parse', 'HEAD');
  if (sequence) predecessors[previous] = { declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'] };
  writeFileSync(join(origin, `release/${target}-compatibility.json`), JSON.stringify({ version: 1, target, candidate: declaration, predecessors }));
  writeFileSync(join(origin, 'version.txt'), String(++sequence)); git(origin, 'add', '.'); git(origin, 'commit', '-qm', `candidate ${sequence}`);
  git(origin, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-fs', 'insrc-release/main', '-m', JSON.stringify({ version: 1, repoUrl: `/mnt/mac${origin}`, branch: 'main', sequence }));
 };
 publish(); execFileSync(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer, target]);
 return { origin, prior, installer, publish };
}
