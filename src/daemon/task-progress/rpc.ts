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
      return { snapshot, schedule: 'native', disposition: coordinator.disposition(snapshot.task, input.cursor, snapshot.cursor) };
    },
    'progress.detach': async (params, context) => {
      (await runtime()).access.detach(decode(observer, params).observerId, context);
      return { stopped: true };
    },
  };
  return { rpc, streams: {
    'progress.subscribe': async (params, send, signal, context) => {
      const input = decode(read, params);
      const { access, coordinator } = await runtime();
      const task = await access.authorize(input.observerId, 'observe', context);
      const watch = latestChange(task, coordinator, signal);
      let cursor = input.cursor;
      try {
        while (!signal.aborted) {
          await watch.wait();
          if (signal.aborted) break;
          const snapshot = await access.read(input.observerId, context);
          const changed = coordinator.disposition(snapshot.task, cursor, snapshot.cursor);
          cursor = snapshot.cursor;
          if (coordinator.isTerminal(task)) {
            send({ id: 0, stream: 'done', data: { snapshot, disposition: changed, schedule: 'stopped' } });
            break;
          }
          if (changed !== 'unchanged') send({ id: 0, stream: 'progress', data: { snapshot, disposition: changed, schedule: 'native' } });
        }
      } finally {
        watch.close();
      }
    },
  } };
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
