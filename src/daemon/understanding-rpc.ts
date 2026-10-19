import { Type } from '@sinclair/typebox';
import { AssessmentError, CommandSchema, DeleteSchema, ListSchema, OverrideSchema, PageSchema,
  PrepareSchema, ReadSchema, WatchSchema, parse } from '../shared/understanding.js';
import type { AssessmentResult, AssessmentScope, AssessmentView } from '../shared/understanding.js';
import { getGraphStore } from '../db/graph/store.js';
import { readAssessment } from '../understanding/storage.js';
import type { UnderstandingService, Owner } from '../understanding/service.js';
import type { RpcHandlers, StreamHandlers } from './server.js';

interface Dependencies {
  service(): UnderstandingService;
  owner(repo: string): Promise<Owner>;
  capture?: (repo: string, worktree: string, owner: Owner) => Promise<AssessmentScope>;
}
const OverrideCommand = Type.Object({ ...CommandSchema.properties, intent: OverrideSchema }, { additionalProperties: false });
function failure(error: unknown): Extract<AssessmentResult<never>, { ok: false }> {
  const e = error instanceof AssessmentError ? error : new AssessmentError('storage-failure');
  return { protocolVersion: 1, ok: false, error: { code: e.code, retryable: ['unavailable', 'storage-failure'].includes(e.code), message: e.code },
    ...(e.current ? { current: e.current } : {}) };
}

export function createUnderstandingRoutes(deps: Dependencies): { rpc: RpcHandlers; streams: StreamHandlers; stop(): void; watchCount(): number } {
  let stopping = false;
  const active = new Set<() => void>();
  const service = (): UnderstandingService => { if (stopping) throw new AssessmentError('unavailable'); return deps.service(); };
  async function ownerFor(id: string): Promise<Owner> {
    service();
    const record = readAssessment(await getGraphStore(), id);
    if (!record) throw new AssessmentError('not-found');
    return deps.owner(record.view.scope.repoId);
  }
  const result = (fn: (input: unknown) => Promise<unknown>) => async (input: unknown): Promise<unknown> => {
    try { service(); return { protocolVersion: 1, ok: true, value: await fn(input) }; }
    catch (error) { return failure(error); }
  };
  const mutation = (fn: (input: unknown) => Promise<{ view: AssessmentView; appliedRevision: number }>) => async (input: unknown): Promise<unknown> => {
    try { service(); const value = await fn(input); return { protocolVersion: 1, ok: true, value: value.view, appliedRevision: value.appliedRevision }; }
    catch (error) { return failure(error); }
  };
  const rpc: RpcHandlers = {
    'understanding.prepare': mutation(async input => {
      const p = parse(PrepareSchema, input);
      const owner = await deps.owner(p.repoPath);
      if (!deps.capture) throw new AssessmentError('unavailable');
      const scope = await deps.capture(p.repoPath, p.worktreePath, owner);
      return service().prepare(owner, scope, p.requestId);
    }),
    'understanding.resume': result(async input => { const p = parse(ReadSchema, input); return service().resume(await ownerFor(p.assessmentId), p.assessmentId); }),
    'understanding.list': result(async input => {
      const p = parse(ListSchema, input);
      return service().list(await deps.owner(p.repoPath), p.repoPath, p.limit, p.after);
    }),
    'understanding.history': result(async input => { const p = parse(PageSchema, input); return service().history(await ownerFor(p.assessmentId), p.assessmentId, p.limit, p.after); }),
    'understanding.cancel': mutation(async input => { const p = parse(CommandSchema, input); return service().cancel(await ownerFor(p.assessmentId), p); }),
    'understanding.delete': result(async input => { const p = parse(DeleteSchema, input); await service().delete(await ownerFor(p.assessmentId), p); return { deleted: true }; }),
    'understanding.requestOverride': result(async input => { const p = parse(OverrideCommand, input); return service().requestOverride(await ownerFor(p.assessmentId), p); }),
  };
  const streams: StreamHandlers = {
    'understanding.watch': async (input, send, signal) => {
      let closed = false;
      let unsubscribe = (): void => {};
      let resolveDone = (): void => {};
      let assessmentId = '';
      let revision = 0;
      let chain = Promise.resolve();
      const done = new Promise<void>(resolve => { resolveDone = resolve; });
      const close = (reason?: 'deleted' | 'unavailable'): void => {
        if (closed) return;
        closed = true;
        unsubscribe();
        active.delete(stop);
        if (reason && !signal.aborted) {
          send({ id: 0, stream: 'progress', data: { protocolVersion: 1, type: reason, assessmentId } });
          send({ id: 0, stream: 'done', data: { protocolVersion: 1, reason } });
        }
        resolveDone();
      };
      const stop = (): void => close('unavailable');
      const abort = (): void => close();
      const fatal = (error: unknown): void => {
        if (closed || signal.aborted) { close(); return; }
        const e = failure(error).error;
        send({ id: 0, stream: 'error', data: { protocolVersion: 1, code: e.code, error: e.message, recoverable: e.retryable } });
        close();
      };
      let timer: ReturnType<typeof setInterval> | undefined;
      try {
        service();
        const p = parse(WatchSchema, input);
        assessmentId = p.assessmentId;
        const owner = await ownerFor(assessmentId);
        const refresh = (): void => {
          chain = chain.then(async () => {
            if (closed || signal.aborted) return;
            try {
              const currentOwner = await ownerFor(assessmentId);
              if (currentOwner.ownerPrincipal !== owner.ownerPrincipal || currentOwner.learner.key !== owner.learner.key) { close('unavailable'); return; }
              const view = await service().resume(currentOwner, assessmentId);
              if (!closed && !signal.aborted && view.revision > revision) {
                revision = view.revision;
                send({ id: 0, stream: 'progress', data: { protocolVersion: 1, type: 'snapshot', assessmentId, revision, view } });
              }
            } catch (error) { if (error instanceof AssessmentError && error.code === 'not-found') close('unavailable'); else fatal(error); }
          }).catch(fatal);
        };
        unsubscribe = await service().subscribe(owner, assessmentId, deleted => { if (deleted) close('deleted'); else refresh(); });
        if (closed || signal.aborted) { unsubscribe(); close(); return; }
        active.add(stop);
        signal.addEventListener('abort', abort, { once: true });
        refresh();
        timer = setInterval(refresh, 30_000);
        timer.unref();
        await done;
      } catch (error) { fatal(error); }
      finally { if (timer) clearInterval(timer); unsubscribe(); active.delete(stop); signal.removeEventListener('abort', abort); closed = true; }
    },
  };
  return { rpc, streams, stop: () => { stopping = true; for (const stop of [...active]) stop(); }, watchCount: () => active.size };
}
