import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseTapRun,resultOfTitle} from '../../../src/daemon/steps/build-step/tap-results.ts';
const base='docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/posix-20261128';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const plan=read('.insrc/artifacts/PLAN-446ae69566d352dd-s1.json');
const tests=read('.insrc/artifacts/TESTS-446ae69566d352dd-s1.json');
const results=read('docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-results.json');
const files=new Map(results.results.map(r=>[r.file,r]));const cache=new Map();
function proof(file,title){
 const r=files.get(file);assert.ok(r,`Not in retained canonical selection: ${file}`);assert.equal(r.code,0);assert.equal(r.timedOut,false);assert.equal(r.coverage.status,'reported');
 if(!cache.has(file)){const raw=fs.readFileSync(r.log,'utf8');cache.set(file,{tap:parseTapRun(raw),sha256:createHash('sha256').update(raw).digest('hex'),path:r.log,raw});}
 const p=cache.get(file);assert.equal(resultOfTitle(p.tap,title),'pass',`${file}: ${title}`);return {file,title,result:'pass',retainedLog:r.log,logSha256:p.sha256};
}
const subjects=[];
for(const item of plan.body.testStrategyCoverage){
 if(item.coveredByTaskIds.includes('t10'))continue;
 const records=tests.body.tasks.filter(t=>item.coveredByTaskIds.includes(t.taskId));assert.ok(records.length);
 const exact=records.flatMap(t=>t.tests.map(test=>({taskId:t.taskId,test}))).filter(x=>x.test.name===item.lldStrategyItem);
 const selected=exact.length?exact:records.flatMap(t=>t.tests.map(test=>({taskId:t.taskId,test})));
 const mappings=selected.map(({taskId,test})=>{
  if(test.reported){assert.equal(test.reported.result,'pass');return {taskId,name:test.name,reported:test.reported,caseProof:[],scope:'Previously registered builder-reported aggregate; current full canonical proof is independently retained by the completed budget Story.'};}
  assert.ok(test.cases.length,`Missing named cases: ${test.name}`);
  return {taskId,name:test.name,caseProof:test.cases.map(c=>proof(c.file,c.title))};
 });
 subjects.push({subject:item.lldStrategyItem,coveredByTaskIds:item.coveredByTaskIds,evidenceBasis:exact.length?'exact accepted named test plus current retained TAP':'accepted owner-task mapping plus current retained TAP/reported aggregate',mappings});
}
assert.equal(subjects.length,21);
fs.mkdirSync(base+'/regression-logs',{recursive:true});for(const[file,p]of cache){fs.writeFileSync(base+'/regression-logs/'+file.replaceAll('/','_')+'.tap',p.raw);}
const report={status:'pass',checkedAt:new Date().toISOString(),canonicalSource:'b06fb951d955e707408c246011a4c61aa1bd6ee0',canonicalTests:284,canonicalFiles:62,historicalControllerTests:22,followUpControllerTests:6,sourcePinsRetained:true,testsRerun:false,rawLogFilesCopied:cache.size,subjects,limit:'Earlier306-case regression is baseline evidence; the only later maintained-code delta is the separately validated controller test maintenance. Native macOS and Linux proof retain their own exact source revisions. Windows remains deferred, not credited.'};
fs.writeFileSync(base+'/foundation-regression-reconciliation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,nonLiveSubjects:subjects.length,currentRetainedTapFiles:cache.size,testsRerun:false}));
