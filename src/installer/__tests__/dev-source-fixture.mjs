// Shared controlled accepted source for surrounding dev preparation tests.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
export async function createDevPayloadRepository(run, scope, repository, target, runtime) {
  const {ownedDevGit, resolveDevSource} = await import('../dev-git.ts');
  const file = (path, text) => { mkdirSync(dirname(path), {recursive:true}); writeFileSync(path,text); };
  const git = ownedDevGit(run, scope); mkdirSync(repository);
  await git(['init', '--quiet', '--initial-branch=installer'], repository);
  await git(['config', 'user.name', 'fixture'], repository); await git(['config', 'user.email', 'fixture@example.invalid'], repository);
  const pkg = { name: 'dev-payload-fixture', version: '1.0.0', type: 'module', workspaces: ['packages/fixture'], dependencies: { '@insrc/fixture': '*' },
    scripts: { preinstall: 'node scripts/npm-probe.cjs' }, insrcInstaller: { schemaVersion: 1, migrations: [{ id: 'verify', version: '1', module: 'out/hooks/verify.js' }] } };
  file(join(repository, 'package.json'), JSON.stringify(pkg));
  file(join(repository, 'packages/fixture/package.json'), JSON.stringify({ name: '@insrc/fixture', version: '1.0.0', type: 'module', files: ['dist'] }));
  file(join(repository, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: {
    '': { name: pkg.name, version: pkg.version, workspaces: pkg.workspaces, dependencies: pkg.dependencies, hasInstallScript: true },
    'node_modules/@insrc/fixture': { resolved: 'packages/fixture', link: true }, 'packages/fixture': { name: '@insrc/fixture', version: '1.0.0' } } }));
  file(join(repository, '.gitignore'), '.insrc/tmp/\nout/\nnode_modules/\npackages/fixture/dist/\n');
  file(join(repository, 'src/main.ts'), 'export const source = 1;\n');
  for (const name of ['context.mjs', 'process.mjs']) file(join(repository, 'scripts/test-harness', name), readFileSync(`scripts/test-harness/${name}`));
  for (const name of ['qualification-time-budgets.mjs', 'operation-time-budgets.mjs']) file(join(repository, 'src/installer', name), readFileSync(`src/installer/${name}`));
  file(join(repository, 'scripts/test-harness/owner.mjs'), readFileSync('scripts/test-harness/build.mjs'));
  file(join(repository, 'scripts/build-installer-control.mjs'), readFileSync('scripts/build-installer-control.mjs'));
  file(join(repository, 'src/installer/native/control.c'), readFileSync('src/installer/native/control.c'));
  file(join(repository, 'scripts/installer-payload.mjs'), readFileSync('scripts/installer-payload.mjs'));
  file(join(repository, 'scripts/test-harness/build.mjs'), `import {prepareBuild as canonical} from './owner.mjs';export {withWriter} from './owner.mjs';export const prepareBuild=(run,scope,options)=>canonical(run,scope,{...options,stages:[['scripts/build-fixture.mjs']],requiredArtifacts:['out/daemon/index.js','out/installer/native/control.node']});`);
  file(join(repository, 'scripts/npm-probe.cjs'), `const fs=require('node:fs');if(!fs.existsSync('.insrc/tmp/test-harness/active/writer'))throw Error('writer missing');fs.writeFileSync('.insrc/tmp/dev-preparation/profile-observation.json',JSON.stringify({profile:process.env.INSRC_QUALIFICATION_PROFILE,node:process.execPath,npm:process.env.npm_execpath,budgets:JSON.parse(fs.readFileSync('.insrc/tmp/test-harness/active/run.json','utf8')).budgets}));if(process.env.INSRC_DEV_PAYLOAD_CASE==='npm')process.exit(9);if(process.env.INSRC_DEV_PAYLOAD_CASE==='input-drift')fs.appendFileSync('src/main.ts','// altered');if(process.env.INSRC_DEV_PAYLOAD_CASE==='hold'){fs.writeFileSync('.insrc/tmp/dev-preparation/held-ready','yes');setInterval(()=>{},1000);}`);
  file(join(repository, 'scripts/build-fixture.mjs'), `import {mkdirSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';if(process.env.INSRC_DEV_PAYLOAD_CASE==='build')process.exit(10);for(const name of ['out/daemon/index.js','out/cli/index.js','out/installer/terminal-entry.js','out/installer/manager-entry.js','out/bin/insrc-mcp.js','out/installer/native/control.node','out/assets/runtime.json','out/hooks/verify.js','packages/fixture/dist/index.js']){if(process.env.INSRC_DEV_PAYLOAD_CASE==='missing'&&name==='out/bin/insrc-mcp.js')continue;mkdirSync(dirname(name),{recursive:true});writeFileSync(name,'controlled payload fixture');}`);
  file(join(repository, 'scripts/package-installer.mjs'), `
import {readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';import {dirname,join} from 'node:path';
import {collectTree,productionClosure} from './installer-payload.mjs';
export async function bundleControlEntrypoint(run,scope,entry,output){run.assertOwner();const result=await scope.start(run.runtime.executable,['-e',"require('node:fs').writeFileSync(process.argv[1],'controlled bundled control')",output],{env:run.environment()});if(result.code!==0)throw Error('fixture bundling');}
export {assertApplicationSources} from ${JSON.stringify(new URL('../../../scripts/package-installer.mjs', import.meta.url).href)};
import {privateRuntimePaths} from ${JSON.stringify(new URL('../runtime-policy.ts', import.meta.url).href)};
export function collectProductionPayload(root,options){const files=collectTree(root,join(root,'out'),'out');for(const [name,value] of productionClosure(root))files.set(name,value);files.set('package.json',{bytes:readFileSync(join(root,'package.json')),mode:0o644,source:join(root,'package.json')});if(process.env.INSRC_DEV_PAYLOAD_CASE==='runtime')files.set('tools/node/bin/node',{bytes:Buffer.from('forbidden runtime contribution'),mode:0o755,source:join(root,'out/daemon/index.js')});if(process.env.INSRC_DEV_PAYLOAD_CASE==='escape')files.set('../escaped',{bytes:Buffer.from('escape'),mode:0o644});if(process.env.INSRC_DEV_PAYLOAD_CASE==='collision')files.set('out/ASSETS/runtime.json',{bytes:Buffer.from('collision'),mode:0o644});return files;}
export async function probePayload(run,scope,directory,target,context){const runtime=await privateRuntimePaths(context.location,context.identity);const program="if(process.version!=='v22.22.1')process.exit(7);if(process.env.INSRC_DEV_PAYLOAD_CASE==='probe')process.exit(11);";const response=await scope.start(runtime.node,['-e',program],{cwd:directory,env:run.environment()});if(response.code!==0)throw Error('controlled native-probe failure');if(process.env.INSRC_DEV_PAYLOAD_CASE==='tamper')writeFileSync(join(directory,'out/assets/runtime.json'),'changed after inventory');if(process.env.INSRC_DEV_PAYLOAD_CASE==='linked'){rmSync(join(directory,'out/assets/runtime.json'));symlinkSync(join(directory,'out/daemon/index.js'),join(directory,'out/assets/runtime.json'));}}
`);
  await git(['add', '.'], repository); await git(['commit', '--quiet', '-m', 'controlled payload'], repository);
  const delivery = { mode: 'dev', repository, branch: 'installer' }, offer = await resolveDevSource(delivery, target, runtime);
  return {git, delivery, offer};
}
