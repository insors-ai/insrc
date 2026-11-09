import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ProgressId, TaskRefSchema, progressObject } from '../../shared/task-progress.js';
import type { ProgressKind, TaskRef } from '../../shared/task-progress.js';
import type { RpcHandlers, StreamHandlers } from '../server.js';
import type { ProgressAccess } from './access.js';
import type { ProgressCoordinator } from './coordinator.js';

type Details = { readonly kind: ProgressKind };
export interface ProgressRuntime<D extends Details> {
  readonly access: ProgressAccess<D>;
  readonly coordinator: ProgressCoordinator<D>;
  close(): Promise<void>;
}

const repo = Type.String({ minLength: 1, maxLength: 4096 });
const capability = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });
const originOpen = progressObject({ repo });
const originBind = progressObject({ repo, originId: ProgressId, capability });
const originRevoke = progressObject({ originId: ProgressId });
const attach = progressObject({
  task: TaskRefSchema, capability, purpose: Type.Union([Type.Literal('conversation'), Type.Literal('history')]),
});
const observer = progressObject({ observerId: ProgressId });
const read = progressObject({ observerId: ProgressId, cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })) });
const control = progressObject({
  observerId: ProgressId, requestId: ProgressId,
  action: Type.Union([Type.Literal('stop-observation'), Type.Literal('cancel-execution')]),
});

function decode<S extends TSchema>(schema: S, params: unknown): Static<S> {
  if (!Value.Check(schema, params)) throw new Error('invalid-progress-request');
  return params;
}

export function createProgressRoutes<D extends Details>(runtime: () => Promise<ProgressRuntime<D>>): {
  rpc: RpcHandlers; streams: StreamHandlers;
} {
  const rpc: RpcHandlers = {
    'progress.origin.open': async (params, context) => {
      const input = decode(originOpen, params);
      return (await runtime()).access.openOrigin(input.repo, context);
    },
    'progress.origin.bind': async (params, context) => {
      const input = decode(originBind, params);
      await (await runtime()).access.bindOrigin(input.repo, input.originId, input.capability, context);
      return { bound: true };
    },
    'progress.origin.revoke': async (params, context) => {
      await (await runtime()).access.revokeOrigin(decode(originRevoke, params).originId, context);
      return { revoked: true };
    },
    'progress.attach': async (params, context) => {
      const input = decode(attach, params);
      const { access } = await runtime();
      return { observerId: await access.attach(input.task, input.capability, input.purpose, context) };
    },
    'progress.read': async (params, context) => {
      const input = decode(read, params);
      const { access, coordinator } = await runtime();
      const snapshot = await access.read(input.observerId, context);
      return { snapshot, schedule: coordinator.observationClosed(snapshot.task, snapshot.cursor) ? 'stopped' : 'native',
        disposition: coordinator.disposition(snapshot.task, input.cursor, snapshot.cursor) };
    },
    'progress.detach': async (params, context) => {
      (await runtime()).access.detach(decode(observer, params).observerId, context);
      return { stopped: true };
    },
    'progress.control': async (params, context) => {
      const input = decode(control, params);
      return { outcome: await (await runtime()).access.control(input.observerId, input.action, input.requestId, context) };
    },
  };
  return { rpc, streams: {
    'progress.subscribe': async (params, send, signal, context) => {
      const input = decode(read, params);
      const { access, coordinator } = await runtime();
      const subscription = await access.subscribe(input.observerId, context);
      const signalOrStop = AbortSignal.any([signal, subscription.signal]);
      const watch = latestChange(subscription.task, coordinator, signalOrStop);
      let cursor = input.cursor;
      try {
        while (!signalOrStop.aborted) {
          await watch.wait();
          if (signalOrStop.aborted) break;
          let snapshot;
          try { snapshot = await access.read(input.observerId, context); }
          catch (error) {
            if (signalOrStop.aborted) break;
            throw error;
          }
          if (signalOrStop.aborted) break;
          const changed = coordinator.disposition(snapshot.task, cursor, snapshot.cursor);
          cursor = snapshot.cursor;
          if (coordinator.observationClosed(snapshot.task, snapshot.cursor)) {
            send({ id: 0, stream: 'done', data: { snapshot, disposition: changed, schedule: 'stopped' } });
            return;
          }
          if (changed !== 'unchanged') {
            send({ id: 0, stream: 'progress', data: { snapshot, disposition: changed, schedule: 'native' } });
            if (context?.awaitProgressWrite !== undefined &&
                !(await waitForWrite(context.awaitProgressWrite(), signalOrStop)) && !signalOrStop.aborted) return;
          }
        }
        if (subscription.signal.aborted && !signal.aborted) {
          if (subscription.signal.reason === 'revoked') throw new Error('task-unavailable');
          send({ id: 0, stream: 'done', data: { outcome: 'stopped' } });
        }
      } finally {
        watch.close();
        subscription.close();
      }
    },
  } };
}

async function waitForWrite(write: Promise<boolean>, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  let abort!: () => void;
  const cancelled = new Promise<false>(resolve => { abort = () => resolve(false); });
  signal.addEventListener('abort', abort, { once: true });
  try { return await Promise.race([write, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

/** Only one dirty bit is retained, so a lagging consumer rereads the latest authorized snapshot. */
function latestChange<D extends Details>(task: TaskRef, coordinator: ProgressCoordinator<D>, signal: AbortSignal) {
  let dirty = true;
  let wake: (() => void) | undefined;
  const changed = (): void => { dirty = true; wake?.(); };
  const detach = coordinator.onChange(task, changed);
  signal.addEventListener('abort', changed, { once: true });
  return {
    async wait() {
      if (!dirty && !signal.aborted) await new Promise<void>(resolve => { wake = resolve; });
      wake = undefined;
      dirty = false;
    },
    close() {
      detach();
      signal.removeEventListener('abort', changed);
    },
  };
}
