import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { AnalyzeRunEvent } from '../../analyze/orchestrator/types.js';
import { ProgressId, ProgressSequence, progressObject } from '../../shared/task-progress.js';
import type { ProgressKind } from '../../shared/task-progress.js';
import type { WorkflowProgress } from '../workflow-rpc.js';
import type { ProgressCoordinator } from './coordinator.js';

const workflowStage = Type.Union([
  Type.Literal('decompose'), Type.Literal('plan-ready'), Type.Literal('grounding'),
  Type.Literal('step-start'), Type.Literal('step-done'), Type.Literal('synthesize-attempt'),
  Type.Literal('synthesize-retry'), Type.Literal('correction-round'), Type.Literal('review-skipped'), Type.Literal('done'),
]);
const analysisStage = Type.Union([Type.Literal('classify'), Type.Literal('plan'), Type.Literal('execute')]);
const workflowUnit = Type.String({ maxLength: 128, pattern: '^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$' });
const taskCount = progressObject({
  unit: Type.Literal('tasks'), completed: ProgressSequence, total: ProgressSequence,
});
const WorkflowDetailsSchema = progressObject({
  kind: Type.Literal('workflow'), stageId: workflowStage,
  activeUnit: Type.Union([workflowUnit, Type.Null()]),
  stagePosition: Type.Null(),
  production: Type.Union([
    progressObject({ unit: Type.Literal('output-chunks'), completed: ProgressSequence, total: Type.Null() }),
    Type.Null(),
  ]),
});
const AnalysisDetailsSchema = progressObject({
  kind: Type.Literal('analysis'), stageId: analysisStage,
  activeUnit: Type.Union([ProgressId, Type.Null()]),
  stagePosition: Type.Union([taskCount, Type.Null()]),
  production: Type.Null(),
});
export type WorkflowDetails = Static<typeof WorkflowDetailsSchema>;
export type AnalysisDetails = Static<typeof AnalysisDetailsSchema>;
export type ExecutorDetails = WorkflowDetails | AnalysisDetails;

export function validateExecutorDetails(kind: ProgressKind, value: unknown): value is ExecutorDetails {
  if (kind === 'workflow') return Value.Check(WorkflowDetailsSchema, value);
  return kind === 'analysis' && Value.Check(AnalysisDetailsSchema, value) &&
    (value.activeUnit === null || (value.stageId === 'execute' && value.stagePosition !== null)) &&
    (value.stagePosition === null || (value.stageId === 'execute' && value.stagePosition.completed <= value.stagePosition.total));
}

export function registerExecutorProducers(coordinator: ProgressCoordinator<ExecutorDetails>) {
  return {
    workflow: coordinator.registerProducer<WorkflowDetails>('workflow', detail => detail),
    analysis: coordinator.registerProducer<AnalysisDetails>('analysis', detail => detail),
  };
}

/** Counts callbacks independently of the legacy stream's batching and flush. */
export class WorkflowMeasurements {
  private stage: WorkflowDetails['stageId'] | undefined;
  private activeUnit: string | null = null;
  private chunks = 0;

  onProgress(event: WorkflowProgress): void {
    if (!Value.Check(workflowStage, event.phase)) return;
    this.stage = event.phase;
    this.activeUnit = Value.Check(workflowUnit, event.stepId) ? event.stepId
      : Value.Check(workflowUnit, event.runner) ? event.runner : null;
  }

  onOutputChunk(): void {
    if (this.chunks < Number.MAX_SAFE_INTEGER) this.chunks++;
  }

  read(): WorkflowDetails | null {
    if (this.stage === undefined) return null;
    return {
      kind: 'workflow', stageId: this.stage, activeUnit: this.activeUnit, stagePosition: null,
      production: this.chunks === 0 ? null : { unit: 'output-chunks', completed: this.chunks, total: null },
    };
  }
}

const analysisStages: readonly AnalysisDetails['stageId'][] = ['classify', 'plan', 'execute'];
// Large or malformed plans can still report a stage without retaining task identities.
const maxTrackedTasks = 4096;

export class AnalysisMeasurements {
  private stage: AnalysisDetails['stageId'] | undefined;
  private activeTask: string | null = null;
  private total: number | undefined;
  private readonly settled = new Set<string>();

  onEvent(event: AnalyzeRunEvent): void {
    switch (event.type) {
      case 'stage-started': {
        const position = analysisStages.indexOf(event.stage);
        if (position > (this.stage === undefined ? -1 : analysisStages.indexOf(this.stage))) this.stage = event.stage;
        break;
      }
      case 'plan-accepted':
        if (this.stage === 'plan' && this.total === undefined && Value.Check(ProgressId, event.planId) &&
            Value.Check(ProgressSequence, event.taskCount) && event.taskCount <= maxTrackedTasks) {
          this.total = event.taskCount;
        }
        break;
      case 'task-started':
        if (this.stage === 'execute' && this.total !== undefined && event.parentTaskPath === undefined &&
            event.total === this.total && event.index === this.settled.size + 1 && event.index <= this.total &&
            Value.Check(ProgressId, event.taskId) && this.activeTask === null && !this.settled.has(event.taskId)) {
          this.activeTask = event.taskId;
        }
        break;
      case 'task-completed':
        if (event.parentTaskPath === undefined && this.activeTask !== null && event.taskId === this.activeTask &&
            (event.status === 'ok' || event.status === 'failed' || event.status === 'skipped-dependency-unavailable')) {
          this.settled.add(this.activeTask);
          this.activeTask = null;
        }
        break;
    }
  }

  read(): AnalysisDetails | null {
    if (this.stage === undefined) return null;
    return {
      kind: 'analysis', stageId: this.stage, activeUnit: this.activeTask, production: null,
      stagePosition: this.stage === 'execute' && this.total !== undefined
        ? { unit: 'tasks', completed: this.settled.size, total: this.total } : null,
    };
  }
}
