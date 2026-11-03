import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemovalRetirementBudget, RemovalRetirementOwner } from '../removal-retirement.js';

const code=(wanted:string)=>(error:unknown)=>error instanceof Error && 'code' in error && error.code===wanted;

test('CM-S4-RETIRE: shared budget enforces 64 per root and 256 daemon-wide without eviction',async()=>{
 const budget=new RemovalRetirementBudget();
 const owners=Array.from({length:4},(_,i)=>new RemovalRetirementOwner(`/root/${i}`,budget));
 const tokens=owners.map((owner,i)=>Array.from({length:64},(_,j)=>owner.prepare(`op-${i}-${j}`,`revision-${j}`)));
 const peer=new RemovalRetirementOwner('/root/0',budget);
 assert.throws(()=>peer.prepare('peer','revision'),code('resource-limit'));
 const fifth=new RemovalRetirementOwner('/root/4',budget);
 assert.throws(()=>fifth.prepare('257','revision'),code('resource-limit'));
 assert.ok(owners[0]!.pending('op-0-0','revision-0'));
 owners[0]!.cancel(tokens[0]![0]!);owners[0]!.cancel(tokens[0]![0]!);
 const extra=fifth.prepare('257','revision');
 assert.throws(()=>peer.prepare('still-full','revision'),code('resource-limit'));
 fifth.cancel(extra);
 const replacement=peer.prepare('replacement','revision');peer.cancel(replacement);
 for(const [i,owner] of owners.entries()) for(const token of tokens[i]!) owner.cancel(token);
 const clean=fifth.prepare('clean','revision');await fifth.commit(clean,async()=>{}).close();
});

test('CM-S4-RETIRE: opaque tokens bind owner, operation and revision and only uncommitted reservations cancel',async()=>{
 const budget=new RemovalRetirementBudget(),owner=new RemovalRetirementOwner('/root',budget),peer=new RemovalRetirementOwner('/root',budget);
 const token=owner.prepare('op','old');
 assert.throws(()=>peer.cancel(token),code('operation-mismatch'));
 assert.throws(()=>owner.commit({},async()=>{}),code('operation-mismatch'));
 assert.throws(()=>owner.prepare('op','new'),code('operation-mismatch'));
 assert.throws(()=>owner.pending('op','new'),code('operation-mismatch'));
 assert.throws(()=>owner.retry('op','new'),code('operation-mismatch'));
 await assert.rejects(owner.retry('op','old'),code('busy'));
 let closed=0;const cleanup=owner.commit(token,async()=>{closed++;});
 assert.throws(()=>owner.cancel(token),code('busy'));
 assert.throws(()=>owner.commit(token,async()=>{}),code('operation-mismatch'));
 await cleanup.close();await cleanup.close();await owner.retry('op','old');
 assert.equal(closed,1);assert.equal(owner.pending('op','old'),false);
});

test('CM-S4-RETIRE: failed close retains exact ownership and concurrent retries share one attempt',async()=>{
 const owner=new RemovalRetirementOwner('/root',new RemovalRetirementBudget());
 const token=owner.prepare('old-operation','old-revision');
 let calls=0,finish!:()=>void;
 const cleanup=owner.commit(token,async()=>{calls++;if(calls===1)throw new Error('secret-canary');await new Promise<void>(resolve=>{finish=resolve;});});
 await assert.rejects(cleanup.close(),error=>code('recovery-required')(error) && !(error as Error).message.includes('secret-canary'));
 assert.ok(owner.pending('old-operation','old-revision'));
 const retry=cleanup.close();const same=owner.retry('old-operation','old-revision');assert.equal(retry,same);
 await Promise.resolve();assert.equal(calls,2);finish();await retry;
 assert.equal(owner.pending('old-operation','old-revision'),false);
});

test('CM-S4-RETIRE: shutdown drains already-owned resources at capacity and keeps failures for retry',async()=>{
 const owner=new RemovalRetirementOwner('/root',new RemovalRetirementBudget());
 let calls=0,fail=true;
 for(let i=0;i<64;i++){const token=owner.prepare(`op${i}`,`r${i}`);owner.commit(token,async()=>{calls++;if(i===0&&fail)throw new Error('canary');});}
 owner.stopAdmission();assert.throws(()=>owner.prepare('extra','revision'),code('busy'));
 await assert.rejects(owner.drain(),code('recovery-required'));assert.equal(calls,64);
 assert.ok(owner.pending('op0','r0'));assert.equal(owner.pending('op1','r1'),false);
 fail=false;await owner.drain();assert.equal(calls,65);assert.equal(owner.pending('op0','r0'),false);
});
