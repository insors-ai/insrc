import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openVerifiedVibeSession } from '../../vibe-session.js';

// Run manually with Node and tsx. The app server opens an isolated session, but
// no prompt is sent. The fixture's provider cannot leave localhost.
const binary = process.argv[2] ?? 'vibe-app-server';
const home = await mkdtemp(join(tmpdir(), 'insrc-vibe-qualification-'));
const config = join(home, 'config.toml');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function writableDirectories(path) {
  await chmod(path, 0o700);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) await writableDirectories(join(path, entry.name));
  }
}
const fixture = `
active_model = "insrc-probe-default"
enable_telemetry = false
enable_update_checks = false
[[providers]]
name = "insrc-loopback"
api_base = "http://127.0.0.1:1/v1"
api_style = "openai"
[[models]]
name = "insrc-default-model"
alias = "insrc-probe-default"
provider = "insrc-loopback"
thinking = "low"
thinking_levels = ["low", "high"]
[[models]]
name = "insrc-selected-model"
alias = "insrc-probe-selected"
provider = "insrc-loopback"
thinking = "low"
thinking_levels = ["low", "high"]
`;
try {
  await writeFile(config, fixture);
  const before = await readFile(config);
  const env = { ...process.env, VIBE_HOME: home };
  delete env.VIBE_ACTIVE_MODEL;
  let effective;
  const session = await openVerifiedVibeSession({
    command: binary, cwd: home, env, timeoutMs: 15_000,
    agentConfig: { cwd: home, headless: true },
    model: 'insrc-selected-model', effort: 'high',
    catalog: [
      { id: 'insrc-default-model', efforts: ['low', 'high'] },
      { id: 'insrc-selected-model', efforts: ['low', 'high'] },
    ],
    verifyRuntime: runtime => {
      const model = runtime.config.activeModel;
      effective = { name: model.name, alias: model.alias, effort: model.thinking };
    },
  });
  await session.transport.close();
  assert.deepEqual(effective, { name: 'insrc-selected-model', alias: 'insrc-probe-selected', effort: 'high' });
  assert.equal(session.model, effective.name);
  assert.equal(session.effort, effective.effort);
  const after = await readFile(config);
  assert.ok(before.equals(after));
  console.log(JSON.stringify({ configuredDefault: { alias: 'insrc-probe-default', effort: 'low' }, effective, beforeSha256: digest(before), afterSha256: digest(after), modelPromptSent: false }, null, 2));
} finally {
  await writableDirectories(home);
  await rm(home, { recursive: true, force: true });
}
