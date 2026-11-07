/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { CODE_REVIEW_INPUT } from '../../../../mcp/code-review/schema.js';
import { PacketSchema, parsePacket, TaskReviewInputError } from '../contracts.js';
import { prepareReviewAdmission } from '../admission.js';
import { saveCheckpoint, checkpointPath } from '../checkpoint.js';
import { fixture } from './publication-fixture.js';

function sources(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.name==='__tests__'?[]:e.isDirectory()?sources(join(path,e.name)):/\.(?:ts|mjs|js)$/.test(e.name)?[join(path,e.name)]:[]);}
test('transition: every fresh producer and MCP schema explicitly supplies the final pin',()=>{
 const producers:string[]=[];
 for(const path of [...sources('src'),...sources('scripts')]){
  const tree=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node):void=>{
   if(ts.isObjectLiteralExpression(node)){
    const names=node.properties.flatMap(p=>p.name&&ts.isIdentifier(p.name)||p.name&&ts.isStringLiteral(p.name)?[p.name.text]:[]);
    if(names.includes('reviewSet')&&names.includes('functionalSummary')){
     producers.push(path);assert.ok(names.includes('reviewRevision'),`${path} constructs a packet without explicit reviewRevision`);
    }
   }
   ts.forEachChild(node,visit);
  };visit(tree);
 }
 assert.ok(producers.includes('scripts/smoke-task-review.mjs'),'compiled producer is inventoried');
 assert.ok(PacketSchema.required!.includes('reviewRevision'));
 assert.match(PacketSchema.properties.reviewRevision.description!,/explicit full Git commit OID/);
 const schema=z.object(CODE_REVIEW_INPUT),packet={storyId:'s1',functionalSummary:'S',documents:{},reviewSet:[{commit:'a'.repeat(40),parent:null,files:[{path:'a.ts',segments:[{after:[1,1]}]}]}],tests:[]};
 const missing=schema.safeParse({phase:'start',epicHash:'1'.repeat(16),reviewId:'pin',attempt:1,packet});assert.equal(missing.success,false);if(!missing.success)assert.ok(missing.error.issues.some(i=>i.path.join('.')==='packet.reviewRevision'));
 assert.throws(()=>parsePacket(packet),(e:unknown)=>e instanceof TaskReviewInputError&&e.field==='reviewRevision');
 assert.equal(schema.safeParse({phase:'start',epicHash:'1'.repeat(16),reviewId:'pin',attempt:1,packet:{...packet,reviewRevision:'a'.repeat(40)}}).success,true);
});

test('transition: interrupted unpinned work is read-only on both reviewer routes without mutation',async()=>{
 for(const reviewer of ['daemon','controller']as const){const f=await fixture();try{
  const cp=f.checkpoint('old'),a=cp.attempts[0]!;a.header.reviewer=reviewer;a.header.status='running';delete a.header.completedAt;a['review-response'].tasks=[];delete a.submitted.reviewRevision;
  for(const k of ['finalScopeIdentity','attributionState','acceptedAttribution','taskScopeIdentities','attributionIdentity']as const)delete a.header[k];
  const path=checkpointPath(f.repo,'old');await saveCheckpoint(path,cp);const bytes=readFileSync(path,'utf8');
  await assert.rejects(prepareReviewAdmission(f.repo,'old',1,undefined,reviewer,f.deps.sources,{operation:'resume'}),/Interrupted unpinned history is read-only; submit a new pinned attempt/);
  assert.equal(readFileSync(path,'utf8'),bytes);
 }finally{f.cleanup();}}
});

test('transition: coordinated rollout and adjacent ownership are explicit in shipped guidance',()=>{
 const doc=readFileSync('docs/task-review-execution.md','utf8'),steering=readFileSync('src/prompts/steering-block.md','utf8').split('<!-- insrc:guide:code-review:start -->')[1]!.split('<!-- insrc:guide:code-review:end -->')[0]!;
 for(const text of [doc,steering]){
  for(const phrase of [/drain or explicitly interrupt/i,/no activation flag/i,/no automatic\s*deployment|or automatic\s*deployment|automatic\s*deployment or promise/i,/retain an upgraded\s*reader/i,/unpinned work requires a new pinned/i,/reviewRevision/,/review.maxJsonBytes/])assert.match(text,phrase);
 }
 const ordered=['ISSUE-2a3c21b73b79ef9c','ISSUE-81e68ebf54745c75','ISSUE-860d6e82ab04d314'];assert.ok(ordered.every(id=>doc.includes(id)));
 assert.match(doc,/Rebase\/merge each later change onto its reviewed predecessors/);assert.match(doc,/do not blind-downgrade|Do not blind-downgrade/i);
});
