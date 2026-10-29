import {runRemovalPrivacy} from './fixtures/removal-privacy-run.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
test('CM-S2-A9: composed daemon and child logs contain no source credential or data canaries',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cm-composed-logs-')),fixtureHome=join(directory,'home'),fixtureTmp=join(directory,'scratch');await mkdir(fixtureHome);await mkdir(fixtureTmp);
 const child=spawn(process.execPath,['--import','tsx','--test',fileURLToPath(new URL('./actual-probe-acceptance.test.ts',import.meta.url))],{env:{...process.env,NODE_TEST_CONTEXT:undefined,HOME:fixtureHome,TMPDIR:fixtureTmp,INSRC_MODE:'cli',INSRC_LOG_LEVEL:'trace',TSX_DISABLE_CACHE:'1'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
 try{
  const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,output);
  for(const name of await readdir(fixtureHome,{recursive:true}))try{output+='\n'+await readFile(join(fixtureHome,name),'utf8');}catch{}
  assert.match(output,/listening on/,'normal daemon-side log activity was captured');
  for(const canary of ['PRIVATE_ROW_CANARY','PRIVATE_NATIVE_CANARY','PRIVATE_SOURCE_PATH_CANARY','PRIVATE_NATIVE_PATH_CANARY','old-secret-canary','unrelated-private-canary','PRIVATE_AWS_CANARY','PRIVATE_TOKEN_CANARY','PRIVATE_TABLE_CANARY'])assert.equal(output.includes(canary),false,'canary found in captured logs');
 }finally{clearTimeout(timer);child.kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
});

test('CM-S4-PRIVACY/NO-PERSIST: composed removal keeps temporary persistence poisoned and owner loss unrecoverable',{timeout:40000},async t=>{
 t.diagnostic(JSON.stringify(await runRemovalPrivacy('source')));
});
