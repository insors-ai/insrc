import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm,realpath,chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reviewGitCommand } from '../tools/review-git-command.js';
import { authorizeReviewNative } from '../review-native-policy.js';
import { registerBuiltinTools } from '../tools/builtins/index.js';
import { PATH_HISTORY_FORMAT } from '../tools/builtins/git/parsers.js';
import { claudeReviewSessionArgs,codexReviewSessionArgs } from '../../agent/providers/cli-provider.js';

test('production Git authority accepts isolated pinned reads and preserves literal changed paths',async t=>{
 const repo=await realpath(await mkdtemp(join(tmpdir(),'review-native-policy-')));
 t.after(()=>rm(repo,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
 await writeFile(join(repo,'a[1].ts'),'old\n');git('add','.');git('commit','-qm','before');const before=git('rev-parse','HEAD');
 await writeFile(join(repo,'a[1].ts'),'new\n');git('add','.');git('commit','-qm','after');const after=git('rev-parse','HEAD');
 registerBuiltinTools();
 const key={project:repo,family:'code' as const,reviewId:'policy'},signal=new AbortController().signal;
 const approve=async(args:string[])=>{
  const isolated=reviewGitCommand(args);
  await authorizeReviewNative(key,{kind:'tool',command:'git',cwd:repo,...isolated},'daemon',signal,undefined);
  return execFileSync('git',[...isolated.args],{cwd:repo,env:isolated.env,encoding:'utf8'});
 };
 const diff=await approve(['diff','--no-color','-U0',`${before}..${after}`,'--',':(top,literal)a[1].ts']);
 assert.match(diff,/-old/);assert.match(diff,/\+new/);
 const log=await approve(['log','-z',`--format=${PATH_HISTORY_FORMAT}`,'--full-history',`${before}..${after}`,'--',':(top,literal)a[1].ts']);
 assert.ok(log.includes(after));
 await approve(['merge-base','--is-ancestor',before,after]);
 for(const args of [['diff','HEAD~1..HEAD'],['diff',`${before}..${after}`,'--','../outside'],['status'],['diff','--output=/tmp/unsafe',`${before}..${after}`]]){
  const isolated=reviewGitCommand(args);
  await assert.rejects(authorizeReviewNative(key,{kind:'tool',command:'git',cwd:repo,...isolated},'daemon',signal,undefined));
 }
 const isolated=reviewGitCommand(['cat-file','--batch']);
 await assert.rejects(authorizeReviewNative(key,{kind:'tool',command:'git',cwd:repo,...isolated,env:{...isolated.env,GIT_CONFIG_COUNT:'1'}},'daemon',signal,undefined),/environment/);
 await assert.rejects(authorizeReviewNative(key,{kind:'cli',command:'codex',args:[],cwd:repo},'daemon',signal,undefined),/Qualified/);
});

test('production CLI authority requires qualified independent review and readonly provider profiles',async t=>{
 const repo=await realpath(await mkdtemp(join(tmpdir(),'review-cli-policy-'))),saved=process.env['PATH'];
 t.after(async()=>{if(saved===undefined)delete process.env['PATH'];else process.env['PATH']=saved;await rm(repo,{recursive:true,force:true});});
 for(const name of ['claude','codex','vibe-app-server','git']){await writeFile(join(repo,name),'#!/bin/sh\nexit 0\n');await chmod(join(repo,name),0o755);}
 process.env['PATH']=repo;
 const key={project:repo,family:'code' as const,reviewId:'cli'},signal=new AbortController().signal;
 const receipt={sourceValidation:'qualified' as const,checkpointPath:join(repo,'checkpoint.json'),attempt:1,operationId:'op',workerIncarnation:'worker',daemonInstance:'daemon'};
 for(const kind of ['claude','codex'] as const){
  const args=kind==='claude'?claudeReviewSessionArgs({},['--model','sonnet','--effort','medium'],['node --test test.ts']):codexReviewSessionArgs(join(repo,'schema.json'),repo,['--model','sol','-c','model_reasoning_effort=medium']);
  const command={kind:'cli',command:join(repo,kind),args,cwd:repo};
  await authorizeReviewNative(key,command,'daemon',signal,receipt);
  await assert.rejects(authorizeReviewNative(key,command,'controller',signal,receipt),/independent/);
  await assert.rejects(authorizeReviewNative(key,command,'daemon',signal,{...receipt,sourceValidation:'unverified'}),/Qualified/);
  await assert.rejects(authorizeReviewNative(key,{...command,args:[...args,'--full-auto']},'daemon',signal,receipt),/Unsupported/);
  if(kind==='claude')await assert.rejects(authorizeReviewNative({...key,family:'design'},command,'daemon',signal,receipt),/Readonly|Unsupported/);
 }
 const vibe={kind:'cli',command:join(repo,'vibe-app-server'),args:[],cwd:repo,keepStdinOpen:true};
 await authorizeReviewNative(key,vibe,'daemon',signal,receipt);
 await assert.rejects(authorizeReviewNative(key,{...vibe,kind:'tool'},'daemon',signal,receipt),/Unsupported/);
 await assert.rejects(authorizeReviewNative(key,vibe,'controller',signal,receipt),/independent/);
 await assert.rejects(authorizeReviewNative(key,vibe,'daemon',signal,{...receipt,sourceValidation:'unverified'}),/Qualified/);
 await assert.rejects(authorizeReviewNative(key,{...vibe,args:['--unsafe']},'daemon',signal,receipt),/Unsupported/);

});
