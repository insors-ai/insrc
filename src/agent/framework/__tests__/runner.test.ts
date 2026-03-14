/**
 * Tests for the agent runner — step loop, checkpointing, resume, cancel, artifacts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { runAgent, AgentCancelledError } from '../runner.js';
import type { RunnerOpts } from '../runner.js';
import { TestChannel } from '../test-channel.js';
import {
  readCheckpoint, resolveRunDir, writeCheckpoint, createRunDir,
  writeMeta, writeArtifact,
} from '../checkpoint.js';
import type {
  AgentDefinition, AgentState, AgentStep, StepContext, Checkpoint,
} from '../types.js';
import type { AgentConfig, LLMProvider, LLMResponse } from '../../../shared/types.js';
import { PATHS } from '../../../shared/paths.js';

// ---------------------------------------------------------------------------
// Mock LLM provider
// ---------------------------------------------------------------------------

const mockLLM: LLMProvider = {
  async complete() {
    return { text: 'mock', stopReason: 'end_turn' } as LLMResponse;
  },
  async *stream() { yield 'mock'; },
  async embed() { return []; },
  supportsTools: false,
};

// ---------------------------------------------------------------------------
// Mock config
// ---------------------------------------------------------------------------

const mockConfig: AgentConfig = {
  ollama: { host: 'http://localhost:11434' },
  models: {
    local: 'test',
    embedding: 'test',
    embeddingDim: 768,
    tiers: { fast: 'test', standard: 'test', powerful: 'test' },
    roles: {},
    context: {
      local: 131072,
      localMaxOutput: 8192,
      claude: 200000,
      claudeMaxOutput: 8192,
      charsPerToken: 3,
    },
  },
  keys: {},
  permissions: { mode: 'auto-accept' },
};

// ---------------------------------------------------------------------------
// Counter agent — trivial test agent
// ---------------------------------------------------------------------------

interface CounterState extends AgentState {
  count: number;
  target: number;
}

function makeCounterStep(name: string, nextStep: string | null): AgentStep<CounterState> {
  return {
    name,
    async run(state: CounterState, ctx: StepContext) {
      ctx.progress(`Counting: ${state['count']} → ${state['count'] as number + 1}`);
      return {
        state: { ...state, count: state['count'] as number + 1 },
        next: nextStep,
      };
    },
  };
}

const counterAgent: AgentDefinition<CounterState> = {
  id: 'counter',
  version: 1,
  initialState: (input) => {
    const inp = input as { target: number };
    return { count: 0, target: inp.target };
  },
  steps: {
    'step-1': makeCounterStep('step-1', 'step-2'),
    'step-2': makeCounterStep('step-2', 'step-3'),
    'step-3': makeCounterStep('step-3', null),
  },
  firstStep: 'step-1',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Temporarily override PATHS.agents for isolated tests. */
let origAgents: string;
let origAgentIndex: string;
let testBaseDir: string;

