/**
 * Universal Access Gate -- AccessPolicy declaration + session-scoped
 * approval store.
 *
 * Per plans/access-gate.md Phase 1. The store records (kind, key)
 * tuples the user has explicitly or pre-emptively approved for the
 * lifetime of a chat session. The tool executor consults the store
 * before invoking any tool that declares an `access` policy; on miss
 * it fires a generic gate event over the daemon channel and stores
 * the user's reply.
 *
 * Two bucket flavours per kind:
 *   - exact:    one entry per resource. Approval covers exactly that
 *               resource.
 *   - prefix:   one entry per resource-prefix. A query `(kind, key)`
 *               that misses the exact bucket falls through to the
 *               `<kind>-prefix` bucket; if any prefix entry is a
 *               prefix of `key`, the query passes.
 *
 * The store is in-memory only. Sessions are disposable -- the store
 * dies with the session. Persistent (cross-session) approvals are
 * out of scope for v1; see "Out of scope" in the plan.
 *
 * No external dependencies; pure data structure. Used directly by
 * Session and by the executor's gate dispatcher (Phase 2).
 */

// ---------------------------------------------------------------------------
// AccessPolicy -- per-tool declaration
// ---------------------------------------------------------------------------

/**
 * Minimal context the dispatcher passes to AccessPolicy.extractKey.
 * Structural shape so this module stays free of daemon-only imports
 * (Session, Pool, etc.). The dispatcher constructs an instance from
 * the full `ToolExecContext` it has on hand.
 */
export interface AccessPolicyContext {
  /** Active repo path; used by extractKey impls that resolve via the pool. */
  readonly repoPath?: string | undefined;
}

/**
 * Per-tool access declaration. A tool that touches an external
 * resource (DB, filesystem, cloud API, shell, network host) declares
 * an AccessPolicy in its registration; the executor's gate dispatcher
 * consults the AccessStore on every call against that tool and fires
 * a gate UI on approval miss.
 *
 * Tools that read DAEMON-INTERNAL state (db_list_connections,
 * registry queries, config getters) declare NO `access` field --
 * the dispatcher's `if (tool.access)` short-circuits and the call
 * runs ungated. See plans/access-gate.md Q2.
 */
export interface AccessPolicy {
  /**
   * Resource kind. Free-form string with documented conventions
   * (see plans/access-gate.md). Each kind gets its own bucket in
   * the AccessStore. Two tools that touch the same resource share
   * the same kind + key so a single approval covers both. Tool
   * authors may add new subkinds (`aws-s3-object`, `gcp-bucket`)
   * inline.
   */
  readonly kind: string;

  /**
   * Extract the access key(s) from the tool's input.
   *   - `undefined` (or Promise of) => skip the gate for THIS call.
   *     Reserved for inputs that don't yet name a specific resource.
   *   - single `string` => single resource (most common).
   *   - `readonly string[]` => multi-resource batch (e.g. cross-DB
   *     joins). The dispatcher gates every key independently; ALL
   *     must clear before the call runs.
   *
   * May be sync or async. Async is needed by tools whose access
   * kind differs from the surface input shape -- e.g. db_file_*
   * receives a connectionId but its access kind is `'fs-path'`,
   * so extractKey resolves the connection id to the connection's
   * file path via the pool. See "Shared gates across access
   * methods" in plans/access-gate.md.
   */
  extractKey(
    input: Record<string, unknown>,
    ctx: AccessPolicyContext,
  ): string | readonly string[] | undefined
   | Promise<string | readonly string[] | undefined>;

  /**
   * Optional human-readable description of the access being
   * requested. Rendered in the gate prompt body. Falls back to
   * `${tool.id} on ${key}` when omitted.
   */
  describe?(input: Record<string, unknown>): string;

  /**
   * Severity hint for the gate UI. `'standard'` (default) shows a
   * plain confirm; `'destructive'` adds warning chrome AND skips
   * the "previously approved" fast path -- destructive ops fire
   * the gate every call even when the (kind, key) was approved
   * earlier. Used for cloud-resource writes (cloud_aws_rds_stop)
   * and shell-command operations.
   */
  readonly severity?: 'standard' | 'destructive';
}

// ---------------------------------------------------------------------------
// AccessStore -- session-scoped approval state
// ---------------------------------------------------------------------------

