import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// An audit check of the captured Story evidence, not another performance run.
// Budget failure is an expected valid record; missing samples or a false
// complete/approved claim is not. The raw reports are retained alongside it.
test('scratch final qualification accounts for every task acceptance check and full-bound native sample', async () => {
  const report = JSON.parse(await readFile(new URL('../../../../docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/QUALIFICATION.json', import.meta.url), 'utf8'));
  assert.equal(report.story, '2846f076fd5f785f/s1');
  assert.deepEqual(report.tasks.map((t: any) => t.id).sort(), Array.from({length:21},(_,i)=>`t${i+1}`).sort());
  assert.ok(report.tasks.every((t: any) => typeof t.validated==='boolean' && typeof t.testEvidence==='string'));
  const crosswalk = JSON.parse(await readFile(new URL('../../../../docs/epics/linked-scratchpads-vs-code-E202611162846f076/S001/IDLE-VALIDATION-QUALIFICATION.json', import.meta.url), 'utf8'));
  assert.equal(crosswalk.tasks.length, 14);
  for(const task of crosswalk.tasks) {
    assert.equal(task.historicalRecordPreserved,true);assert.ok(task.historicalCommit);assert.ok(task.currentRequalificationCommit);
    for(const named of task.currentTests) {
      assert.ok(named.cases.length || named.currentLiveQualification.length);
      for(const c of named.cases){assert.equal(c.currentResult,'pass');assert.equal(c.gateRequalificationTask,'t21');assert.ok(c.title&&c.file&&c.currentRun&&c.gateRanAt);}
      if(named.currentLiveQualification){assert.equal(named.liveRequiredNoSkip,true);assert.deepEqual(named.currentLiveQualification.map((r:any)=>r.target).sort(),['current','floor']);}
    }
  }
  assert.deepEqual(Object.keys(report.acceptance).sort(), ['ac1','ac2','ac3','ac4']);
  for(const ac of Object.values(report.acceptance) as any[]){assert.ok(['blocked','verified'].includes(ac.status));assert.ok(ac.evidence.length);}
  assert.equal(report.performance.requiredNoteBytes,1048576);assert.equal(report.performance.requiredMessageBytes,2097152);
  assert.deepEqual(report.performance.targets,{medianRenderMs:150,p95AckMs:1000});
  const results=[];
  for(const [target,version] of [['floor','1.141.0'],['current','1.146.0']]) {
    const raw=report.performance.rawIdleQualification[target],summary=report.performance.idleCorrection[target];
    assert.equal(raw.hardware.vscode,version);assert.equal(raw.hardware.privateDisplay,true);assert.equal(raw.bytes,1048576);assert.equal(raw.noteBound,1048576);assert.equal(raw.messageBound,2097152);
    assert.equal(raw.samples.length,40);assert.ok(raw.samples.every((s:any)=>s.trusted&&Number.isFinite(s.renderMs)&&Number.isFinite(s.receiptMs)));
    assert.deepEqual(raw.samples.map((s:any)=>s.id),Array.from({length:40},(_,i)=>i+1));
    const ordinary=raw.samples.filter((s:any)=>s.group==='ordinary');assert.equal(ordinary.length,20);assert.ok(ordinary.every((s:any)=>Number.isFinite(s.ackMs)&&s.ackMs>=300));
    const renders=ordinary.map((s:any)=>s.renderMs).sort((a:number,b:number)=>a-b),acks=ordinary.map((s:any)=>s.ackMs).sort((a:number,b:number)=>a-b);
    assert.equal(raw.medianRenderMs,(renders[9]+renders[10])/2);assert.equal(raw.p95AckMs,acks[18]);assert.equal(summary.medianRenderMs,raw.medianRenderMs);assert.equal(summary.p95AckMs,raw.p95AckMs);
    assert.deepEqual(raw.groups.map((g:any)=>g.group),['sustained','burst','resumed','explicit-save']);
    for(const g of raw.groups){const rows=raw.samples.filter((s:any)=>s.group===g.group),last=rows.at(-1);assert.equal(g.latestSequence,last.id);assert.equal(g.latestAckMs,last.ackMs);assert.ok(Number.isFinite(last.ackMs));assert.deepEqual(g.superseded,rows.filter((s:any)=>s!==last&&s.ackMs===null).map((s:any)=>s.id));}
    assert.ok(raw.samples.findLast((s:any)=>s.group==='resumed').workerActiveAtInput>0);
    assert.ok(Number.isFinite(raw.groups.find((g:any)=>g.group==='explicit-save').actionAckMs));
    const meets=raw.medianRenderMs<=150&&raw.p95AckMs<=1000&&raw.groups.filter((g:any)=>g.group!=='explicit-save').every((g:any)=>g.latestAckMs<=1000);
    assert.equal(raw.budgetMet,meets);assert.equal(summary.passedBudget,meets);results.push(meets);
  }
  const performancePassed=results.every(Boolean);
  assert.equal(report.acceptance.ac1.status,performancePassed?'verified':'blocked');
  if(!performancePassed){assert.equal(report.tasks.find((t:any)=>t.id==='t15').validated,false);assert.equal(report.complete,false);assert.equal(report.workflow.buildApproved,false);assert.equal(report.workflow.finalBuildApprovalNotRequested,true);}
  assert.ok(report.packaging.currentRequalification.archive);assert.match(report.packaging.currentRequalification.sha256,/^[a-f0-9]{64}$/);assert.equal(report.packaging.currentRequalification.testResult,'pass');
  assert.equal(report.performance.measurements.full.passedBudget,false,'Retain the original failed pre-correction record');
});
