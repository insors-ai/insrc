import { createServer } from 'node:net';
import { once } from 'node:events';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { setGraphStorePath, getGraphStore } from '../../../db/graph/store.js';
import { UnderstandingService } from '../../service.js';
import { AttemptSchema } from '../../../shared/understanding.js';
import type { AnswerAttempt, AssessmentScope } from '../../../shared/understanding.js';
export const owner = { ownerPrincipal: 'test-owner', learner: { key: 'test-learner', source: 'git' as const, authority: 'git-email', subject: 'test-subject', assurance: 'local-config' as const, aliases: [] } };
export const scope: AssessmentScope = { repoId: 'test-repo', worktreeId: 'test-worktree', baseOid: null, stagedTreeOid: 'a'.repeat(40), commitMode: 'normal', parentOids: [], learnerKey: owner.learner.key, policyRevision: 'p', evidenceRevision: 'e' };

if (process.send) {
  const dir = process.argv[2]!;
  const assessmentScope = { ...scope, repoId: dir, worktreeId: dir };
  setGraphStorePath(join(dir, 'graph.lmdb'));
  await getGraphStore();
  const socket = createServer();
  socket.listen(join(dir, 'daemon.sock'));
  await once(socket, 'listening');
  const service = await UnderstandingService.open(join(dir, 'daemon.sock'));
  const id = (await service.prepare(owner, assessmentScope, randomUUID())).view.id;
  service.register('answer', AttemptSchema, (_r, value) => ({ state: 'answering', attempt: value as AnswerAttempt }));
  const attempts: AnswerAttempt[] = [];
  for (const sequence of [1, 2]) {
    const attempt: AnswerAttempt = { id: randomUUID(), assessmentId: id, sequence, questionId: 'q', conceptId: 'c',
      answer: `answer-${sequence}`, confidence: sequence === 1 ? 'unsure' : 'medium', assisted: sequence === 2,
      guidanceRefs: sequence === 2 ? ['guide'] : [], submittedAt: new Date().toISOString() };
    await service.mutate(owner, { requestId: randomUUID(), assessmentId: id, expectedRevision: sequence, scope: assessmentScope }, 'answer', attempt);
    attempts.push(attempt);
  }
  const associations = ['task-one', 'task-two'].map(itemId => ({ itemId, parentIds: ['story'], state: 'learner-proposed' as const, evidenceRefs: ['patch'], confidence: 'tentative' as const, explanation: 'Proposed by the learner' }));
  service.register('start-job', Type.Null(), r => ({ state: 'evaluating', associations, job: { id: randomUUID(), kind: 'grade',
    inputRevision: r.view.revision, generation: r.lifecycleGeneration, status: 'running' } }));
  await service.mutate(owner, { requestId: randomUUID(), assessmentId: id, expectedRevision: 3, scope: assessmentScope }, 'start-job', null);
  process.send({ id, attempts, associations, scope: assessmentScope, hostId: service.hostId });
}