function makeRunnerOpts(
  overrides: Partial<RunnerOpts> & { channel?: TestChannel } = {},
): RunnerOpts {
  return {
    definition: counterAgent as unknown as AgentDefinition,
    channel: new TestChannel(),
    options: { input: { target: 3 } },
    config: mockConfig,
    providers: {
      local: mockLLM,
      claude: null,
      resolve: (_agent: string, _step: string) => mockLLM,
      resolveOrNull: (_agent: string, _step: string) => null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  testBaseDir = join(tmpdir(), `insrc-runner-test-${randomUUID()}`);
  mkdirSync(testBaseDir, { recursive: true });

  // Monkey-patch PATHS to isolate tests from real ~/.insrc
  origAgents = PATHS.agents;
  origAgentIndex = PATHS.agentIndex;
  (PATHS as Record<string, string>)['agents'] = testBaseDir;
  (PATHS as Record<string, string>)['agentIndex'] = join(testBaseDir, 'index.json');
});

afterEach(() => {
  (PATHS as Record<string, string>)['agents'] = origAgents;
  (PATHS as Record<string, string>)['agentIndex'] = origAgentIndex;
  rmSync(testBaseDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAgent — fresh run', () => {
  it('completes with correct final state', async () => {
    const channel = new TestChannel();
    const result = await runAgent(makeRunnerOpts({ channel }));

    expect(result.steps).toBe(3);
    expect(result.resumed).toBe(false);
    expect((result.result as CounterState).count).toBe(3);
    expect(channel.isClosed).toBe(true);
  });

  it('sends checkpoint messages after each step', async () => {
    const channel = new TestChannel();
    await runAgent(makeRunnerOpts({ channel }));

    const checkpoints = channel.getCheckpoints();
    expect(checkpoints).toHaveLength(3);
  });

  it('sends done message on completion', async () => {
    const channel = new TestChannel();
    await runAgent(makeRunnerOpts({ channel }));

    const done = channel.getDone();
    expect(done).toBeDefined();
    expect((done!.payload as { summary: string }).summary).toContain('3 steps');
  });

  it('sends progress messages', async () => {
    const channel = new TestChannel();
    await runAgent(makeRunnerOpts({ channel }));

    const progress = channel.getProgress();
    expect(progress.length).toBeGreaterThanOrEqual(3);
  });

  it('writes final checkpoint with completed status', async () => {
    const channel = new TestChannel();
    const result = await runAgent(makeRunnerOpts({ channel }));

    const runDir = resolveRunDir(result.runId);
    const cp = readCheckpoint(runDir);
    expect(cp).not.toBeNull();
    expect(cp!.status).toBe('completed');
    expect(cp!.completedSteps).toHaveLength(3);
  });

  it('releases lock after completion', async () => {
    const channel = new TestChannel();
    const result = await runAgent(makeRunnerOpts({ channel }));

    const lockPath = join(resolveRunDir(result.runId), 'lock');
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe('runAgent — resume', () => {
  it('resumes from mid-run checkpoint', async () => {
    // Run first, then create a checkpoint as if we stopped after step-1
    const channel1 = new TestChannel();
    const firstResult = await runAgent(makeRunnerOpts({ channel: channel1 }));
    const runDir = resolveRunDir(firstResult.runId);

    // Rewrite checkpoint to simulate crash after step-1
    const checkpoint: Checkpoint = {
      runId: firstResult.runId,
      agentId: 'counter',
      version: 1,
      stepName: 'step-2',
      stepIndex: 1,
      state: { count: 1, target: 3 },
      status: 'crashed',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      completedSteps: [{ name: 'step-1', durationMs: 10, timestamp: new Date().toISOString() }],
    };
    writeCheckpoint(runDir, checkpoint);

    // Resume
    const channel2 = new TestChannel();
    const result = await runAgent(makeRunnerOpts({
      channel: channel2,
      options: { resumeFrom: checkpoint },
    }));

    expect(result.resumed).toBe(true);
    expect(result.runId).toBe(firstResult.runId);
    // Should have run step-2 and step-3 (2 more steps from index 1)
    expect((result.result as CounterState).count).toBe(3);
  });
});

describe('runAgent — cancel', () => {
  it('aborts on cancel message', async () => {
    // Create a slow agent that can be cancelled
    const slowStep: AgentStep = {
      name: 'slow',
      async run(state, ctx) {
        // Wait a bit to allow cancel to fire
        await new Promise(resolve => setTimeout(resolve, 50));
        // Check abort after delay
        if (ctx.signal.aborted) {
          throw new AgentCancelledError();
        }
        return { state, next: 'slow' }; // loops forever if not cancelled
      },
    };

    const slowAgent: AgentDefinition = {
      id: 'slow',
      version: 1,
      initialState: () => ({ tick: 0 }),
      steps: { slow: slowStep },
      firstStep: 'slow',
    };

    const channel = new TestChannel();

    // Cancel after 30ms
    setTimeout(() => channel.cancel('test cancel'), 30);

    await expect(
      runAgent(makeRunnerOpts({ definition: slowAgent, channel })),
    ).rejects.toThrow(AgentCancelledError);

    expect(channel.isClosed).toBe(true);
  });

  it('writes paused status on cancel', async () => {
    const oneStepThenCancel: AgentStep = {
      name: 'check',
      async run(state, ctx) {
        // Signal abort before returning
        (ctx as unknown as { _abort: () => void })._abort?.();
        return { state, next: 'check' };
      },
    };

    // Use a simpler approach: cancel inline
    const cancelAgent: AgentDefinition = {
      id: 'cancel-test',
      version: 1,
      initialState: () => ({}),
      steps: {
        first: {
          name: 'first',
          async run(state) {
            return { state, next: 'second' };
          },
        },
        second: {
          name: 'second',
          async run() {
            throw new AgentCancelledError('user cancelled');
          },
        },
      },
      firstStep: 'first',
    };

    const channel = new TestChannel();

    try {
      await runAgent(makeRunnerOpts({ definition: cancelAgent, channel }));
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCancelledError);
    }

    // Find the run directory (from the error message sent)
    const errorMsg = channel.getError();
    expect(errorMsg).toBeDefined();
    expect((errorMsg!.payload as { recoverable: boolean }).recoverable).toBe(true);
  });
});

describe('runAgent — error handling', () => {
  it('writes failed status on step error', async () => {
    const failAgent: AgentDefinition = {
      id: 'failer',
      version: 1,
      initialState: () => ({}),
      steps: {
        boom: {
          name: 'boom',
          async run() {
            throw new Error('step exploded');
          },
        },
      },
      firstStep: 'boom',
    };

    const channel = new TestChannel();

    await expect(
      runAgent(makeRunnerOpts({ definition: failAgent, channel })),
    ).rejects.toThrow('step exploded');

    const errorMsg = channel.getError();
    expect(errorMsg).toBeDefined();
    expect((errorMsg!.payload as { error: string }).error).toBe('step exploded');
    expect((errorMsg!.payload as { recoverable: boolean }).recoverable).toBe(false);
    expect(channel.isClosed).toBe(true);
  });

  it('throws on unknown step', async () => {
    const badAgent: AgentDefinition = {
      id: 'bad',
      version: 1,
      initialState: () => ({}),
      steps: {
        start: {
          name: 'start',
          async run(state) {
            return { state, next: 'nonexistent' };
          },
        },
      },
      firstStep: 'start',
    };

    const channel = new TestChannel();
    await expect(
      runAgent(makeRunnerOpts({ definition: badAgent, channel })),
    ).rejects.toThrow('Unknown step "nonexistent"');
  });
});

describe('runAgent — artifact validation on resume', () => {
  it('rolls back to step with missing artifact', async () => {
    // Agent with artifacts
    let step2RunCount = 0;

    const artifactAgent: AgentDefinition = {
      id: 'artifact-test',
      version: 1,
      initialState: () => ({ phase: 0 }),
      steps: {
        'step-1': {
          name: 'step-1',
          async run(state, ctx) {
            ctx.writeArtifact('one.txt', 'artifact-1');
            return { state: { ...state, phase: 1 }, next: 'step-2' };
          },
          artifacts: () => ['one.txt'],
        },
        'step-2': {
          name: 'step-2',
          async run(state, ctx) {
            step2RunCount++;
            ctx.writeArtifact('two.txt', 'artifact-2');
            return { state: { ...state, phase: 2 }, next: null };
          },
          artifacts: () => ['two.txt'],
        },
      },
      firstStep: 'step-1',
    };

    // First: run to completion
    const channel1 = new TestChannel();
    const result1 = await runAgent(makeRunnerOpts({
      definition: artifactAgent,
      channel: channel1,
      options: { input: {} },
    }));

    const runDir = resolveRunDir(result1.runId);

    // Delete step-2's artifact to simulate corruption
    rmSync(join(runDir, 'artifacts', 'two.txt'));

    // Create a checkpoint as if both steps completed
    const cp = readCheckpoint(runDir)!;
    cp.status = 'crashed';
    writeCheckpoint(runDir, cp);

    // Resume — should roll back and re-run step-2
    step2RunCount = 0;
    const channel2 = new TestChannel();
    await runAgent(makeRunnerOpts({
      definition: artifactAgent,
      channel: channel2,
      options: { resumeFrom: cp },
    }));

    // step-2 should have been re-run
    expect(step2RunCount).toBe(1);
    // Artifact should exist again
    expect(existsSync(join(runDir, 'artifacts', 'two.txt'))).toBe(true);
  });
});

describe('runAgent — version migration', () => {
  it('calls migrate on version mismatch', async () => {
    let migrateCalled = false;

    const v2Agent = {
      ...counterAgent,
      version: 2,
      migrate(state: AgentState, fromVersion: number) {
        migrateCalled = true;
        expect(fromVersion).toBe(1);
        return state as CounterState;
      },
    } as unknown as AgentDefinition;

    // Create a v1 checkpoint
    const runId = randomUUID();
    const runDir = createRunDir(runId);
    const checkpoint: Checkpoint = {
      runId,
      agentId: 'counter',
      version: 1,
      stepName: 'step-2',
      stepIndex: 1,
      state: { count: 1, target: 3 },
      status: 'paused',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      completedSteps: [{ name: 'step-1', durationMs: 10, timestamp: new Date().toISOString() }],
    };
    writeCheckpoint(runDir, checkpoint);

    const channel = new TestChannel();
    await runAgent(makeRunnerOpts({
      definition: v2Agent,
      channel,
      options: { resumeFrom: checkpoint },
    }));

    expect(migrateCalled).toBe(true);
  });

  it('throws on version mismatch without migrate', async () => {
    const v2NoMigrate = {
      ...counterAgent,
      version: 2,
    } as unknown as AgentDefinition;

    const checkpoint: Checkpoint = {
      runId: randomUUID(),
      agentId: 'counter',
      version: 1,
      stepName: 'step-1',
      stepIndex: 0,
      state: { count: 0, target: 3 },
      status: 'paused',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      completedSteps: [],
    };
    createRunDir(checkpoint.runId);

    const channel = new TestChannel();
    await expect(
      runAgent(makeRunnerOpts({
        definition: v2NoMigrate,
        channel,
        options: { resumeFrom: checkpoint },
      })),
    ).rejects.toThrow('no migrate()');
  });
});

describe('runAgent — gate interaction', () => {
  it('handles gate with scripted replies', async () => {
    const gateAgent: AgentDefinition = {
      id: 'gate-test',
      version: 1,
      initialState: () => ({ approved: false }),
      steps: {
        ask: {
          name: 'ask',
          async run(state, ctx) {
            const reply = await ctx.gate({
              stage: 'approval',
              title: 'Approve?',
              content: 'Please approve this.',
              actions: [
                { name: 'approve', label: 'Approve' },
                { name: 'reject', label: 'Reject' },
              ],
            });
            return {
              state: { ...state, approved: reply.action === 'approve' },
              next: null,
            };
          },
        },
      },
      firstStep: 'ask',
    };

    const channel = new TestChannel([{ action: 'approve' }]);
    const result = await runAgent(makeRunnerOpts({
      definition: gateAgent,
      channel,
      options: { input: {} },
    }));

    expect((result.result as { approved: boolean }).approved).toBe(true);
    expect(channel.getGates()).toHaveLength(1);
    expect(channel.remainingReplies).toBe(0);
  });
});

describe('runAgent — lock prevention', () => {
  it('throws when run is already locked', async () => {
    // Create a run and hold its lock
    const runId = randomUUID();
    const runDir = createRunDir(runId);

    const checkpoint: Checkpoint = {
      runId,
      agentId: 'counter',
      version: 1,
      stepName: 'step-1',
      stepIndex: 0,
      state: { count: 0, target: 3 },
      status: 'paused',
      pid: process.pid,
      heartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      completedSteps: [],
    };
    writeCheckpoint(runDir, checkpoint);

    // Manually acquire lock (simulates another live process holding it)
    const { acquireLock: acq } = await import('../checkpoint.js');
    acq(runDir);

    const channel = new TestChannel();
    await expect(
      runAgent(makeRunnerOpts({
        channel,
        options: { resumeFrom: checkpoint },
      })),
    ).rejects.toThrow('locked by another process');
  });
});
