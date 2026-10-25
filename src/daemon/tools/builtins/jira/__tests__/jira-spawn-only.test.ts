import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installFakeAcli } from './_fakeacli.js';
import { ALL_OP_CASES } from './_all-ops.js';
import { deps } from './_sample.js';

test('jira-spawn-only.test.ts: with fake jira, jira-cli and go-jira on PATH only acli is run across every op', async () => {
  const fake = installFakeAcli('ok');
  const others = mkdtempSync(join(tmpdir(), 'insrc-otherjira-'));
  const log = join(others, 'calls.log');
  writeFileSync(log, '');
  for (const name of ['jira', 'jira-cli', 'go-jira']) {
    writeFileSync(join(others, name), `#!/bin/sh\necho "${name} $@" >> "${log}"\nexit 0\n`);
    chmodSync(join(others, name), 0o755);
  }
  const savedPath = process.env['PATH'];
  process.env['PATH'] = `${others}:${savedPath ?? ''}`;
  try {
    assert.equal(ALL_OP_CASES.length, 32);
    let acliCalls = 0;
    for (const c of ALL_OP_CASES) {
      writeFileSync(`${fake.log}.out`, c.stdout);
      process.env['FAKE_STDOUT_FILE'] = `${fake.log}.out`;
      const before = fake.calls().length;
      await c.tool.execute(c.input, deps());
      const made = fake.calls().slice(before);
      assert.ok(made.length >= 1, `${c.tool.id} ${String(c.input['op'])} ran acli`);
      for (const call of made) { assert.ok(call.startsWith('jira '), `${c.tool.id} ${String(c.input['op'])}: ${call}`); }
      acliCalls += made.length;
    }
    assert.ok(acliCalls >= 32);
    assert.equal(readFileSync(log, 'utf8'), '', 'jira, jira-cli and go-jira were never run');
    // no credential in any argv
    for (const call of fake.calls()) { assert.doesNotMatch(call, /password|token|api[-_ ]?key|secret|Authorization/i, call); }
  } finally { process.env['PATH'] = savedPath; fake.restore(); }
});
