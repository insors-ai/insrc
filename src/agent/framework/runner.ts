/**
 * Core agent runner — step-based state machine with checkpointing.
 *
 * runAgent() drives an AgentDefinition through its steps, persisting state
 * after each step for crash recovery and resume.
 */

import { createHash } from 'node:crypto';
import {
  createRunDir, resolveRunDir, writeCheckpoint, readCheckpoint,
  writeMeta, appendEvent, acquireLock, releaseLock, updateIndex,
  cleanOrphanedTmp, readArtifact,
} from './checkpoint.js';
import { generateRunId, createMessage, buildStepContext } from './helpers.js';
import type {
  AgentDefinition, AgentState, AgentStep, StepResult, Checkpoint, Channel,
  RunOptions, RunResult, RunMeta, RunIndexEntry, CompletedStep,
  DonePayload, ErrorPayload, CheckpointPayload, CancelPayload,
} from './types.js';
import type { AgentConfig, LLMProvider } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Runner options
// ---------------------------------------------------------------------------

export interface RunnerOpts {
  definition: AgentDefinition;
  channel:    Channel;
  options:    RunOptions;
  config:     AgentConfig;
  providers:  { local: LLMProvider; claude: LLMProvider | null };
  /** Optional RPC function for daemon IPC. */
  rpcFn?:     (<T>(method: string, params?: unknown) => Promise<T>) | undefined;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AgentCancelledError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Agent run cancelled');
    this.name = 'AgentCancelledError';
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function runAgent(opts: RunnerOpts): Promise<RunResult> {
  const { definition, channel, options, config, providers, rpcFn } = opts;

  // -----------------------------------------------------------------------
  // Initialise or resume
  // -----------------------------------------------------------------------

  let runId: string;
  let runDir: string;
  let state: AgentState;
  let stepName: string;
  let stepIndex: number;
  let completedSteps: CompletedStep[];
  let resumed = false;
  const createdAt = new Date().toISOString();

  if (options.resumeFrom) {
    // Resume from checkpoint
    const cp = options.resumeFrom;
    runId = cp.runId;
    runDir = resolveRunDir(runId);
    cleanOrphanedTmp(runDir);

    // Version migration
    if (cp.version !== definition.version) {
      if (!definition.migrate) {
        throw new Error(
          `Checkpoint version ${cp.version} != definition version ${definition.version} and no migrate() provided`,
        );
      }
      state = definition.migrate(cp.state, cp.version);
    } else {
      state = cp.state;
    }

    // Artifact validation — roll back to first step with missing artifacts
    const validatedSteps = validateArtifacts(definition, cp, runDir);
    completedSteps = validatedSteps;
    if (validatedSteps.length < cp.completedSteps.length) {
      // Rolled back — restart from the step that had missing artifacts
      const rollbackStep = cp.completedSteps[validatedSteps.length];
      stepName = rollbackStep!.name;
      stepIndex = validatedSteps.length;
    } else {
      stepName = cp.stepName;
      stepIndex = cp.stepIndex;
    }

    resumed = true;
  } else {
    // Fresh run
    runId = generateRunId();
    runDir = createRunDir(runId);
    state = definition.initialState(options.input);
    stepName = definition.firstStep;
    stepIndex = 0;
    completedSteps = [];

    // Write metadata
    const meta: RunMeta = {
      agentId: definition.id,
      version: definition.version,
      repo: options.repo ?? '',
      createdAt,
      inputHash: hashInput(options.input),
    };
    writeMeta(runDir, meta);
  }

  // -----------------------------------------------------------------------
  // Lock
  // -----------------------------------------------------------------------

  if (!acquireLock(runDir)) {
    throw new Error(`Run ${runId} is locked by another process`);
  }

  // -----------------------------------------------------------------------
  // Abort controller + cancel listener
  // -----------------------------------------------------------------------

  const abortController = new AbortController();

  channel.onMessage((msg) => {
    if (msg.kind === 'cancel') {
      const payload = msg.payload as CancelPayload;
      abortController.abort(payload.reason ?? 'cancelled');
    }
  });

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  const { writeHeartbeat } = await import('./checkpoint.js');
  writeHeartbeat(runDir);
  const heartbeatTimer = setInterval(() => {
    writeHeartbeat(runDir);
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  // -----------------------------------------------------------------------
  // Build StepContext
  // -----------------------------------------------------------------------

  const ctx = buildStepContext({
    channel,
    runId,
    agentId: definition.id,
    runDir,
    config,
    providers,
    abortController,
    rpcFn,
  });

  // -----------------------------------------------------------------------
  // Update index → running
  // -----------------------------------------------------------------------

  const indexEntry: RunIndexEntry = {
    runId,
    agentId: definition.id,
    repo: options.repo ?? '',
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
  updateIndex(indexEntry);

  // -----------------------------------------------------------------------
  // Step loop
  // -----------------------------------------------------------------------

  let currentStep: string | null = stepName;

  try {
    while (currentStep !== null) {
      // Check abort
      if (abortController.signal.aborted) {
        throw new AgentCancelledError(
          abortController.signal.reason as string | undefined,
        );
      }

      const step: AgentStep | undefined = definition.steps[currentStep];
      if (!step) {
        throw new Error(`Unknown step "${currentStep}" in agent "${definition.id}"`);
      }

      // Emit progress
      ctx.progress(`Step: ${currentStep}`, undefined);

      const stepStart = Date.now();

      // Execute step
      appendEvent(runDir, { kind: 'step_start', step: currentStep, stepIndex });
      const result: StepResult = await step.run(state, ctx);
      const durationMs = Date.now() - stepStart;

      // Update state
      state = result.state;
      completedSteps.push({
        name: currentStep,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      // Checkpoint
      const checkpoint: Checkpoint = {
        runId,
        agentId: definition.id,
        version: definition.version,
        stepName: result.next ?? currentStep,
        stepIndex: stepIndex + 1,
        state,
        status: 'running',
        pid: process.pid,
        heartbeat: new Date().toISOString(),
        createdAt: resumed ? options.resumeFrom!.createdAt : createdAt,
        completedSteps,
      };
      writeCheckpoint(runDir, checkpoint);

      appendEvent(runDir, {
        kind: 'step_end',
        step: currentStep,
        stepIndex,
        durationMs,
        next: result.next,
      });

      // Send checkpoint message
      const cpPayload: CheckpointPayload = { stepIndex, label: currentStep };
      channel.send(createMessage(definition.id, runId, 'checkpoint', cpPayload));

      // Update index
      indexEntry.updatedAt = new Date().toISOString();
      updateIndex(indexEntry);

      // Advance
      currentStep = result.next;
      stepIndex++;
    }

    // -------------------------------------------------------------------
    // Success
    // -------------------------------------------------------------------

    const summary = `Agent "${definition.id}" completed in ${stepIndex} steps`;
    const donePayload: DonePayload = { result: state, summary };
    channel.send(createMessage(definition.id, runId, 'done', donePayload));

    // Final checkpoint with completed status
    const finalCheckpoint: Checkpoint = {
      runId,
      agentId: definition.id,
      version: definition.version,
      stepName: 'done',
      stepIndex,
      state,
      status: 'completed',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: resumed ? options.resumeFrom!.createdAt : createdAt,
      completedSteps,
    };
    writeCheckpoint(runDir, finalCheckpoint);

    indexEntry.status = 'completed';
    indexEntry.updatedAt = new Date().toISOString();
    updateIndex(indexEntry);

    channel.close();

    return {
      runId,
      result: state,
      summary,
      steps: stepIndex,
      resumed,
    };
  } catch (err) {
    // -----------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------

    const isCancelled = err instanceof AgentCancelledError;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Write error checkpoint
    const errorCheckpoint: Checkpoint = {
      runId,
      agentId: definition.id,
      version: definition.version,
      stepName: currentStep ?? 'unknown',
      stepIndex,
      state,
      status: isCancelled ? 'paused' : 'failed',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: resumed ? options.resumeFrom!.createdAt : createdAt,
      completedSteps,
    };
    writeCheckpoint(runDir, errorCheckpoint);

    indexEntry.status = isCancelled ? 'paused' : 'failed';
    indexEntry.updatedAt = new Date().toISOString();
    updateIndex(indexEntry);

    const errPayload: ErrorPayload = {
      error: errorMsg,
      recoverable: isCancelled,
    };
    channel.send(createMessage(definition.id, runId, 'error', errPayload));

    appendEvent(runDir, {
      kind: 'error',
      step: currentStep,
      stepIndex,
      error: errorMsg,
      cancelled: isCancelled,
    });

    channel.close();

    throw err;
  } finally {
    clearInterval(heartbeatTimer);
    releaseLock(runDir);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash the input for deduplication / idempotency. */
function hashInput(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(input ?? ''))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Validate artifacts for all completed steps.
 * Returns the prefix of completedSteps that have valid artifacts.
 * If a step's artifacts are missing, the returned array is truncated before that step.
 */
function validateArtifacts(
  definition: AgentDefinition,
  checkpoint: Checkpoint,
  runDir: string,
): CompletedStep[] {
  const validated: CompletedStep[] = [];

  for (const completed of checkpoint.completedSteps) {
    const step = definition.steps[completed.name];
    if (!step?.artifacts) {
      validated.push(completed);
      continue;
    }

    const expected = step.artifacts(checkpoint.state);
    const allPresent = expected.every(name => readArtifact(runDir, name) !== null);

    if (!allPresent) {
      // Missing artifact — truncate here
      break;
    }
    validated.push(completed);
  }

  return validated;
}
