// Diagnostic reproduction only: emitted observations demonstrate the reviewed defect.
import {integrationFixture,finalCommand,framePlan} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-integration.ts';
import {scope,profile,epoch} from '../../../../../../packages/project-memory/src/__tests__/fixtures/store-rows.ts';
import {makeRow} from '../../../../../../packages/project-memory/src/store/codec.ts';
let armed=false;let f;
f=await integrationFixture({point(p){if(armed&&p==='read-before-final') f.clock(99);}});
try {
 const a=await f.append(finalCommand('self-review-backward-clock'));
 const plan=framePlan(a,'0',100);
 const current=plan.rows.find(r=>r.rowKind==='current');
 const payload={...current.payload,validFrom:100};
 const rows=plan.rows.map(row=>row.rowKind==='current'?makeRow('current',scope,epoch,payload,profile,[1,0],'1'):row.rowKind==='revision'?makeRow('revision',scope,epoch,{...row.payload,snapshot:payload},profile):row);
 await f.store.commit({...plan,rows});
 const snapshot=await f.store.snapshot(scope);armed=true;
 const result=await f.store.currentProjection(scope,snapshot);
 console.log('CLOCK_REVIEW_PROBE',JSON.stringify({finalNow:f.now,validFrom:100,evaluatedAt:result.evaluatedAt,items:result.items.length,nextBoundary:result.nextValidityBoundary}));
}finally{await f.close();}
