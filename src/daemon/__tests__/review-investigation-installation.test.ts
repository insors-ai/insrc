import { installedSourceMatches } from '../installed-commit.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,chmodSync,rmSync,realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname,delimiter } from 'node:path';
import { installedInvestigationImages,assertInstalledImagesPinned,inspectInstalledInvestigation } from '../../agent/providers/native-investigation-installation.js';
import type { NativeAdapterIdentity } from '../../agent/providers/investigation-session.js';
import { investigationCapabilities } from '../review-investigation-gateway.js';
import { InvestigationAdoptionPolicy } from '../review-investigation-adoption.js';
import { fixture } from './review-investigation-fixtures.js';
import { scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';

test('Installed adapter and activation readiness remain explicit across the final matrix',async()=>{
 assert.equal(installedSourceMatches('/installation','a'.repeat(40),['src'],{exec:()=>''}),true);assert.equal(installedSourceMatches('/installation','a'.repeat(40),['src'],{exec:()=> 'untracked.ts'}),false);assert.equal(installedSourceMatches('/installation','a'.repeat(40),['src'],{exec:()=>{throw Error('Cannot verify source');}}),false);
 const root=mkdtempSync(join(tmpdir(),'review-native-installation-'));
 try{
  const bin=join(root,'bin','codex.js'),triple=process.platform==='linux'?`${process.arch==='x64'?'x86_64':'aarch64'}-unknown-linux-musl`:`${process.arch==='x64'?'x86_64':'aarch64'}-apple-darwin`,image=join(root,'vendor',triple,'bin','codex');
  mkdirSync(dirname(bin),{recursive:true});mkdirSync(dirname(image),{recursive:true});writeFileSync(join(root,'package.json'),JSON.stringify({name:'@openai/codex',type:'module'}));writeFileSync(bin,"#!/usr/bin/env node\nprocess.stdout.write('codex-script-fixture-version\\n');\n");chmodSync(bin,0o700);writeFileSync(image,'fixture native image');chmodSync(image,0o700);
  const env={...process.env,PATH:`${dirname(process.execPath)}${delimiter}${process.env['PATH']??''}`},images=installedInvestigationImages('codex',bin,root,env);
  assert.ok(images.some(f=>f.path===realpathSync(image)));assert.ok(images.some(f=>f.path===realpathSync(process.execPath)));assert.ok(images.some(f=>f.path===realpathSync(bin)));
  const identity:NativeAdapterIdentity={kind:'codex',adapterVersion:'codex-scoped-v1',binaryVersion:'fixture',binary:images.find(f=>f.path===realpathSync(bin))!,runtimeFiles:[],profileDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64),launchDigest:'c'.repeat(64)};
  assert.throws(()=>assertInstalledImagesPinned(identity,images),/absent or stale/);const complete={...identity,runtimeFiles:images.filter(f=>f.path!==identity.binary.path)};assertInstalledImagesPinned(complete,images);
  writeFileSync(image,'changed fixture native image');assert.throws(()=>assertInstalledImagesPinned(complete,installedInvestigationImages('codex',bin,root,env)),/absent or stale/);
  const inspection=inspectInstalledInvestigation('codex',bin,root,env);assert.match(inspection.version,/fixture/);assert.equal(inspection.qualification,'not-established-by-version-inspection');
  const unknown=join(root,'unknown');writeFileSync(unknown,'#!/bin/sh\necho no-isolation\n');chmodSync(unknown,0o700);assert.throws(()=>installedInvestigationImages('codex',unknown,root,env),/Unsupported/);
 }finally{rmSync(root,{recursive:true,force:true});}
 const f=await fixture(false,false,false);try{
  for(const engine of ['legacy','unsupported-older-engine'])for(const mode of ['source-only','indexed-impact'] as const){const policy=new InvestigationAdoptionPolicy({work:f.repository.work,selection:()=>({engine,readiness:undefined,reconciliation:undefined})});await assert.rejects(()=>policy.evidence(mode),/disabled/);}
  assert.equal(investigationCapabilities().defaultEngine,'legacy');assert.deepEqual(investigationCapabilities().canonicalInvestigationVersions,[1]);
  for(const indexed of [false,true]){const catalog=scopedReviewToolCatalog(indexed);assert.equal(catalog.some(t=>/shell|filesystem|analyze|workflow|web/.test(t.name)),false);assert.equal(catalog.some(t=>t.name.includes('impact')),indexed);}
 }finally{f.close();}
});
