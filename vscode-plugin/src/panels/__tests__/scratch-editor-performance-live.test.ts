import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { nativeScratchRun } from './fixtures/scratch-native-runner.js';

test('scratch recorded native full-bound keystroke render and acknowledgement performance', {skip:process.env['INSRC_NATIVE_PERFORMANCE_TESTS']!=='1',timeout:900000},async()=>{
  assert.equal(process.env['INSRC_NATIVE_PRIVATE_DISPLAY'],'1','Performance qualification requires a private display');
  const h=await nativeScratchRun('./scratch-editor-performance-host.ts',{timeoutMs:600000});let result:unknown;
  try {result=await h.launch('performance');const r=result as {passed:boolean;exitCode:number;timedOut:boolean};assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.exitCode,0,JSON.stringify(r));assert.equal(r.timedOut,false);}
  finally {if(process.env['INSRC_NATIVE_EVIDENCE'])await writeFile(process.env['INSRC_NATIVE_EVIDENCE'],JSON.stringify({retainedRoot:h.root,result},null,2));await h.dispose({retainFiles:true});}
});
