import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { nativeScratchRun } from './fixtures/scratch-native-runner.js';

test('scratch real native rich authoring explicit Send picker and note actions', {skip:process.env['INSRC_NATIVE_AUTHORING_TESTS']!=='1',timeout:300000},async()=>{
  assert.equal(process.env['INSRC_NATIVE_PRIVATE_DISPLAY'],'1','Native authoring requires a private display');assert.ok(process.env['INSRC_XCLIP_BIN'],'Real image paste needs a private-display clipboard owner');
  const evidencePath=process.env['INSRC_NATIVE_EVIDENCE']?.replace('{suite}','authoring');
  const h=await nativeScratchRun('./scratch-editor-authoring-host.ts',{workspace:true});let result:unknown;
  try{result=await h.launch('authoring');const r=result as {passed:boolean;exitCode:number;timedOut:boolean};assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.exitCode,0,JSON.stringify(r));assert.equal(r.timedOut,false);}
  finally{if(evidencePath)await writeFile(evidencePath,JSON.stringify({retainedRoot:h.root,result},null,2));await h.dispose({retainFiles:true});}
});
