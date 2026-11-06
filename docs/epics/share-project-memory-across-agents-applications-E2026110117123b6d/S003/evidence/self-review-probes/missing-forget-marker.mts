// Diagnostic reproduction only: emitted observations demonstrate the reviewed defect.
import {integrationFixture,finalCommand,forgetPlan,framePlan} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-integration.ts';
import {scope} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-rows.ts';
const f=await integrationFixture();
try {
 const a=await f.append(finalCommand('self-review-before-forget'));
 const b=await f.append(finalCommand('self-review-empty-forget',{scope:{projectId:scope.projectId},kind:'forget',input:{target:{kind:'project'}}}));
 const original=forgetPlan(b,'0',100,{kind:'project'});
 const receipt=await f.store.commit({...original,rows:[],disposition:{state:'committed',errorCode:null,rejectedByTombstoneIds:[]}});
 const markers=(await f.rows()).filter(r=>r.rowKind==='tombstone').length;
 const eligibility=await f.store.validateFrameEligibility(a);
 const capture=await f.store.commit(framePlan(a,'1',100));
 const snapshot=await f.store.snapshot(scope),current=await f.store.current(scope,snapshot);
 console.log('SELF_REVIEW_PROBE',JSON.stringify({forget:receipt.state,markers,oldFrameEligible:eligibility.eligible,capture:capture.state,currentCount:current.length}));
}finally{await f.close();}
