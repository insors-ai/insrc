/**
 * Story E20260925edb76e2e:S007 / t2 — the daemon-backed DocsReviewClient.
 *
 * The VS-Code-free boundary that maps the docs-review pane's needs onto the
 * EXISTING daemon review IPCs (built by the JetBrains ide-artifact-review-panel
 * epic): `pending()` -> `workflow.pending`, `content()` -> `workflow.artifactContent`,
 * `approve()` -> `workflow.approve`, `comment()` -> `workflow.resolveComment`.
 * No new daemon capability is introduced (k5 — acts only on daemon-tracked
 * artifacts) and there is no cloud path (k2). Each call normalizes the daemon's
 * structured `{ error }` arm into a thrown Error the host catches and renders as
 * an inline "unavailable" note — never a silent empty result. Mirrors
 * createDaemonConfigGateway; constructed in extension.ts from the shared client.
 *
 * Type-only vscode-free; the sole runtime dep is the shared IPC client.
 */

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { PendingArtifact } from '../../../src/workflow/pending.js';
import type { ArtifactReviewView } from '../../../src/workflow/artifact-content.js';
import type { WorkflowApproveResult } from '../../../src/workflow/gates.js';
import type { DocsArtifactSummary } from './protocol.js';

/** One pending artifact's reviewable body, adapted from the daemon's ArtifactReviewView. */
export interface DocsContent {
  readonly markdown: string;
  readonly openQuestions: readonly string[];
  readonly blocked: boolean;
}

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
  /** Approve the artifact (the daemon's flow); a blocked one comes back in skipped[]. */
  approve(idOrPath: string): Promise<WorkflowApproveResult>;
  /** Record a review note; the artifact stays pending (the request-changes path). */
  comment(artifactId: string, note: string): Promise<void>;
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
 * than a blank pane. A review-blocked artifact is NOT an error — approve()
 * surfaces it non-lossily in the WorkflowApproveResult.skipped[] the host relays.
 */
export function createDocsReviewClient(client: IpcClient): DocsReviewClient {
  // id -> mdPath, retained across pending() so content()/approve() can resolve the .md
  // path the daemon requires from the artifactId the host holds (k5, daemon-tracked only).
  const mdPathById = new Map<string, string>();
  const resolvePath = (idOrPath: string): string => mdPathById.get(idOrPath) ?? idOrPath;

  return {
    async pending(): Promise<DocsArtifactSummary[]> {
      const res = await client.rpc<{ artifacts: readonly PendingArtifact[] } | DaemonError>(
        'workflow.pending',
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
      }));
    },

    async content(idOrPath: string): Promise<DocsContent> {
      const res = await client.rpc<ArtifactReviewView | DaemonError>(
        'workflow.artifactContent',
        { mdPath: resolvePath(idOrPath) },
      );
      if (isError(res)) throw new Error(res.error);
      return {
        markdown: res.renderedMarkdown,
        openQuestions: res.openQuestions.map((q) => q.text),
        blocked: !res.approvable,
      };
    },

    async approve(idOrPath: string): Promise<WorkflowApproveResult> {
      const res = await client.rpc<WorkflowApproveResult | DaemonError>(
        'workflow.approve',
        { artifactPath: resolvePath(idOrPath) },
      );
      if (isError(res)) throw new Error(res.error);
      return res;
    },

    async comment(artifactId: string, note: string): Promise<void> {
      const res = await client.rpc<{ recorded: number } | DaemonError>(
        'workflow.resolveComment',
        {
          artifactId,
          comments: [{ id: `c-${Date.now()}`, anchor: {}, body: note }],
        },
      );
      if (isError(res)) throw new Error(res.error);
    },
  };
}
