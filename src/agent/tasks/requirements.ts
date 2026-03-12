// ---------------------------------------------------------------------------
// DEPRECATED — use src/agent/tasks/designer/ instead.
//
// This module is kept for backward compatibility. The designer pipeline
// replaces the old two-stage requirements flow with an iterative,
// user-validated workflow.
// ---------------------------------------------------------------------------

import type { LLMProvider } from '../../shared/types.js';

export interface RequirementsResult {
  sketch: string;
  enhanced: string;
  tag: string;
}

/**
 * @deprecated Use runDesignerPipeline with intent='requirements' instead.
 * Retained for backward compatibility — runs the designer in auto-approve mode.
 */
export async function runRequirementsPipeline(
  userMessage: string,
  codeContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
): Promise<RequirementsResult> {
  const { runDesignerPipeline, ValidationChannel, resolveTemplate } = await import('./designer/index.js');

  const template = resolveTemplate({ format: 'markdown' });
  const channel = new ValidationChannel();
  let output = '';

  for await (const event of runDesignerPipeline(
    {
      message: userMessage,
      codeContext,
      template,
      intent: 'requirements',
      session: { repoPath: process.cwd(), closureRepos: [process.cwd()] },
    },
    localProvider,
    claudeProvider,
    channel,
    { autoApprove: true },
  )) {
    if (event.kind === 'done') {
      output = event.result.output;
    }
  }

  return {
    sketch: '',
    enhanced: output,
    tag: '[requirements]',
  };
}
