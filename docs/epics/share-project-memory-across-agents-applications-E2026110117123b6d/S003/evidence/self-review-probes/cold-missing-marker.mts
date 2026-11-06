// Diagnostic reproduction only: emitted observations demonstrate the reviewed defect.
import {integrationFixture,finalCommand,forgetPlan,framePlan} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-integration.ts';
import {scope} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-rows.ts';
import {openNative} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-native.ts';
const f=await integrationFixture();
try {
 const a=await f.append(finalCommand('self-review-cold-old'));
 const b=await f.append(finalCommand('self-review-cold-forget',{scope:{projectId:scope.projectId},kind:'forget',input:{target:{kind:'project'}}}));
 await f.store.commit(forgetPlan(b,'0',100,{kind:'project'}));
 const before=await f.store.validateFrameEligibility(a);
 await f.queue.close();await f.store.close();
 const db=await openNative(f.root);
 try{await db.table.delete("rowKind = 'tombstone'");}finally{db.close();}
 await f.reopen();
 const after=await f.store.validateFrameEligibility(a);
 const proof=await f.store.receiptVerifier().byOperation(b.operationId,b.command.scope);
 const captured=await f.store.commit(framePlan(a,'1',100));
 const current=await f.store.current(scope,await f.store.snapshot(scope));
 console.log('COLD_REVIEW_PROBE',JSON.stringify({beforeEligible:before.eligible,reopened:true,proofStatus:proof.status,afterEligible:after.eligible,capture:captured.state,currentCount:current.length}));
}finally{await f.close();}
