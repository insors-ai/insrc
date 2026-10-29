/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { BlockProgressCoordinator } from '../progress.js';
import type { ReviewBlockProgressV1 } from '../continuation-types.js';
export function progressFixture():ReviewBlockProgressV1{
 const {turn}=continuationFixture();return {runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:'progress-1',expectedSequence:0,blockId:'block-1',disposition:'unverified',evidenceIds:[],notes:'Need more evidence',coverageUpdates:[],findings:[],outstandingWork:[turn.assignment[0]!]};
}
test('Per-block append-before-ACK, replay and uncertain acceptance',async()=>{
 const f=continuationFixture(),p=progressFixture();let release!:()=>void,appends=0,acked=false;
 const context={...f.context,ports:{...f.context.ports,appendTransition:async(...args:Parameters<typeof f.context.ports.appendTransition>)=>{appends++;await new Promise<void>(r=>{release=r;});return f.context.ports.appendTransition(...args);}}};
 const owner=new BlockProgressCoordinator(f.turn,context),pending=owner.accept(p).then(r=>{acked=true;return r;});
 while(!release)await new Promise(r=>setTimeout(r,0));assert.equal(acked,false);assert.equal(owner.state.sequence,0);
 await assert.rejects(()=>owner.accept({...p,progressId:'concurrent'}),{code:'acceptance-conflict'});release();const receipt=await pending;
 assert.equal(receipt.sequence,1);assert.equal(owner.state.accepted.length,1);assert.deepEqual(await owner.accept(p),receipt);assert.equal(appends,1);
 await assert.rejects(()=>owner.accept({...p,notes:'changed'}),{code:'acceptance-conflict'});
 await assert.rejects(()=>owner.accept({...p,progressId:'foreign',blockId:'unknown',expectedSequence:1}),{code:'invalid-progress'});
 const failing=new BlockProgressCoordinator(f.turn,{...f.context,ports:{...f.context.ports,appendTransition:async()=>{throw Error('lost response');}}});
 await assert.rejects(()=>failing.accept(p),{code:'acceptance-conflict'});assert.equal(failing.state.sequence,0);assert.equal(failing.state.uncertainProgressId,p.progressId);
 await assert.rejects(()=>failing.accept(p),{code:'acceptance-conflict'});
});
