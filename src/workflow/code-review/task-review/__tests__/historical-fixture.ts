/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { roundWriterFor } from '../../../../daemon/lifecycle-registry.js';
import { RegistryReviewSources } from '../sources.js';
import type { ReviewPacket, ReviewCheckpoint, TaskReviewResult } from '../contracts.js';
export const historicalOids={early:'f0d5da04756e1e96a5043c0063a8891dd2455c7e',fixed:'76d3d899a5f144721e2a3328a9933e346be3b600'};
export const historicalPaths={source:'src/workflow/review/design-review/provenance.ts',coverage:'src/workflow/review/design-review/results.ts',oldTest:'src/workflow/review/design-review/__tests__/provenance.test.ts',fixTest:'src/workflow/review/design-review/__tests__/impact-qualification.test.ts'};
export const historicalHash='1234567890abcdef';
export function immutableText(oid:string,path:string):string{return execFileSync('git',['show',`${oid}:${path}`],{cwd:process.cwd(),encoding:'utf8',maxBuffer:4*1024*1024});}
/** Execute the actual immutable function body; only its schema/guard dependency
 * is stubbed to isolate root-report lookup behavior, not schema validation. */
export function rootLookup(text:string):unknown {
 const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports:Record<string,unknown>={};
 const contracts={DESIGN_LIMITS:{attempts:20,resultBytes:1024*1024},DesignResultSchema:{},decodeDesign:(_schema:unknown,value:unknown)=>value,requireDesign:(condition:unknown,_code:string,message:string)=>{assert.ok(condition,message);}};
 new Function('require','exports',js)((path:string)=>{assert.equal(path,'./contracts.js');return contracts;},exports);
 const result={chunkId:'keep',status:'passed',limitations:[]};
 const history=[{number:1,status:'invalidated'}, {number:2,status:'passed',reviewer:'daemon',baseline:{contentIdentity:'pin'},plan:{chunks:[{id:'keep',purpose:'substantive'}]},report:{reviewId:'r',artifactId:'LLD-x',attempt:2,reviewedContentIdentity:'pin'},completedChunks:[result]}];
 const resolve=exports['resolveDesignCoverage'] as (h:unknown[],from:number,chunk:string,before:number,reviewer:string)=>{result:unknown};
 return resolve(history,2,'keep',3,'daemon').result;
}
export async function historicalFixture(){
 registerGitTools();
 const repo=mkdtempSync(join(tmpdir(),'review-historical-synthetic-'));
 const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).trim();
 const put=(path:string,value:unknown)=>{mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),typeof value==='string'?value:JSON.stringify(value));};
 const oldSource=immutableText(historicalOids.early,historicalPaths.source),finalSource=immutableText(historicalOids.fixed,historicalPaths.source),coverage=immutableText(historicalOids.fixed,historicalPaths.coverage),oldTest=immutableText(historicalOids.early,historicalPaths.oldTest),fixTest=immutableText(historicalOids.fixed,historicalPaths.fixTest);
 git('init','-q');git('config','user.name','Synthetic immutable regression');git('config','user.email','synthetic@example.test');
 const date='2026-11-07T00:00:00.000Z',meta={epicHash:historicalHash,storyId:'s1',repoPath:repo,createdAt:date,epicCreatedAt:date,epicSlug:'synthetic-historical'};
 const docs={story:`.insrc/artifacts/DEF-${historicalHash}.json`,lld:`.insrc/artifacts/LLD-${historicalHash}-s1.json`,plan:`.insrc/artifacts/PLAN-${historicalHash}-s1.json`};
 put(docs.story,{meta:{...meta,workflow:'define'},body:{stories:[{id:'s1'}]}});put(docs.lld,{meta:{...meta,workflow:'design.story'},body:{summary:'Final root-report lookup; mandatory requiredReferences regression coverage'}});
 put(docs.plan,{meta:{...meta,workflow:'plan'},body:{tasks:['t3','t9'].map((id,i)=>({id,title:id,summary:i?'Later root fallback and regression':'Retained provenance and requiredReferences coverage',size:'S',order:i+1,dependsOn:i?['t3']:[],acceptanceChecks:['Review final root fallback and mandatory requiredReferences test coverage'],derivedFrom:['c1'],tests:[{level:'unit',name:'Root fallback and requiredReferences'}]}))},citations:[{id:'c1',kind:'stakeholder',ref:'Labelled synthetic reproduction from durable CR review1 and immutable source; unavailable checkpoint not recovered'}]});
 const build={meta:{...meta,workflow:'build',authoredBy:'controller'},body:{summary:'Synthetic immutable t3/t9 reproduction, not raw packet recovery',tasks:[{id:'t3',passed:true},{id:'t9',passed:true}]}};const buildPath=`.insrc/artifacts/BUILD-${historicalHash}-s1.json`;put(buildPath,build);put('.insrc/schema.json',{version:2});git('add','.');git('commit','-qm','synthetic design only');const base=git('rev-parse','HEAD');
 put(historicalPaths.source,oldSource);put(historicalPaths.coverage,coverage);put(historicalPaths.oldTest,oldTest);git('add','.');git('commit','-qm',`synthetic selected copies from ${historicalOids.early} and final coverage source`);const early=git('rev-parse','HEAD');
 put(historicalPaths.source,finalSource);put(historicalPaths.fixTest,fixTest);git('add','.');git('commit','-qm',`synthetic included fix from ${historicalOids.fixed}`);const fixed=git('rev-parse','HEAD');
 const sources=new RegistryReviewSources({repoPath:repo,sessionId:'historical-synthetic',requestId:1,send:()=>{}});
 const sourceRuns=await sources.changedRanges(fixed,early,[historicalPaths.source]);
 const lines=(text:string)=>text.split('\n').length-Number(text.endsWith('\n'));
 const packet:ReviewPacket={reviewRevision:fixed,storyId:'s1',functionalSummary:`Labelled synthetic t3/t9 reproduction using exact immutable source copies ${historicalOids.early}/${historicalOids.fixed} and durable CR. Missing original checkpoint/attribution/timing were NOT recovered.`,documents:Object.fromEntries(Object.entries(docs).map(([key,path])=>[key,{path,commit:base}])),reviewSet:[{commit:early,parent:base,files:[{path:historicalPaths.source,segments:[{after:[1,lines(oldSource)]}]},{path:historicalPaths.coverage,segments:[{after:[1,lines(coverage)]}]},{path:historicalPaths.oldTest,segments:[{after:[1,lines(oldTest)]}]}]},{commit:fixed,parent:early,files:[{path:historicalPaths.source,segments:sourceRuns.map(r=>r.after?{after:r.after}:{deletionAt:r.deletionAt!})},{path:historicalPaths.fixTest,segments:[{after:[1,lines(fixTest)]}]}]}],tests:[{file:historicalPaths.oldTest,cases:['backward provenance resolves eligible chains and preserves findings without copying historical bodies'],command:'not executed',result:'not_run',executionDetails:'Immutable synthetic source evidence; no requiredReferences missing-citation regression supplied',evidenceReferences:[]},{file:historicalPaths.fixTest,cases:['correction after an invalidated first attempt and full restart can retain the restarted coverage'],command:'not executed',result:'not_run',executionDetails:'Exact final immutable test source copied, with original case name inspected below; synthetic transport evidence only',evidenceReferences:[]}]};
 const scope={tasks:[{taskId:'t3',changeIndexes:[0,1,2,3,4],testIndexes:[0,1]},{taskId:'t9',changeIndexes:[3,4],testIndexes:[0,1]}]};
 // Move unrelated HEAD and working tree beyond the explicit final pin.
 put('unrelated.js','UNRELATED_HEAD_CANARY\n');git('add','unrelated.js');git('commit','-qm','unrelated HEAD canary');put(historicalPaths.source,'WORKTREE_CANARY\n');
 const coverageLine=coverage.split('\n').findIndex(line=>line.includes('assessDesignResult(results[i]')&&/,\s*\[\]\s*,/.test(line))+1;
 assert.ok(coverageLine>0,'immutable final requiredReferences defect must be present');
 const result=(taskId:string):TaskReviewResult=>({taskId,status:taskId==='t3'?'changes_requested':'passed',summary:'Synthetic asserted final-source review; no hosted model',findings:taskId==='t3'?[{severity:'MED',location:`${historicalPaths.coverage}:${coverageLine}`,message:'Final requiredReferences recheck has no missing-citation regression',rationale:'The selected final implementation passes [] while the submitted tests do not exercise that missing required-reference path.',evidenceReferences:[`${fixed}:${historicalPaths.coverage}`,`${fixed}:${historicalPaths.oldTest}`]}]:[],testCoverage:{assessment:'verified',explanation:'Asserted final source/test bodies; execution optional, demonstrated missing coverage retained as a finding',evidenceReferences:[`${fixed}:${historicalPaths.fixTest}`]},limitations:[],advice:['Optional execution: synthetic reviewer checks immutable source; no hosted review claimed'],inspectedReferences:[`${fixed}:${historicalPaths.source}`,...(taskId==='t3'?[`${fixed}:${historicalPaths.coverage}`]:[])],executedTests:[]});
 return{repo,packet,scope,result,oldSource,finalSource,oldTest,fixTest,coverage,early,fixed,build,buildPath,put,git,deps:{sources,through:roundWriterFor(repo)},read:(path:string)=>JSON.parse(readFileSync(path,'utf8'))as ReviewCheckpoint,cleanup:()=>rmSync(repo,{recursive:true,force:true})};
}
