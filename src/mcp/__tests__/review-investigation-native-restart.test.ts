import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startNativeReviewBroker,readNativeReviewBridgeConfig,nativeReviewBindingPath,resolveNativeReviewBindingPath,forwardNativeReviewCommand,NATIVE_REVIEW_BINDING_ENV } from '../review-investigation-native.js';
import type { ScopedReviewBinding } from '../../daemon/review-investigation-bridge.js';

test('Native restart isolates stale capability files instead of overwriting another invocation',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'native-cap-restart-'));
 const binding:ScopedReviewBinding={version:1,engine:'plan-investigation-v1',bindingId:'a'.repeat(64),repo:cwd,runId:'old-run',subjectDigest:'b'.repeat(64),generation:1,attemptId:'old-attempt',requestDigest:'c'.repeat(64),expiresAt:Date.now()+60000};
 try{
  const first=await startNativeReviewBroker(cwd,binding,async()=>({old:true})),oldPath=first.bindingPath,oldBytes=readFileSync(oldPath);await first.close();writeFileSync(oldPath,oldBytes,{mode:0o600});
  // An old constant-name file can survive a pre-fix daemon too. Never replace it.
  const logical=nativeReviewBindingPath(cwd);writeFileSync(logical,'stale pre-upgrade runtime',{mode:0o600});
  const fresh={...binding,bindingId:'d'.repeat(64),runId:'new-run',generation:2,attemptId:'new-attempt'};
  const resumed=await startNativeReviewBroker(cwd,fresh,async()=>({new:true}));try{
   assert.notEqual(resumed.bindingPath,oldPath);assert.equal(readFileSync(oldPath,'utf8'),oldBytes.toString());assert.equal(readFileSync(logical,'utf8'),'stale pre-upgrade runtime');
   assert.equal(resolveNativeReviewBindingPath(logical,binding.bindingId),oldPath);assert.equal(resolveNativeReviewBindingPath(logical,fresh.bindingId),resumed.bindingPath);
   const current=readNativeReviewBridgeConfig(resumed.bindingPath);assert.equal(current.binding.runId,'new-run');
   const transport=new StdioClientTransport({command:process.execPath,args:['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../../bin/insrc-review-bridge.ts',import.meta.url)),logical,'source-only'],cwd,env:{PATH:process.env['PATH']??'',HOME:process.env['HOME']??'',[NATIVE_REVIEW_BINDING_ENV]:fresh.bindingId},stderr:'pipe'}),client=new Client({name:'native-entry-fixture',version:'1'});
   try{await client.connect(transport);assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['review_read','review_progress','review_reply']);const reply=await client.callTool({name:'review_read',arguments:{reference:'fixture'}});assert.equal(reply.isError,undefined);assert.match(JSON.stringify(reply),/new/);}finally{await client.close();await transport.close();}

   const {expiresAt:_,...command}=fresh;assert.deepEqual(await forwardNativeReviewCommand(current,{...command,operation:'read',reference:'fixture'}),{new:true});
   await assert.rejects(()=>forwardNativeReviewCommand(readNativeReviewBridgeConfig(oldPath),{...command,operation:'read',reference:'fixture'}));
   assert.throws(()=>resolveNativeReviewBindingPath(logical,undefined));assert.throws(()=>resolveNativeReviewBindingPath(logical,'../../foreign'));assert.throws(()=>resolveNativeReviewBindingPath(join(cwd,'foreign.json'),fresh.bindingId));
  }finally{await resumed.close();}
  assert.equal(existsSync(resumed.bindingPath),false);assert.equal(existsSync(oldPath),true);
 }finally{rmSync(cwd,{recursive:true,force:true});}
});
