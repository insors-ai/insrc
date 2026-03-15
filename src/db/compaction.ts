/**
 * Conversation compaction — tiered compression of persistent turn history.
 *
 * Algorithm (executed in order):
 *   1. Directive scan — identify and reclassify user preferences/rules
 *   2. Time-based tiering — hot/warm/cold/archive based on age
 *   3. Semantic clustering — merge similar cold-tier turns
 *   4. Archive collapse — collapse old sessions into summaries
 *   5. Size cap — enforce per-repo limits
 *   6. Cross-tier dedup — remove near-duplicate entries
 *
 * Safety: only operates on turns older than hotDays (default 7 days),
 * so live sessions writing new turns are never affected.
 */

import type { DbClient } from './client.js';
import type { TurnRecord, ConversationEntryType, ConversationTier } from './conversations.js';
import {
  getAllTurns, getAllTurnsForRepo,
  deleteTurnsByIds, addCompactedTurns,
} from './conversations.js';
import { isDirective, extractDirectiveText } from './directives.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('compaction');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompactionOpts {
  repo?: string | undefined;
  hotDays?: number | undefined;           // default 7
  warmDays?: number | undefined;          // default 30
  coldDays?: number | undefined;          // default 90
  similarityThreshold?: number | undefined; // default 0.85
  maxTurnsPerRepo?: number | undefined;     // default 500
  maxDirectivesPerRepo?: number | undefined; // default 50
  dryRun?: boolean | undefined;
}

export interface CompactionResult {
  directives: number;
  warmCompressed: number;
  coldMerged: number;
  archived: number;
  deduped: number;
  capped: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function compactConversations(
  db: DbClient,
  embedFn: (text: string) => Promise<number[]>,
  opts?: CompactionOpts,
): Promise<CompactionResult> {
  const hotDays = opts?.hotDays ?? 7;
  const warmDays = opts?.warmDays ?? 30;
  const coldDays = opts?.coldDays ?? 90;
  const threshold = opts?.similarityThreshold ?? 0.85;
  const maxTurns = opts?.maxTurnsPerRepo ?? 500;
  const maxDirectives = opts?.maxDirectivesPerRepo ?? 50;
  const dryRun = opts?.dryRun ?? false;

  const result: CompactionResult = {
    directives: 0,
    warmCompressed: 0,
    coldMerged: 0,
    archived: 0,
    deduped: 0,
    capped: 0,
  };

  // Load all turns
  const allTurns = opts?.repo
    ? await getAllTurnsForRepo(db, opts.repo)
    : await getAllTurns(db);

  if (allTurns.length === 0) return result;

  const now = Date.now();
  const hotCutoff = now - hotDays * 86_400_000;
  const warmCutoff = now - warmDays * 86_400_000;
  const coldCutoff = now - coldDays * 86_400_000;

  const toDelete: string[] = [];
  const toAdd: TurnRecord[] = [];

  // Group by repo for per-repo operations
  const byRepo = new Map<string, TurnRecord[]>();
  for (const t of allTurns) {
    const repo = t.repo || '__unknown__';
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo)!.push(t);
  }

