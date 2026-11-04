import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDesignUnit, reserveDesignUnit, selectedDesignChunks } from '../recovery-state.js';
import { designTechnicalFailure } from '../technical-failure.js';
import { impactFixture } from './impact-fixtures.js';

test('interleaved retained coverage schedules only the selected prefix and fresh final consistency',t=>{
 const f=impactFixture(t),a=f.current;a.plan=f.plan;a.impact=f.impact;
 assert.deepEqual(selectedDesignChunks(a).map(c=>c.id),['edit','final']);assert.equal(nextDesignUnit(a)!.chunk!.id,'edit');
 assert.throws(()=>reserveDesignUnit(a,f.plan.chunks[0]),{code:'invalid_checkpoint'});
 a.completedChunks.push(structuredClone(f.baseline.completedChunks[1]!));assert.equal(nextDesignUnit(a)!.chunk!.id,'final');
 a.completedChunks.push(structuredClone(f.baseline.completedChunks[2]!));assert.equal(nextDesignUnit(a),undefined);
 const bad=structuredClone(a);bad.completedChunks.reverse();assert.throws(()=>nextDesignUnit(bad),{code:'invalid_checkpoint'});
 const duplicate=structuredClone(a);duplicate.completedChunks.push(duplicate.completedChunks[0]!);assert.throws(()=>nextDesignUnit(duplicate),{code:'invalid_checkpoint'});
 const incomplete=structuredClone(a);incomplete.impact!.consistencyChunkIds=[];assert.throws(()=>nextDesignUnit(incomplete),{code:'invalid_checkpoint'});
 const full=structuredClone(f.baseline);assert.deepEqual(selectedDesignChunks(full).map(c=>c.id),['keep','edit','final']);
});

test('impact reservation kinds preserve retry counters and reject mismatches without mutation',t=>{
 const f=impactFixture(t),a=f.current;assert.equal(nextDesignUnit(a)!.preparationKind,'impact');
 const before=JSON.stringify(a);assert.throws(()=>reserveDesignUnit(a),{code:'invalid_checkpoint'});assert.equal(JSON.stringify(a),before);
 const first=reserveDesignUnit(a,undefined,false,false,'impact');assert.equal(a.current!.kind,'impact');assert.equal(a.unit!.phase,'impact');assert.equal(a.unit!.unitId,'impact');assert.equal(a.unit!.dispatches,1);
 a.status='interrupted';const second=reserveDesignUnit(a,undefined,false,true,'impact');assert.notEqual(first,second);assert.equal(a.unit!.dispatches,2);assert.equal(a.unit!.retriesUsed,1);
 reserveDesignUnit(a,undefined,false,true,'impact');reserveDesignUnit(a,undefined,false,true,'impact');assert.throws(()=>reserveDesignUnit(a,undefined,false,true,'impact'),{code:'retry_budget_exhausted'});
 reserveDesignUnit(a,undefined,true,true,'impact');assert.equal(a.unit!.dispatches,4);assert.equal(a.unit!.userDirectedDispatches,1);
 const ordinary=structuredClone(f.checkpoint.attempts[0]!);assert.throws(()=>reserveDesignUnit(ordinary,undefined,false,false,'impact'),{code:'invalid_checkpoint'});reserveDesignUnit(ordinary);assert.equal(ordinary.current!.kind,'planning');
 const synthetic=structuredClone(f.current);delete synthetic.unit;synthetic.current={kind:'impact',executionId:'old',sequence:0,issuedAt:synthetic.startedAt};synthetic.status='interrupted';reserveDesignUnit(synthetic,undefined,false,true,'impact');assert.equal(synthetic.unit!.dispatches,2);
});

test('accepted selection corruption stays terminal and all-fresh checkpoints retain recovery behavior',t=>{
 const f=impactFixture(t),a=f.current;a.plan=f.plan;a.impact=f.impact;
 for(const change of [(x:typeof a)=>{x.impact!.retainedCoverage.push({...x.impact!.retainedCoverage[0]!});},(x:typeof a)=>{delete x.impact;},(x:typeof a)=>{x.plan!.chunks=[];}]){
  const bad=structuredClone(a);change(bad);try{nextDesignUnit(bad);assert.fail('Expected rejection');}catch(e){assert.equal((e as {code:string}).code,'invalid_checkpoint');assert.equal(designTechnicalFailure(e),undefined);}
 }
 const old=structuredClone(f.checkpoint.attempts[0]!);assert.equal(nextDesignUnit(old)!.preparationKind,'planning');reserveDesignUnit(old);assert.equal(old.current!.kind,'planning');
});
