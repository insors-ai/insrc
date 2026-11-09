import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { runVerifiedVibeTurn, VibeTurnError } from '../../../src/shared/vibe-session.js';
import type { VibeCatalogModel, VibeTurnOptions } from '../../../src/shared/vibe-session.js';
import type { SpawnedProcess, SpawnOutput, TurnRequest } from './cli-adapter.js';

type Row = Record<string, unknown>;

function row(value: unknown): Row | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : undefined;
}

/** Translate native history into the same line format used by the chat adapter and its durable reader. */
function historyLines(emit: (line: Row) => void): NonNullable<VibeTurnOptions['onHistory']> {
  const active = new Map<string, 'message' | 'effect'>();
  return (method, params) => {
    if (method === 'history/entryAdded') {
      const entry = row(params['entry']);
      const id = entry?.['id'];
      if (entry === undefined || typeof id !== 'string') return;
      const type = entry['type'];
      if (entry['generationStatus'] === 'in_progress' && active.size >= 128) {
        throw new Error('Vibe sent too many simultaneous history entries');
      }
      if (type === 'message' && entry['role'] === 'assistant') {
        if (entry['generationStatus'] === 'in_progress') active.set(id, type);
        emit({ type, role: 'assistant', content: entry['content'] });
      } else if (type === 'reasoning') {
        emit({ type: 'insrc-vibe-thinking' });
      } else if (type === 'effect') {
        const detail = row(entry['detail']);
        const name = detail?.['toolName'];
        if (typeof name !== 'string') return;
        emit({ type: 'message', role: 'assistant', content: [{ type: 'tool_call', id, name, arguments: detail?.['input'] }] });
        const state = row(entry['state']);
        if (entry['generationStatus'] === 'in_progress') active.set(id, type);
        else emitEffectResult(emit, id, state);
      }
      return;
    }
    const id = params['entryId'];
    if (typeof id !== 'string' || !Array.isArray(params['patch'])) return;
    const type = active.get(id);
    if (type === undefined) return;
    for (const value of params['patch']) {
      const patch = row(value);
      const path = patch?.['path'];
      if (path === '/generationStatus' && patch?.['value'] === 'completed') active.delete(id);
      if (type === 'message' && patch?.['op'] === 'append' && path === '/content/0/text' && typeof patch['value'] === 'string') {
        emit({ type: 'message', role: 'assistant', content: [{ type: 'text', text: patch['value'] }] });
      } else if (type === 'effect' && path === '/state') {
        emitEffectResult(emit, id, row(patch?.['value']));
      }
    }
  };
}

function emitEffectResult(emit: (line: Row) => void, id: string, state: Row | undefined): void {
  const status = state?.['status'];
  if (status !== 'completed' && status !== 'failed' && status !== 'cancelled' && status !== 'skipped') return;
  emit({
    type: 'message',
    role: 'user',
    content: [{
      type: 'tool_result', tool_call_id: id,
      content: state?.['outputText'] || state?.['output'] || row(state?.['error'])?.['message'] || state?.['reason'] || '',
      is_error: status !== 'completed',
    }],
  });
}

export function spawnVerifiedVibeChat(
  command: string,
  request: TurnRequest,
  catalog: readonly VibeCatalogModel[],
  output: SpawnOutput | undefined,
): SpawnedProcess {
  const controller = new AbortController();
  const stream = output === undefined ? new PassThrough() : undefined;
  let pid: number | undefined;
  let cursor = output?.cursor;
  let finished = false;
  let sessionId = request.resume?.nativeSessionId;
  const emit = (row: Row): void => {
    const line = JSON.stringify({ ...row, ...(sessionId !== undefined ? { sessionId } : {}) }) + '\n';
    if (output !== undefined) appendFileSync(output.outPath, line, 'utf8');
    else stream?.write(line);
  };
  const exit = (async () => {
    try {
      const result = await runVerifiedVibeTurn({
        command, cwd: request.cwd, timeoutMs: 600_000, signal: controller.signal,
        agentConfig: {
          cwd: request.cwd,
          headless: true,
          ...(request.readDirs !== undefined ? { workspaceRoots: request.readDirs } : {}),
          ...(request.permissionMode === 'auto' ? { autoApprove: true } : {}),
          ...(request.permissionMode === 'manual' ? { agent: 'ask' } : {}),
          ...(request.permissionMode === 'edit-auto' ? { agent: 'accept-edits' } : {}),
        },
        nativeSessionId: sessionId,
        model: request.model || undefined, effort: request.effort || undefined, catalog,
        prompt: request.prompt,
        onProcess: value => { pid = value; },
        onSession: value => {
          sessionId = value;
          emit({ type: 'insrc-vibe-thinking' });
        },
        onHistory: historyLines(emit),
      });
      emit({
        type: 'insrc-vibe-result',
        ok: result.stopReason === undefined,
        ...(result.stopReason !== undefined ? { replayUnsafe: true, message: `Vibe turn stopped early (${result.stopReason})` } : {}),
      });
      return { code: 0, signal: null };
    } catch (error) {
      const replayUnsafe = error instanceof VibeTurnError && error.dispatchState !== 'not-sent';
      emit({ type: 'insrc-vibe-result', ok: false, replayUnsafe, message: error instanceof Error ? error.message : 'Vibe turn failed' });
      return { code: 1, signal: null };
    } finally {
      finished = true;
      stream?.end();
    }
  })();
  // A failed durable write also rejects exit. The consumer observes that failure;
  // attach a handler now so an early failure cannot become an unhandled rejection.
  void exit.catch(() => {});
  return {
    async *lines() {
      if (output !== undefined) {
        for await (const item of output.tail(output.cursor, () => finished)) {
          cursor = item.cursor;
          yield item.line;
        }
      } else if (stream !== undefined) {
        const reader = createInterface({ input: stream, crlfDelay: Infinity });
        try { yield* reader; } finally { reader.close(); }
      }
    },
    stderr: () => '',
    exit,
    spawnError: Promise.resolve(undefined),
    get pid() { return pid; },
    get cursor() { return cursor; },
    kill: () => controller.abort(),
  };
}