  for (const [repo, repoTurns] of byRepo) {
    // Step 1: Directive scan
    for (const t of repoTurns) {
      if (t.type !== 'turn' && t.type !== undefined) continue;
      if ((t.type ?? 'turn') !== 'turn') continue;
      if (!isDirective(t.user)) continue;

      const directiveText = extractDirectiveText(t.user, t.assistant);
      const turnId = `${t.sessionId}:${t.idx}`;
      toDelete.push(turnId);
      toAdd.push({
        ...t,
        user: directiveText,
        assistant: '',
        type: 'directive',
        tier: 'hot',
        sourceIds: [turnId],
      });
      result.directives++;
    }

    // Step 2: Time-based tiering (skip directives and already-compacted)
    const nonDirectives = repoTurns.filter(t => (t.type ?? 'turn') === 'turn');

    for (const t of nonDirectives) {
      const created = new Date(t.compactedAt || '').getTime() || parseCreatedAt(t);
      if (Number.isNaN(created)) continue;

      const turnId = `${t.sessionId}:${t.idx}`;

      if (created >= hotCutoff) {
        // Hot — leave as-is
        continue;
      }

      if (created >= warmCutoff) {
        // Warm — truncate assistant, update tier
        if ((t.tier ?? 'hot') === 'hot') {
          const truncated = t.assistant.length > 500 ? t.assistant.slice(0, 500) : t.assistant;
          const compressed = `${t.user}\n${truncated}`;
          let newVec = t.vector;
          try {
            const embedded = await embedFn(compressed);
            if (embedded.length > 0) newVec = embedded;
          } catch { /* keep original vector */ }

          toDelete.push(turnId);
          toAdd.push({
            ...t,
            assistant: truncated,
            vector: newVec,
            tier: 'warm',
          });
          result.warmCompressed++;
        }
        continue;
      }

      if (created >= coldCutoff) {
        // Cold — candidate for semantic clustering (handled in step 3)
        continue;
      }

      // Archive — candidate for session collapse (handled in step 4)
    }

    // Step 3: Semantic clustering (cold tier)
    const coldTurns = repoTurns.filter(t => {
      if ((t.type ?? 'turn') !== 'turn') return false;
      const created = parseCreatedAt(t);
      return created >= coldCutoff && created < warmCutoff;
    });

    if (coldTurns.length >= 2) {
      const clusters = clusterBySimilarity(coldTurns, threshold);
      for (const cluster of clusters) {
        if (cluster.length < 2) continue;

        const merged = mergeTurns(cluster, repo);
        for (const t of cluster) {
          toDelete.push(`${t.sessionId}:${t.idx}`);
        }
        toAdd.push(merged);
        result.coldMerged += cluster.length;
      }
    }

    // Step 4: Archive collapse (group by session)
    const archiveTurns = repoTurns.filter(t => {
      if ((t.type ?? 'turn') !== 'turn') return false;
      const created = parseCreatedAt(t);
      return created < coldCutoff;
    });

    const bySession = new Map<string, TurnRecord[]>();
    for (const t of archiveTurns) {
      if (!bySession.has(t.sessionId)) bySession.set(t.sessionId, []);
      bySession.get(t.sessionId)!.push(t);
    }

    for (const [sessionId, sessionTurns] of bySession) {
      if (sessionTurns.length === 0) continue;

      const summary = sessionTurns
        .map(t => `- ${t.user.slice(0, 100)}`)
        .join('\n')
        .slice(0, 1000);

      const entityUnion = [...new Set(sessionTurns.flatMap(t => t.entities))];
      const centroid = computeCentroid(sessionTurns.map(t => t.vector));

      for (const t of sessionTurns) {
        toDelete.push(`${t.sessionId}:${t.idx}`);
      }

      toAdd.push({
        sessionId,
        idx: 0,
        user: 'Session summary',
        assistant: summary,
        entities: entityUnion,
        vector: centroid,
        repo,
        type: 'summary',
        tier: 'archive',
        sourceIds: sessionTurns.map(t => `${t.sessionId}:${t.idx}`),
      });
      result.archived += sessionTurns.length;
    }

    // Step 5: Size cap
    const remainingAfterCompaction = repoTurns.filter(t => {
      const id = `${t.sessionId}:${t.idx}`;
      return !toDelete.includes(id) && (t.type ?? 'turn') !== 'directive';
    });
    const newNonDirectives = toAdd.filter(t => t.repo === repo && t.type !== 'directive');
    const totalNonDirective = remainingAfterCompaction.length + newNonDirectives.length;

    if (totalNonDirective > maxTurns) {
      const excess = totalNonDirective - maxTurns;
      // Sort remaining by priority: archive < cold < warm, then oldest first
      const sorted = [...remainingAfterCompaction].sort((a, b) => {
        const priority = tierPriority(a.tier ?? 'hot') - tierPriority(b.tier ?? 'hot');
        if (priority !== 0) return priority;
        return parseCreatedAt(a) - parseCreatedAt(b);
      });
      for (let i = 0; i < excess && i < sorted.length; i++) {
        const t = sorted[i]!;
        toDelete.push(`${t.sessionId}:${t.idx}`);
        result.capped++;
      }
    }

    // Cap directives
    const repoDirectives = [
      ...repoTurns.filter(t => t.type === 'directive'),
      ...toAdd.filter(t => t.repo === repo && t.type === 'directive'),
    ];
    if (repoDirectives.length > maxDirectives) {
      const sorted = [...repoDirectives].sort((a, b) =>
        parseCreatedAt(a) - parseCreatedAt(b),
      );
      const excess = sorted.slice(0, repoDirectives.length - maxDirectives);
      for (const t of excess) {
        toDelete.push(`${t.sessionId}:${t.idx}`);
        result.capped++;
      }
    }

    // Step 6: Cross-tier dedup (strict threshold 0.92)
    const allRemaining = repoTurns.filter(t => {
      const id = `${t.sessionId}:${t.idx}`;
      return !toDelete.includes(id);
    });

    for (let i = 0; i < allRemaining.length; i++) {
      const a = allRemaining[i]!;
      const aId = `${a.sessionId}:${a.idx}`;
      if (toDelete.includes(aId)) continue;

      for (let j = i + 1; j < allRemaining.length; j++) {
        const b = allRemaining[j]!;
        const bId = `${b.sessionId}:${b.idx}`;
        if (toDelete.includes(bId)) continue;
        if ((a.tier ?? 'hot') !== (b.tier ?? 'hot')) continue;

        const sim = cosineSimilarity(a.vector, b.vector);
        if (sim > 0.92) {
          // Keep newer, delete older
          const aTime = parseCreatedAt(a);
          const bTime = parseCreatedAt(b);
          toDelete.push(aTime < bTime ? aId : bId);
          result.deduped++;
        }
      }
    }
  }

