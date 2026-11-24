import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

test('installed explicit home scopes socket config and daemon-owned data together', async () => {
  const children: ChildProcess[] = [], module = new URL('../../../out/shared/paths.js', import.meta.url).href;
  try {
    for (const home of [undefined, join(homedir(), 'isolated insrc fixture')]) {
      const env = { ...process.env }; if (home === undefined) delete env['INSRC_HOME']; else env['INSRC_HOME'] = home;
      const child = spawnFixture(process.execPath, ['--input-type=module', '-e', `import {PATHS} from ${JSON.stringify(module)};process.stdout.write(JSON.stringify({home:PATHS.insrc,socket:PATHS.sockFile,config:PATHS.config,lmdb:PATHS.lmdb,lance:PATHS.lance}));`], { env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
      let output = ''; child.stdout!.on('data', d => { output += String(d); }); assert.deepEqual(await once(child, 'close'), [0, null]);
      const expected = home ?? join(homedir(), '.insrc'); assert.deepEqual(JSON.parse(output), { home: expected, socket: join(expected, 'daemon.sock'), config: join(expected, 'config.json'), lmdb: join(expected, 'graph.lmdb'), lance: join(expected, 'lance') });
    }
    for (const home of ['', 'relative', '/tmp/../foreign', '//server/share']) {
      const child = spawnFixture(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(module)});`], { env: { ...process.env, INSRC_HOME: home }, stdio: ['ignore', 'ignore', 'pipe'] }); children.push(child);
      assert.equal((await once(child, 'close'))[0], 1);
    }
  } finally { await stopOwnedChildren(children); }
});
