/**
 * Agent framework — barrel export.
 *
 * Public API for building and running step-based agents.
 */

// Types
export type {
  AgentMessage, Channel, AgentState, AgentStep, StepResult, StepContext,
  GateOpts, GateAction, GatePayload, ReplyPayload, EmitPayload,
  ProgressPayload, CheckpointPayload, DonePayload, ErrorPayload,
  CancelPayload, AgentDefinition, RunStatus, Checkpoint, CompletedStep,
  RunMeta, RunIndexEntry, RunOptions, RunResult,
} from './types.js';

// Runner
export { runAgent, AgentCancelledError } from './runner.js';
export type { RunnerOpts } from './runner.js';

// Channels
export { ReplChannel } from './channel.js';
export type { ReplChannelOpts } from './channel.js';
export { TestChannel } from './test-channel.js';
export type { ScriptedReply } from './test-channel.js';

// Checkpoint persistence
export {
  resolveRunDir, createRunDir,
  writeCheckpoint, readCheckpoint,
  writeHeartbeat, readHeartbeat,
  writeMeta, readMeta,
  appendEvent,
  writeArtifact, readArtifact,
  readIndex, updateIndex, removeFromIndex,
  acquireLock, releaseLock,
  deleteRun, pruneCompleted, detectCrashes,
  atomicWriteSync, cleanOrphanedTmp,
} from './checkpoint.js';

// Helpers
export { generateRunId, createMessage, buildStepContext } from './helpers.js';
export type { StepContextOpts } from './helpers.js';