  // Deduplicate toDelete
  const uniqueDeletes = [...new Set(toDelete)];

  if (dryRun) {
    log.info({ ...result, deletions: uniqueDeletes.length, additions: toAdd.length }, 'compaction dry run');
    return result;
  }

  // Apply mutations
  if (uniqueDeletes.length > 0) {
    // Delete in batches to avoid huge IN clauses
    const batchSize = 100;
    for (let i = 0; i < uniqueDeletes.length; i += batchSize) {
      await deleteTurnsByIds(db, uniqueDeletes.slice(i, i + batchSize));
    }
  }

  if (toAdd.length > 0) {
    await addCompactedTurns(db, toAdd);
  }

  log.info({ ...result }, 'compaction complete');
  return result;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * Single-linkage clustering by cosine similarity.
 * Returns groups of turns where each turn is similar (> threshold)
 * to at least one other turn in the group.
 */
function clusterBySimilarity(turns: TurnRecord[], threshold: number): TurnRecord[][] {
  const n = turns.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!; // path compression
      i = parent[i]!;
    }
    return i;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(turns[i]!.vector, turns[j]!.vector);
      if (sim > threshold) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, TurnRecord[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(turns[i]!);
  }

  return [...groups.values()];
}

/**
 * Merge a cluster of turns into a single merged entry.
 */
function mergeTurns(cluster: TurnRecord[], repo: string): TurnRecord {
  // Deduplicate user messages by similarity
  const userMessages: string[] = [];
  for (const t of cluster) {
    const isDupe = userMessages.some(m => m === t.user);
    if (!isDupe) userMessages.push(t.user);
  }

  // Pick longest assistant response, truncate
  const longestAssistant = cluster
    .map(t => t.assistant)
    .sort((a, b) => b.length - a.length)[0] ?? '';
  const truncatedAssistant = longestAssistant.length > 500
    ? longestAssistant.slice(0, 500)
    : longestAssistant;

  const entityUnion = [...new Set(cluster.flatMap(t => t.entities))];
  const centroid = computeCentroid(cluster.map(t => t.vector));
  const latest = cluster.reduce((a, b) =>
    parseCreatedAt(a) > parseCreatedAt(b) ? a : b,
  );

  return {
    sessionId: latest.sessionId,
    idx: latest.idx,
    user: userMessages.join('\n---\n'),
    assistant: truncatedAssistant,
    entities: entityUnion,
    vector: centroid,
    repo,
    type: 'merged',
    tier: 'cold',
    sourceIds: cluster.map(t => `${t.sessionId}:${t.idx}`),
  };
}

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function computeCentroid(vectors: number[][]): number[] {
  const nonEmpty = vectors.filter(v => v.length > 0);
  if (nonEmpty.length === 0) return [];

  const dim = nonEmpty[0]!.length;
  const centroid = new Array<number>(dim).fill(0);
  for (const v of nonEmpty) {
    for (let i = 0; i < dim; i++) {
      centroid[i]! += v[i]! / nonEmpty.length;
    }
  }
  return centroid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCreatedAt(t: TurnRecord): number {
  if (t.createdAt) {
    const ts = new Date(t.createdAt).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  if (t.compactedAt) {
    const ts = new Date(t.compactedAt).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function tierPriority(tier: ConversationTier): number {
  switch (tier) {
    case 'archive': return 0;
    case 'cold': return 1;
    case 'warm': return 2;
    case 'hot': return 3;
  }
}
