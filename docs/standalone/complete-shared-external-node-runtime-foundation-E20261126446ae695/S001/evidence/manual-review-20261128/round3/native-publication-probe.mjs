import fs from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {controlBinding} from '../../../src/installer/native.ts';
const root=process.argv[2],a=join(root,'stage-parent'),b=join(root,'destination-parent');
assert.equal(process.platform,'darwin');assert.notEqual(process.getuid(),0);
fs.mkdirSync(a,{mode:0o700});fs.mkdirSync(b,{mode:0o700});const stage=join(a,'candidate'),destination=join(b,'entry');
fs.mkdirSync(stage,{mode:0o700});fs.mkdirSync(join(stage,'distribution'),{mode:0o700});fs.writeFileSync(join(stage,'distribution','sample'),'verified fixture bytes',{mode:0o444});fs.chmodSync(join(stage,'distribution'),0o500);
const binding=controlBinding(),handle=binding.acquire(join(root,'operation.lock'));let failed;
try {
 fs.chmodSync(stage,0o500);try{binding.publishDirectory(handle,stage,destination);assert.fail('sealed root unexpectedly published')}catch(e){failed=e;assert.equal(e.code,'candidate-publish-uncertain');}
 assert.equal(fs.existsSync(stage),true);assert.equal(fs.existsSync(destination),false);
 fs.chmodSync(stage,0o700);const ino=fs.statSync(stage).ino;binding.publishDirectory(handle,stage,destination);
 assert.equal(fs.statSync(destination).ino,ino);assert.equal(fs.statSync(destination).mode&0o777,0o700);assert.equal(fs.statSync(join(destination,'distribution')).mode&0o777,0o500);
 fs.chmodSync(destination,0o500);const fd=fs.openSync(destination,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 assert.equal(fs.statSync(destination).mode&0o777,0o500);assert.equal(fs.readFileSync(join(destination,'distribution','sample'),'utf8'),'verified fixture bytes');
 console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,actualNativeBinding:true,sealedRootRefusal:failed.code,writableRootCrossParentPublish:true,sameRootInode:true,descendantsStayedReadOnly:true,rootSealedAndSyncedAfterPublish:true,wholeRuntimeProfileTest:false,linuxTest:false,vmQualification:false}));
} finally {binding.close(handle);assert.equal(binding.held(handle),false);}
