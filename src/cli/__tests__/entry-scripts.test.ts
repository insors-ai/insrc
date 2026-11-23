/** Run the real development entry scripts against isolated application entries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('CLI and MCP launch isolated development entries with preserved arguments and workspace without installer fallback', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-launch roots-')));
  const caller = join(root, 'workspace');
  const bin = join(root, 'bin');
  const fixture = 'process.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),workspace:process.env.INSRC_CWD,options:process.env.NODE_OPTIONS,path:process.env.NODE_PATH}))';
  try {
    for (const directory of ['scripts', 'out/cli', 'out/bin', 'src/cli', 'workspace', 'bin']) mkdirSync(join(root, directory), { recursive: true });
    for (const name of ['insrc', 'insrc-mcp']) copyFileSync(new URL(`../../../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
    symlinkSync(process.execPath, join(bin, 'node'));
    const env = { ...process.env, HOME: root, PATH: `${bin}:/usr/bin:/bin`, NODE_OPTIONS: '--require /nonexistent-preload', NODE_PATH: '/nonexistent-module-path' };
    const run = (name: string) => spawnSync('/bin/bash', [join(root, 'scripts', name), 'hello world'], { cwd: caller, env, encoding: 'utf8', timeout: 10000 });
    writeFileSync(join(root, 'out/cli/index.js'), fixture);
    writeFileSync(join(root, 'out/bin/insrc-mcp.js'), fixture);
    for (const name of ['insrc', 'insrc-mcp']) {
      const result = run(name);
      assert.equal(result.status, 0, result.stderr);
      const observed = JSON.parse(result.stdout);
      assert.deepEqual(observed.args, ['hello world']);
      assert.equal(observed.options, undefined); assert.equal(observed.path, undefined);
      assert.equal(observed.cwd, name === 'insrc' ? root : caller);
      if (name === 'insrc') assert.equal(observed.workspace, caller);
    }
    rmSync(join(root, 'out/cli/index.js'));
    writeFileSync(join(root, 'src/cli/index.tsx'), fixture);
    symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(root, 'node_modules'));
    const source = run('insrc');
    assert.equal(source.status, 0, source.stderr);
    assert.deepEqual(JSON.parse(source.stdout).args, ['hello world']);
    rmSync(join(root, 'out/bin/insrc-mcp.js'));
    const missing = run('insrc-mcp');
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Built MCP entry missing/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
