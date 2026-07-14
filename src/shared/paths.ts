import { homedir } from 'node:os';
import { join } from 'node:path';

const INSRC_DIR = join(homedir(), '.insrc');
const LOG_DIR   = join('/tmp', '.insrc');

export const PATHS = {
  insrc:       INSRC_DIR,
  config:      join(INSRC_DIR, 'config.json'),
  duckdb:      join(INSRC_DIR, 'duckdb.db'),    // legacy: file-backed DuckDB consolidation (cleaned up on boot)
  lmdb:        join(INSRC_DIR, 'graph.lmdb'),   // LMDB: graph + repo + plans + conversations + todos + config
  graph:       join(INSRC_DIR, 'graph'),        // legacy: Kuzu DB directory (cleaned up on boot)
  lance:       join(INSRC_DIR, 'lance'),        // LanceDB store (entity + session + turn + config vectors)
  configStore: join(INSRC_DIR, 'config-store'), // legacy: standalone Lance config-store (now folded into PATHS.lance; cleaned up on boot)
  templates:   join(INSRC_DIR, 'templates'),    // global config templates
  feedback:    join(INSRC_DIR, 'feedback'),     // global config feedback
  conventions: join(INSRC_DIR, 'conventions'),  // global config conventions
  pidFile:     join(INSRC_DIR, 'daemon.pid'),
  sockFile:    join(INSRC_DIR, 'daemon.sock'),
  agents:      join(INSRC_DIR, 'agents'),          // agent run storage
  agentIndex:  join(INSRC_DIR, 'agents', 'index.json'),
  // Backing-file directory for ephemeral workbench panes (notepad,
  // artifacts, analysis report, brainstorm presentation, ...). Each
  // ephemeral pane writes its content to a real file under this
  // directory and opens that file URI -- so on next IDE restart the
  // editor restoration finds a valid resource instead of the old
  // custom-scheme URI whose provider hasn't initialised yet (and shows
  // an error pane). A startup reconciler in the workbench prunes any
  // file here that no open editor references.
  tmp:         join(INSRC_DIR, 'tmp'),
  /**
   * Returns the per-session output spill directory
   * (conversation-flow-refinement.md Phase 2). The spill-writer
   * subscribes to `session.skillAudit` and drops every skill output
   * here as `<epoch_ms>-<skill_id>.json`, plus the synthesise
   * step's rendered report as `<epoch_ms>-synthesise.md`. Indexed
   * in parallel into the `artifact_vec` Lance table so the
   * follow-up-turn retriever can pull them by relevance. Cleaned
   * up on session close.
   */
  sessionTmp:  (sessionId: string): string => join(INSRC_DIR, 'tmp', sessionId),
  /**
   * Returns the per-report-run working-memory directory under the
   * session's tmp dir. The orchestrator (planner-section-task-
   * separation P3) writes one entry file per completed TODO here;
   * the shape-the-memory step (P1.c) reads them back as the
   * accumulating working-memory file. Lifetime per Q1: ephemeral by
   * default, persisted only if the report completes successfully.
   * Crash recovery (Q9): per-TODO atomic; mid-iteration crash loses
   * only the in-flight TODO.
   */
  workingMemoryRun: (sessionId: string, runId: string): string =>
    join(INSRC_DIR, 'tmp', sessionId, 'working-memory', runId),
  // Cache root for the Code Analyzer's multipass synthesis section
  // builder (Phase 5.C / content-gen). Per-section disk LRU; cache
  // key salts on the run's repoSnapshotId so a new commit
  // invalidates every cached section. Used only by the synthesis
  // step that runs inline in the orchestrator -- the legacy
  // per-task cache that lived alongside it (`code-analyzer/`) was
  // dropped along with the legacy analyzer runner.
  codeAnalyzerSectionCache: join(INSRC_DIR, 'cache', 'code-analyzer-sections'),
  // Cache root for the Data Analyzer's per-task LRU
  // (plans/analyzers/data-analyzer.md Phase 2.4). Mirrors the
  // code-analyzer cache shape; key shape differs --
  // SHA256(question + scope + tier + connection-fingerprint) -- so
  // schema changes invalidate per-target rather than per-commit.
  // Cleared via `insrc.dataAnalyzer.clearCache`.
  dataAnalyzerCache: join(INSRC_DIR, 'cache', 'data-analysis'),
  // Per-session handoff persistRoot (plans/external-agent-integration.md
  // §7.1). Worktrees + spec / deliverable / audit / cost / trace files
  // for every external-agent handoff live under
  // `<handoffs>/<sessionId>/`. The orphan classifier (Phase 5) reads
  // this on daemon startup to surface interrupted runs.
  handoffs:    join(INSRC_DIR, 'handoffs'),
  // Substrate memory store root (memory-context M1.5).
  // Layout: ~/.insrc/substrate/<workspaceId>/<owner>/<namespace>/<entries>
  substrate:   join(INSRC_DIR, 'substrate'),
  // Per-meta-task persistRoot (design/meta-tasks.html §8). Each
  // meta-task run owns `<meta>/<metaTaskId>/` with meta.json + plan.json
  // + per-step deliverables + phase-1/2 JSONL traces + synthesis.
  meta:        join(INSRC_DIR, 'meta'),
  // Analyze framework root (design/analyze-framework.md). Each analyze
  // run owns `<analyze>/<runId>/` with meta.json + plan/ + context/
  // (cached classification + run + per-task bundles) + tasks/.
  // Per-target shapers + planner + leaf templates all write under this
  // root; resumable runs read the cached state back.
  analyze:     join(INSRC_DIR, 'analyze'),
  analyzeRun:  (runId: string): string => join(INSRC_DIR, 'analyze', runId),
  // Top-level run lifecycle record. Captures intent, stage, status,
  // finalReport, error. Read by resume + the IDE; written atomically
  // at every stage transition by the orchestrator.
  analyzeRunRecord: (runId: string): string =>
    join(INSRC_DIR, 'analyze', runId, 'run.json'),
  // Per-task output: ~/.insrc/analyze/<runId>/tasks/<taskId>.json
  // Leaf tasks land here; planner-template tasks ALSO land here
  // (carrying the child plan's aggregator output) and additionally
  // hold a sibling directory <runRoot>/tasks/<taskId>/ for the
  // child plan's persistence layout.
  analyzeTaskOutput: (runId: string, taskId: string): string =>
    join(INSRC_DIR, 'analyze', runId, 'tasks', `${taskId}.json`),
  analyzeContext: (runId: string): string =>
    join(INSRC_DIR, 'analyze', runId, 'context'),
  logDir:      LOG_DIR,
  daemonLog:   join(LOG_DIR, 'daemon.log'),
  agentLog:    join(LOG_DIR, 'agent.log'),
} as const;
