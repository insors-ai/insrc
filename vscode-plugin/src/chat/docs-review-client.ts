/**
 * Story E20260925edb76e2e:S007 / t2 — the daemon-backed DocsReviewClient.
 *
 * The VS-Code-free boundary that maps the docs-review pane's needs onto the
 * daemon's review IPCs: `pending()` -> `workflow.pending`, `content()` ->
 * `workflow.artifactContent`, and (Story E202610138d4b90c9:S001) `decide()` ->
 * `workflow.reviewDecision`, the one call that records approve, reject or
 * feedback together with the reviewer's comments. It acts only on daemon-tracked
 * artifacts (k5) and there is no cloud path (k2). Each call normalizes the daemon's
 * structured `{ error }` arm into a thrown Error the host catches and renders as
 * an inline "unavailable" note — never a silent empty result. Mirrors
 * createDaemonConfigGateway; constructed in extension.ts from the shared client.
 *
 * Type-only vscode-free; the sole runtime dep is the shared IPC client.
 */

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { PendingArtifact } from '../../../src/workflow/pending.js';
import type { ArtifactReviewView } from '../../../src/workflow/artifact-content.js';
import type { ReviewDecisionComment, ReviewDecisionOutcome, ReviewDecisionResult } from '../../../src/workflow/review-decision.js';
import type { FeedbackDecision } from '../../../src/workflow/artifacts/provenance/types.js';
import type { DocsArtifactSummary } from './protocol.js';

/** One pending artifact's reviewable body, adapted from the daemon's ArtifactReviewView. */
export interface DocsContent {
  readonly markdown: string;
  readonly openQuestions: readonly string[];
  readonly blocked: boolean;
  // sc1 (Epic build-vs-code-plugin-ui-integration, S001/t2) — the artifact's
  // STRUCTURED body records, carried through from ArtifactReviewView UNCHANGED:
  // no reshaping, no validation, no defaulting. s1 consumes none of them; they
  // are mirrored here so s2 (functional commitments), s3 (diagrams) and s4 (UX
  // mocks) never have to reopen this file. Each type is INDEXED off the daemon
  // view rather than restated, so the two shapes cannot drift.
  readonly functionalDefinition?: ArtifactReviewView['functionalDefinition'];
  readonly erDefinition?: ArtifactReviewView['erDefinition'];
  readonly sequenceDefinition?: ArtifactReviewView['sequenceDefinition'];
  readonly uxDefinition?: ArtifactReviewView['uxDefinition'];
  readonly companions?: ArtifactReviewView['companions'];
  // Story E202610138d4b90c9:S001: what the pane saves and shows comments with,
  // forwarded unchanged on the same terms. Each is an absent key when the daemon
  // sent none (a daemon older than the plugin).
  readonly docPath?: ArtifactReviewView['docPath'];
  readonly contentVersion?: ArtifactReviewView['contentVersion'];
  readonly feedback?: ArtifactReviewView['feedback'];
  readonly reviewer?: ArtifactReviewView['reviewer'];
  readonly state?: ArtifactReviewView['state'];
}

/** The button the reviewer pressed. */
export type ReviewDecision = FeedbackDecision;
export type { ReviewDecisionComment, ReviewDecisionOutcome, ReviewDecisionResult };

