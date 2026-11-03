import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
/** Executes only an isolated, test-owned native lifecycle fixture. */
export async function runFileRemoval(mode:'source'|'compiled'){
 const baseline=Object.fromEntries(['DEBUG','NODE_DEBUG','GRPC_TRACE','GRPC_VERBOSITY','DPI_DEBUG_LEVEL','NODE_ORACLEDB_TRACE_LEVEL','NODE_ORACLEDB_DEBUG_PACKETS','ORA_DEBUG_JDWP'].map(key=>[key,'']));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./file-removal-acceptance-child.ts',import.meta.url)),mode],{env:{...process.env,...baseline,NODE_TEST_CONTEXT:undefined,INSRC_MODE:'probe-worker'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
 const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
 try{
  const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,output);
  assert.equal(output.includes('CM_REMOVE_FILE_PRIVATE'),false);assert.equal(output.includes('CM_REMOVE_FILE_CLOSE_CANARY'),false);
  const line=output.split('\n').find(line=>line.startsWith('{"proof":"file-removal-ok"'));assert.ok(line,output);
  const proof=JSON.parse(line) as unknown;assert.deepEqual(proof,{proof:'file-removal-ok',mode,nativeAndConvertedKinds:10,directoryInputs:2,temporaryClosed:11,savedClosed:11});return proof;
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}
