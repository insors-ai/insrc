import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

async function snapshot(root:string){const result:Record<string,string>={};for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<directory>';}return result;}

test('CM-S2-A2: fresh compiled and tsx probe loggers perform no config directory or output writes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'probe-logger-'));
 try {
  const compiled=join(root,'compiled');await mkdir(compiled);await writeFile(join(compiled,'package.json'),' {"type":"module"}');
  await symlink(resolve('node_modules'),join(compiled,'node_modules'),'dir');
  for(const name of ['logger','paths']) {
   const source=await readFile(resolve('src/shared',name+'.ts'),'utf8');
   await writeFile(join(compiled,name+'.js'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  const childSource=await readFile(resolve('src/shared/__tests__/fixtures/probe-logger-child.ts'),'utf8');
  await writeFile(join(compiled,'child.js'),ts.transpileModule(childSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  for(const variant of ['source','compiled']) for(const mode of ['probe-worker','daemon','cli','mcp']) {
   const directory=join(root,variant+'-'+mode),home=join(directory,'home');await mkdir(join(home,'.insrc'),{recursive:true});
   await writeFile(join(home,'.insrc','config.json'),JSON.stringify({logLevel:'trace',canary:'private-config-canary'}));
   const prefix=variant==='source'?resolve('src/shared'):compiled;
   const child=variant==='source'?resolve('src/shared/__tests__/fixtures/probe-logger-child.ts'):join(compiled,'child.js');
   const ext=variant==='source'?'.ts':'.js';
   const before=await snapshot(directory);
   const result=spawnSync(process.execPath,[...(variant==='source'?['--import','tsx']:[]),child],{encoding:'utf8',timeout:10000,env:{...process.env,HOME:home,TMPDIR:directory,TSX_DISABLE_CACHE:'1',INSRC_MODE:mode,LOGGER_TEST_ROOT:directory,LOGGER_URL:pathToFileURL(join(prefix,'logger'+ext)).href,LOGGER_PATHS_URL:pathToFileURL(join(prefix,'paths'+ext)).href}});
   assert.equal(result.status,0,variant+' '+mode+' '+result.stderr);
   if(mode==='probe-worker') {assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.deepEqual(await snapshot(directory),before);}
   else {assert.ok((await readdir(join(directory,'logs'))).length>0);if(mode==='cli'){assert.match(result.stdout,/final-canary/);assert.equal(result.stderr,'');}else if(mode==='mcp'){assert.equal(result.stdout,'');assert.match(result.stderr,/final-canary/);}else{assert.equal(result.stdout,'');assert.equal(result.stderr,'');}}
  }
 } finally {await rm(root,{recursive:true,force:true});}
});
