/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assessmentFixture, finalizeFixture } from './assessment-fixtures.js';

test('pure-boundary executes pure source modules with I/O forbidden', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'insrc-corpus-isolation-'));
  try {
    // Compile current source into a private output tree, never reuse shared or stale out/.
    writeFileSync(join(temporary, 'package.json'), JSON.stringify({ type: 'module' }));
    symlinkSync(resolve('node_modules'), join(temporary, 'node_modules'), 'dir');
    const config = join(temporary, 'tsconfig.json');
    writeFileSync(config, JSON.stringify({ extends: resolve('tsconfig.json'),
      compilerOptions: { rootDir: resolve('src'), outDir: join(temporary, 'out'), declaration: false, declarationMap: false, sourceMap: false },
      include: [resolve('src/design/corpus/*.ts'), resolve('src/design/corpus/sources/*.ts')], exclude: [resolve('src/design/corpus/**/__tests__/**')] }));
    execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--project', config], { encoding: 'utf8', timeout: 30_000 });
    const staged = assessmentFixture();
    const fixture = finalizeFixture(staged);
    const payload = { ...fixture, files: fixture.files.map(f => ({ ...f, bytes: Array.from(f.bytes) })),
      review: { ...staged.review, imports: staged.review.imports.map(input => ({ request: input.request,
        blobs: (input.blobs as { path: string; bytes: Uint8Array }[]).map(blob => ({ path: blob.path, bytes: Array.from(blob.bytes) })) })) } };
    const gitEntry = await import(pathToFileURL(join(temporary, 'out/design/corpus/sources/git-reader.js')).href);
    assert.equal(typeof gitEntry.readPinnedSources, 'function');
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import fsp from 'node:fs/promises';
      import net from 'node:net';
      import tls from 'node:tls';
      import http from 'node:http';
      import https from 'node:https';
      import dns from 'node:dns';
      import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      // Warm only schema dependencies so loader reads are distinct from application IO.
      await import('ajv'); await import('@sinclair/typebox');
      const candidate = JSON.parse(fs.readFileSync(0, 'utf8'));
      candidate.files = candidate.files.map(f => ({ ...f, bytes: Uint8Array.from(f.bytes) }));
      candidate.review.imports = candidate.review.imports.map(input => ({ ...input, blobs: input.blobs.map(blob => ({ ...blob, bytes: Uint8Array.from(blob.bytes) })) }));
      const calls = [];
      const deny = name => (...args) => { calls.push(name); throw new Error('Forbidden external IO: ' + name); };
      for (const name of ['appendFile','appendFileSync','writeFile','writeFileSync','write','writeSync','mkdir','mkdirSync','rm','rmSync','unlink','unlinkSync','rename','renameSync','copyFile','copyFileSync','createWriteStream','chmod','chmodSync','symlink','symlinkSync','truncate','truncateSync','watch']) {
        if (typeof fs[name] === 'function') fs[name] = deny('fs.' + name);
        if (typeof fsp[name] === 'function') fsp[name] = deny('fsp.' + name);
      }
      const openSync = fs.openSync;
      fs.openSync = (path, flags, ...rest) => flags === 'r' || flags === 0 ? openSync(path, flags, ...rest) : deny('fs.openSync.write')();
      const open = fs.open;
      fs.open = (path, flags, ...rest) => flags === 'r' || flags === 0 ? open(path, flags, ...rest) : deny('fs.open.write')();
      const promiseOpen = fsp.open;
      fsp.open = (path, flags, ...rest) => flags === 'r' || flags === 0 ? promiseOpen(path, flags, ...rest) : deny('fsp.open.write')();
      for (const [object, names] of [[net, ['connect','createConnection','createServer']], [net.Socket.prototype, ['connect']], [tls, ['connect','createServer']], [http, ['request','get','createServer']], [https, ['request','get','createServer']], [dns, ['lookup','resolve']], [cp, ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]]) {
        for (const name of names) object[name] = deny(name);
      }
      globalThis.fetch = deny('fetch'); process.dlopen = deny('native database/provider load');
      syncBuiltinESMExports();
      const corpus = await import(${JSON.stringify(pathToFileURL(join(temporary, 'out/design/corpus/index.js')).href)});
      const sources = await import(${JSON.stringify(pathToFileURL(join(temporary, 'out/design/corpus/sources/index.js')).href)});
      assert.equal('readPinnedSources' in sources, false); assert.equal('stageLocalSources' in sources, false);
      for (const name of ['readFile','readFileSync','open','openSync','readdir','readdirSync','stat','statSync','access','accessSync','createReadStream']) {
        if (typeof fs[name] === 'function') fs[name] = deny('fs.' + name);
        if (typeof fsp[name] === 'function') fsp[name] = deny('fsp.' + name);
      }
      syncBuiltinESMExports();
      const digest = corpus.candidateContentDigest(candidate.manifest);
      const proof = sources.assessEligibility(candidate.manifest, candidate.files.map(({path,bytes}) => ({path,bytes})), candidate.review);
      assert.equal(proof.ok && proof.value.passed, true);
      assert.equal(proof.value.candidateContentDigest, digest);
      const assessments = [proof.value, {...proof.value, stage:'coverage'}];
      const invalid = sources.assessEligibility(candidate.manifest, [], candidate.review);
      assert.equal(invalid.ok && invalid.value.passed, false);
      assert.equal(corpus.checkPublication({manifest:candidate.manifest,files:candidate.files}, assessments).eligible, true);
      assert.equal(corpus.checkPublication({manifest:candidate.manifest,files:candidate.files}, []).eligible, false);
      assert.equal(corpus.checkPublication({manifest:null,files:[]}, assessments).eligible, false);
      assert.deepEqual(calls, []);
    `;
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(), input: JSON.stringify(payload), encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, INSRC_LIVE_TESTS: '0' },
    }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
