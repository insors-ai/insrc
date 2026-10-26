/** Isolate real Saved run/plan/task/cache I/O without changing HOME. */
import { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATHS } from '../../../shared/paths.js';
const directory = mkdtempSync(join(tmpdir(), 'cm-root-saved-'));
const original = { analyze: PATHS.analyze, analyzeRun: PATHS.analyzeRun, analyzeRunRecord: PATHS.analyzeRunRecord, analyzeTaskOutput: PATHS.analyzeTaskOutput, analyzeContext: PATHS.analyzeContext, analyzeConstraintRecord: PATHS.analyzeConstraintRecord };
PATHS.analyze = join(directory, 'analyze');
PATHS.analyzeRun = runId => join(directory, 'analyze', runId);
PATHS.analyzeRunRecord = runId => join(directory, 'analyze', runId, 'run.json');
PATHS.analyzeTaskOutput = (runId, taskId) => join(directory, 'analyze', runId, 'tasks', taskId + '.json');
PATHS.analyzeContext = runId => join(directory, 'analyze', runId, 'context');
PATHS.analyzeConstraintRecord = (runId, key) => join(directory, 'analyze', runId, 'constraints', key + '.json');
after(() => { Object.assign(PATHS, original); rmSync(directory, { recursive: true, force: true }); });