export interface AccessApproval {
  readonly kind: string;
  readonly key: string;
  readonly approvedAt: number;
  readonly prefix: boolean;
}

export interface AccessStore {
  /**
   * True if (kind, key) is approved -- either as an exact match in
   * the kind's bucket, or via a matching prefix in the
   * `<kind>-prefix` companion bucket.
   *
   * Lookup is O(N) in the prefix-bucket size for the worst case;
   * exact lookups are O(1). Sessions accumulate tens of approvals
   * in practice, so the constant factor dominates.
   */
  isApproved(kind: string, key: string): boolean;

  /** Add an exact (kind, key) approval. Idempotent. */
  approve(kind: string, key: string): void;

  /**
   * Add a prefix approval -- all keys starting with `prefix` will
   * subsequently pass `isApproved(kind, key)`. Stored under the
   * `<kind>-prefix` companion bucket.
   *
   * For fs-path prefixes the helper auto-appends `/` when the
   * caller didn't include a trailing slash so `/var/log` doesn't
   * accidentally match `/var/log_archive/`. Other kinds preserve
   * the prefix verbatim (e.g. `aws:rds:us-east-1:` is meaningful
   * with the trailing colon).
   */
  approvePrefix(kind: string, prefix: string): void;

  /**
   * Forget an approval. Removes the exact entry; prefix approvals
   * are removed via `revokePrefix`. Mostly for tests; production
   * sessions are disposable.
   */
  revoke(kind: string, key: string): void;

  /** Forget a prefix approval. */
  revokePrefix(kind: string, prefix: string): void;

  /** Snapshot for "show me what's approved this session" UI. */
  list(): readonly AccessApproval[];
}

/**
 * Convention: the prefix companion bucket for a given exact-match
 * kind is `<kind>-prefix`. Tool authors register either kind on
 * the AccessPolicy; the dispatcher / store handle the fall-through.
 *
 * Centralised here so the helpers + the gate dispatcher use the
 * same suffix.
 */
const PREFIX_KIND_SUFFIX = '-prefix';

function prefixKindFor(exactKind: string): string {
  return exactKind.endsWith(PREFIX_KIND_SUFFIX)
    ? exactKind                   // already a prefix kind
    : `${exactKind}${PREFIX_KIND_SUFFIX}`;
}

/**
 * Default in-memory implementation. The Session pool constructs one
 * per session; the executor's gate dispatcher reads/writes through
 * the same instance.
 */
export class DefaultAccessStore implements AccessStore {
  // Map<kind, Map<key, approvedAt-ms>>
  private readonly exact = new Map<string, Map<string, number>>();
  // Map<kind-prefix, Map<prefix, approvedAt-ms>>
  private readonly prefix = new Map<string, Map<string, number>>();

