/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, renameSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironment } from '../../../../design/corpus/sources/git-reader.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
export function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'review-packets-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...gitEnvironment(), GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }, encoding: 'utf8' }).trim();
 git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
 const write = (path: string, value: string | Uint8Array) => writeFileSync(join(dir, path), value);
 const commit = () => { git('add', '--all'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
 return { dir, git, write, commit, close: () => rmSync(dir, { recursive: true, force: true }) };
}
test('Exact parent/blob/change-kind packet and hardened reader reuse fixtures', async () => {
 const f = fixture();
 try {
  f.write('old.txt', 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n'); f.write('gone.txt', 'gone\n'); f.write('mode.txt','mode\n');
  const parent = f.commit();
  renameSync(join(f.dir, 'old.txt'), join(f.dir, 'renamed.txt')); f.write('renamed.txt', 'A\nb\nc\nd\ne\nf\ng\nh\ni\nj\n');
  rmSync(join(f.dir, 'gone.txt')); f.write('- odd ü.txt', 'new\n'); f.write('binary.dat', new Uint8Array([0,1,2])); chmodSync(join(f.dir,'mode.txt'),0o755);
  const commit = f.commit(); const reader = new ReviewGitReader(f.dir);
  const packet = await readCommitPacket(reader, commit, parent);
  assert.ok(packet.blocks.some(b=>b.kind==='rename')); assert.ok(packet.blocks.some(b=>b.kind==='mode'));
  assert.ok(packet.blocks.some(b=>b.kind==='binary')); assert.ok(packet.blocks.some(b=>b.kind==='delete'));
  assert.ok(packet.blocks.some(b=>b.kind==='add' && b.newPath==='- odd ü.txt'));
  const edit=packet.blocks.find(b=>b.kind==='text' && b.newPath==='renamed.txt');
  assert.deepEqual(edit?.oldLines,[1,1]); assert.deepEqual(edit?.newLines,[1,1]);
  assert.equal(edit?.oldPath,'old.txt');
  f.write('foreign.txt', 'foreign\n'); f.commit(); f.write('renamed.txt','dirty\n');
  assert.deepEqual(await readCommitPacket(new ReviewGitReader(f.dir),commit,parent),packet);
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir),parent,commit),{code:'unsupported-change'});
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir),commit,commit),{code:'invalid-object'});
  await assert.rejects(()=>new ReviewGitReader(f.dir,async()=>new Uint8Array(5)).object(commit,'commit'),{code:'invalid-object'});
 } finally { f.close(); }
});
test('packet extraction refuses unsupported files and preserves zero-count ranges',async()=>{
 const f=fixture();try {
  f.write('a','one\nthree\n');const parent=f.commit();f.write('a','one\ntwo\nthree\n');const commit=f.commit();
  const p=await readCommitPacket(new ReviewGitReader(f.dir),commit,parent);
  assert.equal(p.blocks[0]?.oldLines,null);assert.deepEqual(p.blocks[0]?.newLines,[2,2]);
  f.git('update-index','--add','--cacheinfo',`160000,${commit},submodule`);f.git('commit','-qm','submodule');
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir),f.git('rev-parse','HEAD'),commit),{code:'unsupported-change'});
 }finally{f.close();}
});
