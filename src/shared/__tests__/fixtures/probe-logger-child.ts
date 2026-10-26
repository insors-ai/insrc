import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const directory=process.env['LOGGER_TEST_ROOT']!;
const {PATHS}=await import(process.env['LOGGER_PATHS_URL']!);
Object.assign(PATHS,{logDir:join(directory,'logs'),daemonLog:join(directory,'logs','daemon.log'),agentLog:join(directory,'logs','agent.log')});
const originalRead=fs.readFileSync,originalMkdir=fs.mkdirSync;
let configReads=0,directoryCreates=0;
fs.readFileSync=((path: unknown,...args: unknown[])=>{
 if(String(path).endsWith('/.insrc/config.json')) configReads++;
 return (originalRead as Function)(path,...args);
}) as typeof fs.readFileSync;
fs.mkdirSync=((path: unknown,...args: unknown[])=>{
 if(String(path).includes(directory)) directoryCreates++;
 return (originalMkdir as Function)(path,...args);
}) as typeof fs.mkdirSync;
syncBuiltinESMExports();
const {getLogger,getLogMode}=await import(process.env['LOGGER_URL']!);
assert.equal(getLogMode(),process.env['INSRC_MODE']);
const log=getLogger('private-source-path-canary');
log.info({password:'credential-canary'},'success-canary');
log.error({err:new Error('failure-canary')},'close-canary');
log.fatal('final-canary');
log.flush();
if(process.env['INSRC_MODE']==='probe-worker') {
 assert.equal(configReads,0);assert.equal(directoryCreates,0);
 assert.equal(fs.existsSync(PATHS.logDir),false);
} else {
 assert.ok(configReads>0);assert.ok(directoryCreates>0);
 const deadline=Date.now()+5000;
 const contents=()=>fs.readdirSync(PATHS.logDir).filter(name=>fs.statSync(join(PATHS.logDir,name)).isFile()).map(name=>fs.readFileSync(join(PATHS.logDir,name),'utf8')).join('');
 while(!contents().includes('final-canary') && Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
 assert.ok(contents().includes('final-canary'));
}
