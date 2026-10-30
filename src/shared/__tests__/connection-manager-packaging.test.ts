import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-PACKAGING: fresh targeted Node22 typecheck/bundle/runtime and JDK21 compile/assemble smoke; no early full suite',{timeout:360000},()=>{
 if(Number(process.versions.node.split('.')[0])!==22){
  // The workflow daemon may itself use a newer Node. Run this native-runtime
  // smoke under the required ABI instead of changing or restarting the daemon.
  const candidates=[process.env['INSRC_NODE22'],'/opt/homebrew/opt/node@22/bin/node','/usr/local/opt/node@22/bin/node'].filter((value):value is string=>!!value);
  const node22=candidates.find(binary=>spawnSync(binary,['-p','process.versions.node.split(".")[0]'],{encoding:'utf8'}).stdout?.trim()==='22');
  assert.ok(node22,'Node22 is required; provide INSRC_NODE22 when it is not installed at a standard Homebrew path');
  const env={...process.env};delete env['NODE_TEST_CONTEXT'];delete env['NODE_CHANNEL_FD'];
  const result=spawnSync(node22,['--import','tsx','--test','--test-reporter=tap',fileURLToPath(import.meta.url)],{env,encoding:'utf8',timeout:330000,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/# pass 1\b/);return;
 }
 assert.equal(Number(process.versions.node.split('.')[0]),22,'Native modules require Node22 for this build');
 const env={...process.env,PATH:`${process.execPath.slice(0,process.execPath.lastIndexOf('/'))}:${process.env['PATH']??''}`};
 delete env['NODE_TEST_CONTEXT'];delete env['NODE_CHANNEL_FD'];
 const run=(command:string,args:string[],cwd=process.cwd())=>{
  const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  assert.equal(r.status,0,`${command} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);return r.stdout;
 };
 run(process.execPath,['node_modules/typescript/bin/tsc','--inlineSources']);
 run(process.execPath,['scripts/check-model-definitions.mjs']);
 run(process.execPath,['copy-assets.mjs']);
 run(process.execPath,['../node_modules/typescript/bin/tsc','--noEmit'],`${process.cwd()}/vscode-plugin`);
 run(process.execPath,['esbuild.mjs'],`${process.cwd()}/vscode-plugin`);
 const smoke=run(process.execPath,['--import','tsx','--test','--test-reporter=tap','vscode-plugin/src/__tests__/packaging.test.ts']);
 assert.match(smoke,/# pass 11\b/);assert.match(smoke,/# fail 0\b/);
 const javaHome=process.platform==='darwin'?run('/usr/libexec/java_home',['-v','21']).trim():process.env['JAVA_HOME'];
 if(javaHome)env['JAVA_HOME']=javaHome;
 run('./gradlew',['--offline','--no-daemon','--no-build-cache','-Pkotlin.compiler.execution.strategy=in-process','-Pkotlin.incremental=false','assemble','--console=plain'],`${process.cwd()}/jetbrains-plugin`);
 runConnectionJUnit('ai.insors.insrc.jetbrains.PluginDescriptorSmokeTest',2);
 assert.ok(existsSync('vscode-plugin/out/extension.js'));
});