  isApproved(kind: string, key: string): boolean {
    if (this.exact.get(kind)?.has(key)) {
      return true;
    }
    const prefixBucket = this.prefix.get(prefixKindFor(kind));
    if (prefixBucket === undefined || prefixBucket.size === 0) {
      return false;
    }
    for (const prefix of prefixBucket.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  approve(kind: string, key: string): void {
    let bucket = this.exact.get(kind);
    if (bucket === undefined) {
      bucket = new Map<string, number>();
      this.exact.set(kind, bucket);
    }
    if (!bucket.has(key)) {
      bucket.set(key, Date.now());
    }
  }

  approvePrefix(kind: string, prefix: string): void {
    const prefKind = prefixKindFor(kind);
    // Auto-append `/` for fs-path-prefix to avoid `/var/log` matching
    // `/var/log_archive/` accidentally. Other kinds (cloud-resource,
    // network-host) carry their own delimiters in the key shape and
    // don't need this normalisation.
    const normalised = prefKind === 'fs-path-prefix' && !prefix.endsWith('/')
      ? `${prefix}/`
      : prefix;
    let bucket = this.prefix.get(prefKind);
    if (bucket === undefined) {
      bucket = new Map<string, number>();
      this.prefix.set(prefKind, bucket);
    }
    if (!bucket.has(normalised)) {
      bucket.set(normalised, Date.now());
    }
  }

  revoke(kind: string, key: string): void {
    this.exact.get(kind)?.delete(key);
  }

  revokePrefix(kind: string, prefix: string): void {
    this.prefix.get(prefixKindFor(kind))?.delete(prefix);
  }

  list(): readonly AccessApproval[] {
    const out: AccessApproval[] = [];
    for (const [kind, bucket] of this.exact) {
      for (const [key, approvedAt] of bucket) {
        out.push({ kind, key, approvedAt, prefix: false });
      }
    }
    for (const [kind, bucket] of this.prefix) {
      for (const [key, approvedAt] of bucket) {
        out.push({ kind, key, approvedAt, prefix: true });
      }
    }
    out.sort((a, b) => a.approvedAt - b.approvedAt);
    return out;
  }
}

/**
 * Always-allow store. Used by test harnesses that drive `executeTool`
 * directly without wanting to mock the gate plumbing.
 *
 * Production callers should NEVER use this -- the gate dispatcher
 * relies on a real store to fire user prompts.
 */
export class PermissiveAccessStore implements AccessStore {
  isApproved(_kind: string, _key: string): boolean { return true; }
  approve(_kind: string, _key: string): void { /* no-op */ }
  approvePrefix(_kind: string, _prefix: string): void { /* no-op */ }
  revoke(_kind: string, _key: string): void { /* no-op */ }
  revokePrefix(_kind: string, _prefix: string): void { /* no-op */ }
  list(): readonly AccessApproval[] { return []; }
}

// ---------------------------------------------------------------------------
// AccessAuditLog -- chronological log of every gate decision
// ---------------------------------------------------------------------------

/**
 * Outcome of a single gate dispatch. Together with `AccessApproval`,
 * gives the approvals pane (Phase 5.3 of plans/access-gate.md) the
 * full picture: what was approved (current state), AND what was
 * asked / denied along the way (history).
 *
 *   auto-pass        Pre-existing approval; gate skipped silently.
 *   approve          User clicked Approve; exact key approval added.
 *   approve-prefix   User clicked Approve scope; prefix approval added.
 *   deny             User clicked Deny; tool call short-circuited.
 *   auto-deny        Dispatcher had no send/channel/requestId, so the
 *                    fail-closed branch denied without prompting.
 */
export type AccessDecision =
  | 'auto-pass'
  | 'approve'
  | 'approve-prefix'
  | 'deny'
  | 'auto-deny';

export interface AccessAuditEvent {
  /** ms since epoch, captured at dispatch time. */
  readonly timestamp: number;
  /** Canonical tool id (`file_read`, `cloud_aws_ec2_terminate`, ...). */
  readonly toolId: string;
  /** AccessPolicy.kind (`fs-path`, `connection`, `cloud-resource`, ...). */
  readonly kind: string;
  /** Resource key the dispatcher checked. */
  readonly key: string;
  readonly decision: AccessDecision;
  /** Set on `approve-prefix` decisions. */
  readonly prefix?: string | undefined;
  readonly severity: 'standard' | 'destructive';
  /** AccessPolicy.describe(input) when present, for human-readable rendering. */
  readonly description?: string | undefined;
}

/**
 * Append-only chronological log. The Session pool constructs one per
 * session alongside its AccessStore; the dispatcher records every
 * decision through it.
 */
export interface AccessAuditLog {
  record(event: AccessAuditEvent): void;
  /** Snapshot in chronological order. Most-recent last. */
  list(): readonly AccessAuditEvent[];
}

/**
 * Default in-memory implementation. Capped at MAX_EVENTS to bound
 * memory on long-running sessions; over-cap entries roll off the
 * front (oldest first). The cap is generous enough that a typical
 * analysis run keeps every event.
 */
export class DefaultAccessAuditLog implements AccessAuditLog {
  private static readonly MAX_EVENTS = 1000;
  private readonly events: AccessAuditEvent[] = [];

  record(event: AccessAuditEvent): void {
    this.events.push(event);
    const overflow = this.events.length - DefaultAccessAuditLog.MAX_EVENTS;
    if (overflow > 0) {
      this.events.splice(0, overflow);
    }
  }

  list(): readonly AccessAuditEvent[] {
    return this.events.slice();
  }
}

/** No-op audit log for tests / PermissiveAccessStore consumers. */
export class NullAccessAuditLog implements AccessAuditLog {
  record(_event: AccessAuditEvent): void { /* no-op */ }
  list(): readonly AccessAuditEvent[] { return []; }
}
