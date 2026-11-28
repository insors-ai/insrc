import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRun} from '/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/scripts/test-harness/context.mjs';
import {withRun} from '/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/scripts/test-harness/process.mjs';
import {prepareBuild,inputFingerprint} from '/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/scripts/test-harness/build.mjs';
import {QUALIFICATION_TIME_BUDGETS as policy} from '/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/src/installer/qualification-time-budgets.mjs';
import {QUALIFICATION_CONTAINMENT as containing,qualificationAdmission} from '/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/scripts/qualification-containment.mjs';
const root='/home/insrctest/insrc-foundation-source-f86ece9c7/checkout',ops='/home/insrctest/insrc-foundation-posix-ops-20261128-r2';
const sdk='/home/insrctest/.insrc-s3/runtimes/node-v22.22.1-linux-arm64',npm=join(sdk,'lib/node_modules/npm/bin/npm-cli.js');
const sourceCommit='0938af2dcbc631960d64946fa3cd6a446b3aafef',startedAt=Date.now(),admit=qualificationAdmission(startedAt);
const record={status:'running',stage:'canonical-build',sourceCommit,root,ops,pid:process.pid,startedAt:new Date(startedAt).toISOString(),runtime:{executable:process.execPath,version:process.version,headers:process.env.INSRC_NODE_HEADERS},uid:process.getuid(),profile:policy.profile,timeBudgets:policy,containing,windows:'deferred-unqualified-not-enabled'};
const save=()=>writeFileSync(join(ops,'progress.json'),JSON.stringify(record,null,2)+'\n');
const ceiling=setTimeout(()=>{record.containingWorkCeilingExpiredAt=new Date().toISOString();save();process.emit('SIGTERM');},containing.jobMs-policy.manager.cleanupMs-policy.qualification.cleanupMs-containing.diagnosticsMs);
save();
try {
 assert.equal(policy.profile,'slow-vm');assert.equal(process.version,'v22.22.1');assert.equal(process.getuid(),501);
 record.dependencyReuse=JSON.parse(readFileSync(join(ops,'source-readiness.json'),'utf8'));
 const run=createRun(root,{mode:'build',budgets:{...policy.coordinator,runMs:policy.coordinator.buildMs}});
 record.buildRunId=run.runId;record.buildWorkspace=run.workspace;record.inputFingerprint=inputFingerprint(root);save();
 await withRun(run,async scope=>{
  const version=await scope.start(process.execPath,[npm,'--version']);assert.equal(version.code,0);assert.equal(readFileSync(version.log,'utf8').trim(),'10.9.4');
  const head=await scope.start('/home/insrctest/insrc-foundation-sdk-4ca3xorr/bin/git',['rev-parse','HEAD']);assert.equal(head.code,0);assert.equal(readFileSync(head.log,'utf8').trim(),sourceCommit);
  record.prepared=await prepareBuild(run,scope,{npmCli:npm});save();
 });
 const cleanup=JSON.parse(readFileSync(join(run.workspace,'cleanup.json'),'utf8'));
 assert.equal(cleanup.confirmedClosed,true);assert.equal(cleanup.closureMode,'owned-groups');assert.equal(cleanup.interrupted,false);assert.deepEqual(cleanup.evidenceErrors,[]);assert.deepEqual(cleanup.cancellationErrors,[]);assert.equal(existsSync(run.active),false);assert.deepEqual(readdirSync(join(run.workspace,'actors')),[]);record.buildCleanup=cleanup;
 const {qualifyRuntimeFoundation}=await import('/home/insrctest/insrc-foundation-source-f86ece9c7/checkout/scripts/qualify-runtime-foundation.mjs');
 record.nativeHeadroom=admit();record.stage='fresh-native-foundation';record.nativeStartedAt=new Date().toISOString();save();
 record.resultFile=await qualifyRuntimeFoundation({parent:'/home/insrctest',baseline:'ubuntu22.04-glibc2.35-orbstack-arm64'});
 const result=JSON.parse(readFileSync(record.resultFile,'utf8'));assert.equal(result.status,'pass');assert.equal(result.confirmedClosed,true);assert.equal(result.profile,'slow-vm');assert.equal(result.sourceCommit,sourceCommit);assert.deepEqual(result.timeBudgets,policy);assert.equal(result.releaseEnablement,false);record.status='pass';record.stage='complete';
} catch(error) {record.status='fail';record.error={message:error.message,code:error.code,stack:error.stack};process.exitCode=1;}
finally {clearTimeout(ceiling);record.finishedAt=new Date().toISOString();save();writeFileSync(join(ops,'complete.json'),JSON.stringify(record,null,2)+'\n');}
