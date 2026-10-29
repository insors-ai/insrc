import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function runRemovalPrivacy(mode:'source'|'compiled'){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-removal-privacy-')));await mkdir(join(directory,'logs'));
 const flags=Object.fromEntries(['DEBUG','NODE_DEBUG','GRPC_TRACE','GRPC_VERBOSITY','DPI_DEBUG_LEVEL','NODE_ORACLEDB_TRACE_LEVEL','NODE_ORACLEDB_DEBUG_PACKETS','ORA_DEBUG_JDWP'].map(key=>[key,'']));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./removal-privacy-child.ts',import.meta.url)),directory,mode],{env:{...process.env,...flags,NODE_TEST_CONTEXT:undefined,INSRC_MODE:'daemon',INSRC_LOG_LEVEL:'trace'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
 try{
  const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,output);
  let logs='';for(const name of await readdir(join(directory,'logs'),{recursive:true}))try{logs+=await readFile(join(directory,'logs',name),'utf8');}catch{}
  assert.ok(logs.includes('CM_REMOVE_LOG_POSITIVE'));assert.equal((output+logs).toLowerCase().includes('cm_remove_private_'),false);assert.equal((output+logs).includes('db:v2:'),false);
  const line=output.split('\n').find(line=>line.startsWith('{"proof":"removal-privacy-ok"'));assert.ok(line,output);const result=JSON.parse(line) as {proof:string;mode:string;files:number;keychain:number;closes:number;replies:number};
  assert.equal(result.mode,mode);assert.equal(result.files,0);assert.equal(result.keychain,0);assert.equal(result.closes,2);assert.ok(result.replies>=12);return result;
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
}