/** The vscode-free client the docs-review host drives over the shared daemon IPC. */
export interface DocsReviewClient {
  /** All daemon-tracked pending artifacts, mapped to the sc3 summary shape. */
  pending(): Promise<DocsArtifactSummary[]>;
  /**
   * One artifact's verbatim rendered body + open questions + block state. The arg is the
   * artifact's id (the sc3 summary drops mdPath, so the client resolves the .md path the
   * daemon needs from the id->mdPath map pending() retained; a raw path is accepted too).
   */
  content(idOrPath: string): Promise<DocsContent>;
  /**
   * Record one review decision with its comments, in one daemon call. `mdPath` is the
   * repo-relative path of the artifact's .md, taken from the content's docPath: a path
   * only, never an id (so it works for a document that is no longer pending). An approval
   * the review gate withheld is not an error: it comes back as outcome 'withheld'.
   */
  decide(mdPath: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<ReviewDecisionResult>;
}

export interface DocsReviewClientOptions {
  /** The repository the pane reviews: the workspace folder. */
  readonly repo?: (() => string | undefined) | undefined;
}

/** The `{ error }` arm every daemon review IPC may return in place of a result. */
interface DaemonError {
  readonly error: string;
}

function isError(v: unknown): v is DaemonError {
  return typeof v === 'object' && v !== null && typeof (v as { error?: unknown }).error === 'string';
}

/**
 * Build the DocsReviewClient over the shared daemon client. Every method throws
 * on the daemon's structured `{ error }` arm (repo unresolved / unreadable store
 * / path guard) or a socket rejection, so the host renders "unavailable" rather
 * than a blank pane. A review-blocked artifact is NOT an error — decide()
 * surfaces it as outcome 'withheld' with the reason, which the host relays.
 */
export function createDocsReviewClient(client: IpcClient, opts: DocsReviewClientOptions = {}): DocsReviewClient {
  // Every call names the repository, so the pane does not depend on the daemon having a
  // default one (a daemon started outside the IDE has none). Absent when no folder is open:
  // the daemon then answers with its own "repo is required" error, which the pane shows.
  const where = (): { repo?: string } => {
    const repo = opts.repo?.();
    return typeof repo === 'string' && repo !== '' ? { repo } : {};
  };
  // id -> mdPath, retained across pending() so content() can resolve the .md
  // path the daemon requires from the artifactId the host holds (k5, daemon-tracked only).
  const mdPathById = new Map<string, string>();
  const resolvePath = (idOrPath: string): string => mdPathById.get(idOrPath) ?? idOrPath;

  return {
    async pending(): Promise<DocsArtifactSummary[]> {
      const res = await client.rpc<{ artifacts: readonly PendingArtifact[] } | DaemonError>(
        'workflow.pending',
        where(),
      );
      if (isError(res)) throw new Error(res.error);
      mdPathById.clear();
      // Skip an empty mdPath (deriveMdPath's "unresolvable" sentinel) so resolvePath's `??`
      // fallback fires instead of sending an empty string the daemon would reject.
      for (const a of res.artifacts) if (a.mdPath) mdPathById.set(a.artifactId, a.mdPath);
      return res.artifacts.map((a): DocsArtifactSummary => ({
        id: a.artifactId,
        kind: a.kind,
        title: a.title,
        status: a.state,
        ...(typeof a.openQuestionCount === 'number' ? { openQuestions: a.openQuestionCount } : {}),
        ...(typeof a.workItemId === 'string' && a.workItemId !== '' ? { workItemId: a.workItemId } : {}),
      }));
    },

    async content(idOrPath: string): Promise<DocsContent> {
      const res = await client.rpc<ArtifactReviewView | DaemonError>(
        'workflow.artifactContent',
        { ...where(), mdPath: resolvePath(idOrPath) },
      );
      if (isError(res)) throw new Error(res.error);
      return {
        markdown: res.renderedMarkdown,
        openQuestions: res.openQuestions.map((q) => q.text),
        blocked: !res.approvable,
        // Strict pass-through (t2): each record is forwarded byte-identical, and an
        // absent one stays an ABSENT KEY rather than a key holding undefined, so a
        // consumer's `=== undefined` check behaves the same on both sides of the IPC.
        ...(res.functionalDefinition !== undefined ? { functionalDefinition: res.functionalDefinition } : {}),
        ...(res.erDefinition !== undefined ? { erDefinition: res.erDefinition } : {}),
        ...(res.sequenceDefinition !== undefined ? { sequenceDefinition: res.sequenceDefinition } : {}),
        ...(res.uxDefinition !== undefined ? { uxDefinition: res.uxDefinition } : {}),
        ...(res.companions !== undefined ? { companions: res.companions } : {}),
        ...(res.docPath !== undefined ? { docPath: res.docPath } : {}),
        ...(res.contentVersion !== undefined ? { contentVersion: res.contentVersion } : {}),
        ...(res.feedback !== undefined ? { feedback: res.feedback } : {}),
        ...(res.reviewer !== undefined ? { reviewer: res.reviewer } : {}),
        ...(res.state !== undefined ? { state: res.state } : {}),
      };
    },

    async decide(mdPath: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<ReviewDecisionResult> {
      // The path as given: the id map is not consulted, so a document that is no
      // longer in the pending list can still be sent feedback.
      const res = await client.rpc<ReviewDecisionResult | DaemonError>(
        'workflow.reviewDecision',
        { ...where(), mdPath, decision, comments: [...comments] },
      );
      if (isError(res)) throw new Error(res.error);
      return res;
    },
  };
}
