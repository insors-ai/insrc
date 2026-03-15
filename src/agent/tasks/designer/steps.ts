/**
 * Designer agent steps — thin orchestration wrappers around existing pure functions.
 *
 * Each step reads from DesignerState, calls the existing LLM functions,
 * and returns updated state + next step name.
 *
 * The LLM logic lives in requirements.ts, sketch.ts, detail.ts, assembly.ts, context.ts.
 */

import type { AgentStep, StepContext, StepResult } from '../../framework/types.js';
import type { DesignerState } from './agent-state.js';
import type { DesignerInput, RequirementTodo, ParsedRequirement } from './types.js';
import {
  extractRequirements,
  enhanceRequirements,
  reExtractWithFeedback,
  parseRequirementsList,
  formatRequirementsList,
} from './requirements.js';
import { writeSketch, reviewSketch, reSketchWithFeedback, formatSketch } from './sketch.js';
import { writeDetail, reDetailWithFeedback } from './detail.js';
import { assembleDocument } from './assembly.js';
import { assertDaemonReachable } from '../../tools/context-provider.js';
import { loadConfigContext } from '../shared/config-context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Helper: reconstruct DesignerInput from state
// ---------------------------------------------------------------------------

function toDesignerInput(s: DesignerState): DesignerInput {
  return {
    message: s.input.message,
    codeContext: s.input.codeContext,
    template: s.input.template,
    intent: s.input.intent,
    requirementsDoc: s.input.requirementsDoc,
    session: {
      repoPath: s.input.repoPath,
      closureRepos: s.input.closureRepos,
    },
  };
}

// ---------------------------------------------------------------------------
// Step: extract-requirements
// ---------------------------------------------------------------------------

