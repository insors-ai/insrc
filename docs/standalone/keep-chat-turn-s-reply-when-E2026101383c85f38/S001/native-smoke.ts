/** Run from repo root with npx tsx <this file>; no tools/MCP, serial OAuth CLI turns. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderRegistry, nodeSpawner } from '../../../../vscode-plugin/src/chat/cli-adapter.js';
import type { SpawnedProcess, TurnProcess, SessionHandle } from '../../../../vscode-plugin/src/chat/cli-adapter.js';
import type { TurnEvent } from '../../../../vscode-plugin/src/chat/stream-events.js';
import { stopProcess } from '../../../../vscode-plugin/src/chat/session-lock.js';

async function main(): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), 'insrc-issue83-native-'));
  const native: unknown[] = [];
  let active: SpawnedProcess | undefined;
  let signals: string[] = [];
  const adapter = createProviderRegistry({
    isInstalled: () => true,
    spawn: (command, args, opts) => {
      const p = nodeSpawner(command, [...args.slice(0, -1), '--model', 'sonnet', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--'], opts);
      const wrapped: SpawnedProcess = {
        ...p,
        get pid() { return p.pid; },
        get cursor() { return p.cursor; },
        kill(signal = 'SIGTERM') { signals.push(signal); p.kill(signal); },
        async *lines() {
          for await (const line of p.lines()) {
            try {
              const r = JSON.parse(line);
              native.push(Object.fromEntries(['type', 'subtype', 'user_message_uuid', 'user_message_uuids', 'is_error'].filter(k => r[k] !== undefined).map(k => [k, r[k]])));
            } catch { /* preserve malformed lines for the adapter */ }
            yield line;
          }
        },
      };
      active = wrapped;
      return wrapped;
    },
  }).get('claude');
  let resume: SessionHandle | undefined;
  const results: Record<string, unknown>[] = [];
  const timeoutMs = 60000;
  for (const expected of ['ACK', 'ACK2']) {
    const startedAt = new Date().toISOString();
    signals = [];
    active = undefined;
    let proc: TurnProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const events: TurnEvent[] = [];
    const record: Record<string, unknown> = { expected, startedAt, timeoutMs };
    try {
      const run = (async () => {
        for await (const event of adapter.run({ provider: 'claude', cwd, prompt: `Reply exactly ${expected}.`, ...(resume ? { resume } : {}) }, { onSpawn: p => { proc = p; } })) events.push(event);
      })();
      await Promise.race([run, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('native smoke timeout')), timeoutMs); })]);
      const done = events.find(e => e.kind === 'done');
      const reply = events.filter(e => e.kind === 'assistant-delta').map(e => e.text).join('').trim();
      if (!done?.ok || reply !== expected || !done.sessionId) throw new Error(JSON.stringify({ expected, reply, events }));
      resume = { provider: 'claude', nativeSessionId: done.sessionId };
      Object.assign(record, { reply, ok: done.ok, turnId: done.turnId, nativeSessionId: done.sessionId, eventKinds: events.map(e => e.kind), completedAt: new Date().toISOString() });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      const processHandle = active as SpawnedProcess | undefined;
      if (processHandle !== undefined) {
        if (proc !== undefined) await proc.stop();
        else await stopProcess({ pid: processHandle.pid, exit: processHandle.exit, kill: s => processHandle.kill(s) }, 1000);
        let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          const exit = await Promise.race([processHandle.exit, new Promise<never>((_, reject) => { cleanupTimer = setTimeout(() => reject(new Error('cleanup exit not confirmed')), 5000); })]);
          record.cleanup = { confirmedExit: true, exit, signals: [...signals], at: new Date().toISOString() };
        } finally { if (cleanupTimer !== undefined) clearTimeout(cleanupTimer); }
      }
      results.push(record);
      writeFileSync(fileURLToPath(new URL('adapter-native-smoke.json', import.meta.url)), JSON.stringify({ timeoutMs, sequential: true, cwd, results, native }, null, 2) + '\n');
    }
  }
  process.stdout.write(JSON.stringify({ passed: true, results }) + '\n');
}
main().catch(err => { process.stderr.write(String(err?.stack ?? err) + '\n'); process.exitCode = 1; });
