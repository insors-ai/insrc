import type { LLMProvider } from '../../../shared/types.js';

// ---------------------------------------------------------------------------
// Designer Agent — Type Definitions
//
// All types are local to the designer module. Only DesignerResult and
// DesignerEvent are exported for REPL integration.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Design Templates
// ---------------------------------------------------------------------------

export interface DesignTemplate {
  /** Template identifier */
  id: string;
  /** Output format */
  format: 'markdown' | 'html';
  /** Document skeleton with named slots */
  skeleton: string;
  /** Section definitions — order and heading text */
  sections: Array<{
    id: string;
    heading: string;
    /** Prompt hint for this section (injected into LLM prompt) */
    guidance: string;
  }>;
  /** CSS (HTML templates only) */
  css?: string | undefined;
  /** Whether this is a built-in or user-defined template */
  builtin: boolean;
}

// ---------------------------------------------------------------------------
// Designer Input
// ---------------------------------------------------------------------------

export interface SessionRef {
  repoPath: string;
  closureRepos: string[];
}

export interface DesignerInput {
  /** The user's message / design request */
  message: string;
  /** Optional requirements document (file path, L2 content, or raw text) */
  requirementsDoc?: string | undefined;
  /** Assembled code context from orchestrator */
  codeContext: string;
  /** Resolved design template */
  template: DesignTemplate;
  /** Session reference for carry-forward */
  session: SessionRef;
  /** The classified intent that triggered the designer */
  intent: 'requirements' | 'design' | 'review';
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface ParsedRequirement {
  /** 1-based index */
  index: number;
  /** The requirement statement */
  statement: string;
  /** Requirement type — clarifications are open questions, not design targets */
  type: 'functional' | 'system' | 'clarification';
  /** Referenced entities from the requirements extraction */
  references: string[];
}

// ---------------------------------------------------------------------------
// Requirement Todos
// ---------------------------------------------------------------------------

export type RequirementState =
  | 'pending'
  | 'sketching'
  | 'sketch-reviewing'
  | 'sketch-validated'
  | 'detailing'
  | 'detail-reviewing'
  | 'done'
  | 'skipped';

export interface RequirementTodo {
  /** Requirement index (1-based, matching the validated list) */
  index: number;
  /** The requirement statement */
  statement: string;
  /** Requirement type — clarifications are skipped during design */
  type: 'functional' | 'system' | 'clarification';
  /** Referenced entities from the requirements extraction */
  references: string[];
  /** Current state */
  state: RequirementState;
  /** Sketch output (populated after sketch step) */
  sketch?: RequirementSketch | undefined;
  /** Detailed section output (populated after detail step) */
  detail?: string | undefined;
}

// ---------------------------------------------------------------------------
// Sketch
// ---------------------------------------------------------------------------

export interface ReusableEntity {
  /** Entity ID or name */
  entity: string;
  /** Which indexed project it's from */
  project: string;
  /** One-line description of how it's relevant */
  relevance: string;
}

export interface ProposedComponent {
  /** Component name */
  name: string;
  /** Entity kind */
  kind: 'function' | 'class' | 'module' | 'interface' | 'type';
  /** Proposed file location */
  file: string;
  /** Purpose description */
  purpose: string;
}

export interface RequirementSketch {
  /** Requirement index */
  index: number;
  /** Existing modules/entities that can be reused */
  reusable: ReusableEntity[];
  /** Proposed new components (if reuse is insufficient) */
  proposed: ProposedComponent[];
  /** Summary implementation flow */
  summaryFlow: string;
  /** Open concerns surfaced during analysis */
  concerns: string[];
}

// ---------------------------------------------------------------------------
// Validation Gates
// ---------------------------------------------------------------------------

export type GateStage = 'requirements' | 'summary-flow' | 'detail';

export interface ValidationGate {
  /** What is being validated */
  stage: GateStage;
  /** The content presented to the user */
  content: string;
  /** Requirement index (for per-requirement gates) */
  requirementIndex?: number | undefined;
}

export interface GateResponse {
  type: 'approve' | 'edit' | 'reject' | 'skip';
  feedback?: string | undefined;
}

// ---------------------------------------------------------------------------
// Designer Events (yielded by the async generator)
// ---------------------------------------------------------------------------

export type DesignerEvent =
  | { kind: 'progress'; message: string }
  | { kind: 'gate'; gate: ValidationGate }
  | { kind: 'done'; result: DesignerResult };

// ---------------------------------------------------------------------------
// Designer Result
// ---------------------------------------------------------------------------

export interface DesignerResult {
  kind: 'document' | 'review';
  /** The assembled design document or review output */
  output: string;
  /** Output format */
  format: 'markdown' | 'html';
  /** Template used */
  templateId: string;
  /** The validated requirements list */
  requirements: Array<{
    index: number;
    statement: string;
    type: 'functional' | 'system' | 'clarification';
    state: 'done' | 'skipped';
  }>;
  /** Per-requirement sketches (for traceability) */
  sketches: RequirementSketch[];
  /** Structured extraction for downstream agents */
  structured: {
    /** New entities proposed across all requirements */
    newEntities: Array<{ name: string; file: string; kind: string }>;
    /** Existing entities reused or modified */
    reusedEntities: Array<{ entity: string; project: string; modification: string }>;
    /** Unresolved decisions requiring user input */
    userDecisions: string[];
  };
  /** L2 tag summary for session carry-forward */
  summary: string;
}

// ---------------------------------------------------------------------------
// Pipeline options
// ---------------------------------------------------------------------------

export interface DesignerPipelineOpts {
  /** Skip all validation gates (auto-approve everything) */
  autoApprove?: boolean | undefined;
  /** Logger function */
  log?: ((msg: string) => void) | undefined;
}
