import { _setRunAnalyzeForTest, runStart as runAnalysis } from '../../../analyze-rpc.js';
import { directDispatch } from '../../../server.js';
import type { RpcHandlers } from '../../../server.js';
import { _setWorkflowDriverForTests, runStart as runWorkflow } from '../../../workflow-rpc.js';

export function controlledExecutors(wait: () => Promise<void>) {
  const calls = { workflow: 0, analysis: 0 };
  const complete = async (kind: keyof typeof calls) => {
    calls[kind]++;
    await wait();
  };
  _setWorkflowDriverForTests(async (_intent, _provider, opts) => {
    opts.onProgress?.({ phase: 'decompose' });
    opts.onToken?.('plan', 'first chunk');
    await complete('workflow');
    opts.onProgress?.({ phase: 'done' });
    return { path: '/workflow-result', runId: 'workflow-result', model: 'fixture', artifact: {} };
  });
  _setRunAnalyzeForTest(async (args, opts) => {
    const intent = { target: 'docs', scope: 'XS', focused: false, scopeRef: args.scopeRef, reasoning: 'fixture' } as const;
    opts?.onEvent?.({ type: 'stage-started', stage: 'classify' });
    opts?.onEvent?.({ type: 'classified', intent });
    opts?.onEvent?.({ type: 'stage-started', stage: 'plan' });
    await complete('analysis');
    return { ok: true, runId: args.runId, intent, finalReport: { summary: 'fixture' }, tasksCompleted: 0, tasksFailed: [], durationMs: 1 };
  });
  return {
    calls,
    dispatch(rpc: RpcHandlers) {
      return directDispatch(rpc, {
        'workflow.run': (params, send, signal, context) => runWorkflow(params, send, signal, context?.executorProgressPort),
        'analyze.run.start': (params, send, signal, context) =>
          runAnalysis(params, send, signal, context?.connectionExecution, context?.executorProgressPort),
      });
    },
    reset() {
      _setWorkflowDriverForTests();
      _setRunAnalyzeForTest();
    },
  };
}