export const extractRequirementsStep: AgentStep<DesignerState> = {
  name: 'extract-requirements',
  async run(state, ctx) {
    ctx.progress('Checking daemon availability...');
    await assertDaemonReachable();
    ctx.progress('Daemon reachable — codebase analysis available.');

    const input = toDesignerInput(state);

    // Load config context (conventions, feedback, templates)
    let configContext = await loadConfigContext(ctx, 'designer', 'all', state.input.repoPath);

    // Search for designer-specific feedback from prior sessions
    if (ctx.searchConfig) {
      try {
        const designerFeedback = await ctx.searchConfig({
          query: 'designer sketch detail requirements quality feedback',
          namespace: ['designer', 'common'],
          category: 'feedback',
          limit: 3,
          boostProject: true,
        });
        if (designerFeedback.length > 0) {
          const feedbackText = designerFeedback.map(f => f.entry.body).join('\n');
          configContext = configContext
            ? `${configContext}\n\n### Designer Learnings\n${feedbackText}`
            : `## Designer Learnings\n${feedbackText}`;
        }
      } catch { /* config search unavailable */ }
    }

    ctx.progress('Extracting requirements...');
    const rawList = await extractRequirements(input, ctx.providers.resolve('designer', 'extract'), configContext);

    ctx.progress('Enhancing requirements...');
    const claude = ctx.providers.resolveOrNull('designer', 'enhance');
    if (!claude) throw new Error('Claude provider required for requirements enhancement');
    const enhancedList = await enhanceRequirements(rawList, input, claude, configContext);

    return {
      state: {
        ...state,
        rawRequirements: rawList,
        enhancedRequirements: enhancedList,
        configContext: configContext || undefined,
      },
      next: 'validate-requirements',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: validate-requirements
// ---------------------------------------------------------------------------

export const validateRequirementsStep: AgentStep<DesignerState> = {
  name: 'validate-requirements',
  async run(state, ctx) {
    const reply = await ctx.gate({
      stage: 'requirements',
      title: 'Requirements Validation',
      content: state.enhancedRequirements,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>' },
        { name: 'reject', label: 'Reject', hint: '<reason>' },
      ],
    });

    if (reply.action === 'approve') {
      return { state, next: 'parse-requirements' };
    }

    if (reply.action === 'reject') {
      // Record feedback about rejected requirements
      if (ctx.recordFeedback && reply.feedback) {
        ctx.recordFeedback({
          content: `User rejected requirements: ${reply.feedback}`,
          namespace: 'designer',
          language: 'all',
          repoPath: state.input.repoPath,
          provider: ctx.providers.local,
        }).catch(() => {});
      }
      // Re-extract from scratch with rejection reason as guidance
      const input = toDesignerInput(state);
      const augmented: DesignerInput = {
        ...input,
        message: `${input.message}\n\nAdditional guidance: ${reply.feedback ?? 'Start over with a different approach.'}`,
      };
      ctx.progress('Requirements rejected. Re-extracting...');
      const rawList = await extractRequirements(augmented, ctx.providers.resolve('designer', 'extract'));
      const claude = ctx.providers.resolveOrNull('designer', 'enhance');
      if (!claude) throw new Error('Claude provider required');
      const enhancedList = await enhanceRequirements(rawList, augmented, claude);

      return {
        state: {
          ...state,
          rawRequirements: rawList,
          enhancedRequirements: enhancedList,
          editRounds: { ...state.editRounds, requirements: 0 },
        },
        next: 'validate-requirements',
      };
    }

    // Edit
    if (ctx.recordFeedback && reply.feedback) {
      ctx.recordFeedback({
        content: `User edited requirements: ${reply.feedback}`,
        namespace: 'designer',
        language: 'all',
        repoPath: state.input.repoPath,
        provider: ctx.providers.local,
      }).catch(() => {});
    }
    const key = 'requirements';
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_EDIT_ROUNDS) {
      ctx.progress(`Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding.`);
      return { state, next: 'parse-requirements' };
    }

    ctx.progress(`Re-extracting with feedback (round ${rounds}/${MAX_EDIT_ROUNDS})...`);
    const claude = ctx.providers.resolveOrNull('designer', 'enhance');
    if (!claude) throw new Error('Claude provider required');
    const enhancedList = await reExtractWithFeedback(
      state.enhancedRequirements, reply.feedback ?? '', toDesignerInput(state), claude, state.configContext,
    );

    return {
      state: {
        ...state,
        enhancedRequirements: enhancedList,
        editRounds: { ...state.editRounds, [key]: rounds },
      },
      next: 'validate-requirements',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: parse-requirements
// ---------------------------------------------------------------------------

export const parseRequirementsStep: AgentStep<DesignerState> = {
  name: 'parse-requirements',
  async run(state, ctx) {
    const parsed = parseRequirementsList(state.enhancedRequirements);

    if (parsed.length === 0) {
      ctx.progress('Warning: could not parse structured requirements. Using raw list.');
      // Write a fallback artifact and finish
      ctx.writeArtifact('requirements.md', state.enhancedRequirements);
      return {
        state: {
          ...state,
          parsedRequirements: [],
          todos: [],
          assembledOutput: `# Design Document\n\n## Requirements\n\n${state.enhancedRequirements}`,
          summary: 'Requirements extracted but could not be parsed into structured format.',
        },
        next: null,
      };
    }

    const clarifications = parsed.filter(r => r.type === 'clarification');
    const actionable = parsed.filter(r => r.type !== 'clarification');

    const todos: RequirementTodo[] = actionable.map(r => ({
      index: r.index,
      statement: r.statement,
      type: r.type,
      references: r.references,
      state: 'pending' as const,
    }));

    if (clarifications.length > 0) {
      ctx.progress(`${clarifications.length} clarification(s) noted (skipped for design):`);
      for (const c of clarifications) {
        ctx.progress(`  ? ${c.statement.slice(0, 100)}`);
      }
    }

    ctx.progress(`${todos.length} requirements → starting per-requirement design...`);
    ctx.writeArtifact('requirements.md', state.enhancedRequirements);

    return {
      state: { ...state, parsedRequirements: parsed, todos, currentTodoIndex: 0 },
      next: 'pick-next-requirement',
    };
  },
  artifacts: () => ['requirements.md'],
};

// ---------------------------------------------------------------------------
// Step: pick-next-requirement
// ---------------------------------------------------------------------------

export const pickNextRequirementStep: AgentStep<DesignerState> = {
  name: 'pick-next-requirement',
  async run(state, ctx) {
    // Find next pending todo
    const nextIdx = state.todos.findIndex(t => t.state === 'pending');

    if (nextIdx < 0) {
      ctx.progress('All requirements processed. Assembling document...');
      return { state, next: 'assemble' };
    }

    const todo = state.todos[nextIdx]!;
    ctx.progress(
      `Requirement ${todo.index}/${state.todos.length}: ${todo.statement.slice(0, 70)}${todo.statement.length > 70 ? '...' : ''}`,
    );

    return {
      state: { ...state, currentTodoIndex: nextIdx },
      next: 'sketch',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: sketch
// ---------------------------------------------------------------------------

export const sketchStep: AgentStep<DesignerState> = {
  name: 'sketch',
  async run(state, ctx) {
    const idx = state.currentTodoIndex;
    const todo = state.todos[idx]!;
    const input = toDesignerInput(state);

    // Mark as sketching
    const updatedTodos = [...state.todos];
    updatedTodos[idx] = { ...todo, state: 'sketching' as const };

    ctx.progress(`${todo.index}: Writing sketch...`);
    let sketch = await writeSketch(todo, state.parsedRequirements, updatedTodos, input, ctx.providers.resolve('designer', 'sketch'), state.configContext);

    ctx.progress(`${todo.index}: Reviewing sketch...`);
    const claude = ctx.providers.resolveOrNull('designer', 'review');
    if (!claude) throw new Error('Claude provider required for sketch review');
    sketch = await reviewSketch(sketch, todo, state.parsedRequirements, input, claude, state.configContext);

    // Update todo with sketch
    updatedTodos[idx] = { ...updatedTodos[idx]!, state: 'sketch-reviewing' as const, sketch };

    // Write sketch artifact
    const artifactName = `sketch-${todo.index}.md`;
    ctx.writeArtifact(artifactName, formatSketch(sketch));

    return {
      state: { ...state, todos: updatedTodos },
      next: 'validate-sketch',
    };
  },
  artifacts: (state) => {
    const todo = state.todos[state.currentTodoIndex];
    return todo ? [`sketch-${(todo as RequirementTodo).index}.md`] : [];
  },
};

// ---------------------------------------------------------------------------
// Step: validate-sketch
// ---------------------------------------------------------------------------

export const validateSketchStep: AgentStep<DesignerState> = {
  name: 'validate-sketch',
  async run(state, ctx) {
    const idx = state.currentTodoIndex;
    const todo = state.todos[idx]!;
    const sketch = todo.sketch!;

    const reply = await ctx.gate({
      stage: 'summary-flow',
      title: `Sketch Validation (Requirement ${todo.index})`,
      content: formatSketch(sketch),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>' },
        { name: 'reject', label: 'Reject' },
        { name: 'skip', label: 'Skip this requirement' },
      ],
    });

    if (reply.action === 'approve') {
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'sketch-validated' as const };
      return { state: { ...state, todos: updatedTodos }, next: 'detail' };
    }

    if (reply.action === 'skip') {
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'skipped' as const };
      ctx.progress(`${todo.index}: Skipped.`);
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    if (reply.action === 'reject') {
      if (ctx.recordFeedback && reply.feedback) {
        ctx.recordFeedback({
          content: `User rejected sketch for requirement ${todo.index}: ${reply.feedback}`,
          namespace: 'designer',
          language: 'all',
          repoPath: state.input.repoPath,
          provider: ctx.providers.local,
        }).catch(() => {});
      }
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'skipped' as const };
      ctx.progress(`${todo.index}: Rejected — skipping.`);
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    // Edit
    if (ctx.recordFeedback && reply.feedback) {
      ctx.recordFeedback({
        content: `User edited sketch for requirement ${todo.index}: ${reply.feedback}`,
        namespace: 'designer',
        language: 'all',
        repoPath: state.input.repoPath,
        provider: ctx.providers.local,
      }).catch(() => {});
    }
    const key = `sketch-${todo.index}`;
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_EDIT_ROUNDS) {
      ctx.progress(`${todo.index}: Max edit rounds reached. Proceeding with current sketch.`);
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'sketch-validated' as const };
      return { state: { ...state, todos: updatedTodos }, next: 'detail' };
    }

    ctx.progress(`${todo.index}: Re-sketching with feedback (round ${rounds}/${MAX_EDIT_ROUNDS})...`);
    const claude = ctx.providers.resolveOrNull('designer', 'review');
    if (!claude) throw new Error('Claude provider required');
    const newSketch = await reSketchWithFeedback(
      sketch, reply.feedback ?? '', todo, state.parsedRequirements,
      state.todos, toDesignerInput(state), ctx.providers.resolve('designer', 'sketch'), claude,
      state.configContext,
    );

    const updatedTodos = [...state.todos];
    updatedTodos[idx] = { ...todo, sketch: newSketch };
    ctx.writeArtifact(`sketch-${todo.index}.md`, formatSketch(newSketch));

    return {
      state: {
        ...state,
        todos: updatedTodos,
        editRounds: { ...state.editRounds, [key]: rounds },
      },
      next: 'validate-sketch',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: detail
// ---------------------------------------------------------------------------

export const detailStep: AgentStep<DesignerState> = {
  name: 'detail',
  async run(state, ctx) {
    const idx = state.currentTodoIndex;
    const todo = state.todos[idx]!;
    const input = toDesignerInput(state);

    const updatedTodos = [...state.todos];
    updatedTodos[idx] = { ...todo, state: 'detailing' as const };

    ctx.progress(`${todo.index}: Writing detailed section...`);
    const detail = await writeDetail(todo, updatedTodos, input, ctx.providers.resolve('designer', 'detail'), state.configContext);

    updatedTodos[idx] = { ...updatedTodos[idx]!, detail };

    const artifactName = `detail-${todo.index}.md`;
    ctx.writeArtifact(artifactName, detail);

    return {
      state: { ...state, todos: updatedTodos },
      next: 'validate-detail',
    };
  },
  artifacts: (state) => {
    const todo = state.todos[state.currentTodoIndex];
    return todo ? [`detail-${(todo as RequirementTodo).index}.md`] : [];
  },
};

// ---------------------------------------------------------------------------
// Step: validate-detail
// ---------------------------------------------------------------------------

export const validateDetailStep: AgentStep<DesignerState> = {
  name: 'validate-detail',
  async run(state, ctx) {
    const idx = state.currentTodoIndex;
    const todo = state.todos[idx]!;

    const reply = await ctx.gate({
      stage: 'detail',
      title: `Detail Validation (Requirement ${todo.index})`,
      content: todo.detail!,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>' },
        { name: 'reject', label: 'Reject', hint: '(go back to sketch)' },
        { name: 'skip', label: 'Skip this requirement' },
      ],
    });

    if (reply.action === 'approve') {
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'done' as const };
      ctx.progress(`${todo.index}: Done.`);
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    if (reply.action === 'skip') {
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'skipped' as const };
      ctx.progress(`${todo.index}: Detail skipped.`);
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    if (reply.action === 'reject') {
      if (ctx.recordFeedback && reply.feedback) {
        ctx.recordFeedback({
          content: `User rejected detail for requirement ${todo.index}: ${reply.feedback}`,
          namespace: 'designer',
          language: 'all',
          repoPath: state.input.repoPath,
          provider: ctx.providers.local,
        }).catch(() => {});
      }
      // Reset to pending — pick-next-requirement will re-select it
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = {
        ...todo,
        state: 'pending' as const,
        sketch: undefined,
        detail: undefined,
      };
      ctx.progress(`${todo.index}: Detail rejected — going back to sketch.`);
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    // Edit
    if (ctx.recordFeedback && reply.feedback) {
      ctx.recordFeedback({
        content: `User edited detail for requirement ${todo.index}: ${reply.feedback}`,
        namespace: 'designer',
        language: 'all',
        repoPath: state.input.repoPath,
        provider: ctx.providers.local,
      }).catch(() => {});
    }
    const key = `detail-${todo.index}`;
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_EDIT_ROUNDS) {
      ctx.progress(`${todo.index}: Max edit rounds reached. Proceeding.`);
      const updatedTodos = [...state.todos];
      updatedTodos[idx] = { ...todo, state: 'done' as const };
      return { state: { ...state, todos: updatedTodos }, next: 'pick-next-requirement' };
    }

    ctx.progress(`${todo.index}: Revising detail with feedback (round ${rounds}/${MAX_EDIT_ROUNDS})...`);
    const claude = ctx.providers.resolveOrNull('designer', 'review');
    if (!claude) throw new Error('Claude provider required');
    const revisedDetail = await reDetailWithFeedback(
      todo.detail!, reply.feedback ?? '', todo, state.todos, toDesignerInput(state),
      ctx.providers.resolve('designer', 'detail'), claude, state.configContext,
    );

    const updatedTodos = [...state.todos];
    updatedTodos[idx] = { ...todo, detail: revisedDetail };
    ctx.writeArtifact(`detail-${todo.index}.md`, revisedDetail);

    return {
      state: {
        ...state,
        todos: updatedTodos,
        editRounds: { ...state.editRounds, [key]: rounds },
      },
      next: 'validate-detail',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: assemble
// ---------------------------------------------------------------------------

export const assembleStep: AgentStep<DesignerState> = {
  name: 'assemble',
  async run(state, ctx) {
    // Record session-level feedback if skip/reject rate is high
    if (ctx.recordFeedback && state.todos.length > 0) {
      const skipped = state.todos.filter(t => t.state === 'skipped').length;
      if (skipped > state.todos.length * 0.5) {
        ctx.recordFeedback({
          content: `High skip/reject rate in designer (${skipped}/${state.todos.length}). Sketches may not match project architecture patterns.`,
          namespace: 'designer',
          language: 'all',
          repoPath: state.input.repoPath,
          provider: ctx.providers.local,
        }).catch(() => {});
      }
    }

    ctx.progress('Assembling final document...');

    // Try resolving a custom template from config store
    let template = state.input.template;
    if (ctx.resolveTemplate && template.format === 'html') {
      try {
        const customCss = await ctx.resolveTemplate({
          namespace: 'designer',
          language: 'all',
          name: 'design-css',
          repoPath: state.input.repoPath,
        });
        if (customCss) {
          template = { ...template, css: customCss.body };
        }
      } catch {
        // Fall back to default template
      }
    }

    const title = deriveTitle(state.input.message);
    const result = assembleDocument(template, title, state.todos);

    const ext = result.format === 'html' ? 'html' : 'md';
    ctx.writeArtifact(`assembled.${ext}`, result.output);

    ctx.emit(result.output);

    return {
      state: {
        ...state,
        assembledOutput: result.output,
        summary: result.summary,
      },
      next: null,
    };
  },
  artifacts: (state) => {
    const ext = state.input.template.format === 'html' ? 'html' : 'md';
    return [`assembled.${ext}`];
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveTitle(message: string): string {
  const firstSentence = message.match(/^[^.!?\n]+/);
  const raw = firstSentence ? firstSentence[0]! : message.slice(0, 80);
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
