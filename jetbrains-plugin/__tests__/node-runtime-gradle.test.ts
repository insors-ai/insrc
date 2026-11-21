import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { runFocusedJUnit } from '../test-bridge/run-focused-junit.js';
const localJdk='/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home';
const prefix='ai.insors.insrc.jetbrains.lifecycle.';
const reports=new Map<string,string>();
const classes=['NodeRuntimeResolverTest','PrivateNodeProvisionerTest','DaemonProvisionerTest','DaemonLifecycleCommandRunnerTest'];
before(()=>runFocusedJUnit(classes.map(c=>prefix+c),{...process.env,...(existsSync(localJdk)?{JAVA_HOME:localJdk}:{})},directory=>{for(const cls of classes)reports.set(cls,readFileSync(join(directory,`TEST-${prefix+cls}.xml`),'utf8'));}),{timeout:300000});
function passed(cls:string,name:string){
 const xml=reports.get(cls)!;
 const start=xml.indexOf(`<testcase name="${name}()"`);assert.ok(start>=0,`${name} did not run`);
 const next=xml.indexOf('<testcase',start+1);assert.doesNotMatch(xml.slice(start,next<0?undefined:next),/<failure|<error|<skipped/);
}
test('JetBrains never probes host Node and delegates verified provisioning including cache reuse and failures',()=>{
 passed('NodeRuntimeResolverTest','hostNodeNeverSelectedAndProbeNeverExecuted');passed('NodeRuntimeResolverTest','bootstrapFailureHasNoHostFallback');
 for(const name of ['delegatesEveryReuseToSharedBootstrapWithoutDownloadPolicy','checksumMissingAndExternalRuntimeFailuresNeverReturnPartialRuntime','windowsIsExplicitlyUnqualifiedWithoutAnyHostFallback'])passed('PrivateNodeProvisionerTest',name);
});
test('JetBrains script provisioner and managed command runner contracts remain passing',()=>{
 for(const cls of ['DaemonProvisionerTest','DaemonLifecycleCommandRunnerTest']){
  const xml=reports.get(cls)!;
  assert.match(xml,/<testcase/);assert.doesNotMatch(xml,/<failure|<error|<skipped/);
 }
});
