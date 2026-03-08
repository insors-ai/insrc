import type { DbClient } from '../../db/client.js';
import type { Plan, PlanStep, PlanStepStatus, PlanStatus } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Plan persistence layer — Kuzu graph operations
//
// Plans live in Kuzu indefinitely (NOT subject to session TTL).
// Pruned only via explicit /plan delete.
//
// Graph shape:
//   (Plan) -[CONTAINS]-> (PlanStep)
//   (PlanStep) -[STEP_DEPENDS_ON]-> (PlanStep)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State machine — valid transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<PlanStepStatus, PlanStepStatus[]> = {
  pending:     ['in_progress', 'skipped'],
  in_progress: ['done', 'failed', 'skipped', 'pending'], // pending = crash recovery
  done:        ['pending'],   // only via /plan undo
  failed:      ['in_progress'], // retry
  skipped:     ['pending'],   // revert skip
};

export function isValidTransition(from: PlanStepStatus, to: PlanStepStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Save plan + steps + edges
// ---------------------------------------------------------------------------

export async function savePlan(db: DbClient, plan: Plan): Promise<void> {
  const now = new Date().toISOString();

  // Insert Plan node
  await db.graph.query(
    `MERGE (p:Plan {id: $id})
     SET p.repoPath = $repoPath, p.title = $title, p.status = $status,
         p.createdAt = $createdAt, p.updatedAt = $updatedAt`,
    {
      id: plan.id,
      repoPath: plan.repoPath,
      title: plan.title,
      status: plan.status,
      createdAt: plan.createdAt || now,
      updatedAt: now,
    },
  );

  // Insert PlanStep nodes + CONTAINS edges
  for (const step of plan.steps) {
    await db.graph.query(
      `MERGE (s:PlanStep {id: $id})
       SET s.planId = $planId, s.idx = $idx, s.title = $title,
           s.description = $description, s.checkpoint = $checkpoint,
           s.status = $status, s.complexity = $complexity,
           s.fileHint = $fileHint, s.notes = $notes,
           s.createdAt = $createdAt, s.updatedAt = $updatedAt,
           s.startedAt = $startedAt, s.doneAt = $doneAt`,
      {
        id: step.id,
        planId: plan.id,
        idx: step.idx,
        title: step.title,
        description: step.description,
        checkpoint: step.checkpoint,
        status: step.status,
        complexity: step.complexity,
        fileHint: step.fileHint || '',
        notes: step.notes || '',
        createdAt: step.createdAt || now,
        updatedAt: now,
        startedAt: step.startedAt || '',
        doneAt: step.doneAt || '',
      },
    );

    // CONTAINS edge: Plan → PlanStep
    await db.graph.query(
      `MATCH (p:Plan {id: $planId}), (s:PlanStep {id: $stepId})
       MERGE (p)-[:CONTAINS]->(s)`,
      { planId: plan.id, stepId: step.id },
    );
  }

  // Insert STEP_DEPENDS_ON edges
  for (const step of plan.steps) {
    for (const depId of step.dependsOn) {
      await db.graph.query(
        `MATCH (s:PlanStep {id: $fromId}), (d:PlanStep {id: $toId})
         MERGE (s)-[:STEP_DEPENDS_ON]->(d)`,
        { fromId: step.id, toId: depId },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Get plan with steps and dependency graph
// ---------------------------------------------------------------------------

export async function getPlan(db: DbClient, planId: string): Promise<Plan | null> {
  // Fetch plan node
  const planResult = await db.graph.query(
    `MATCH (p:Plan {id: $id}) RETURN p.id, p.repoPath, p.title, p.status, p.createdAt, p.updatedAt`,
    { id: planId },
  );

  const planRows = await resultToRows(planResult);
  if (planRows.length === 0) return null;

  const pr = planRows[0]!;
  const plan: Plan = {
    id:        pr['p.id'] as string,
    repoPath:  pr['p.repoPath'] as string,
    title:     pr['p.title'] as string,
    status:    pr['p.status'] as PlanStatus,
    steps:     [],
    createdAt: pr['p.createdAt'] as string,
    updatedAt: pr['p.updatedAt'] as string,
  };

  // Fetch steps via CONTAINS
  const stepResult = await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep)
     RETURN s.id, s.planId, s.idx, s.title, s.description, s.checkpoint,
            s.status, s.complexity, s.fileHint, s.notes,
            s.createdAt, s.updatedAt, s.startedAt, s.doneAt
     ORDER BY s.idx`,
    { planId },
  );

  const stepRows = await resultToRows(stepResult);

  // Fetch all dependency edges for this plan's steps
  const depResult = await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep)-[:STEP_DEPENDS_ON]->(d:PlanStep)
     RETURN s.id AS fromId, d.id AS toId`,
    { planId },
  );
  const depRows = await resultToRows(depResult);

  // Build dependency map: stepId → [dependsOn IDs]
  const depMap = new Map<string, string[]>();
  for (const row of depRows) {
    const fromId = row['fromId'] as string;
    const toId = row['toId'] as string;
    if (!depMap.has(fromId)) depMap.set(fromId, []);
    depMap.get(fromId)!.push(toId);
  }

  for (const sr of stepRows) {
    const stepId = sr['s.id'] as string;
    plan.steps.push({
      id:          stepId,
      planId:      sr['s.planId'] as string,
      idx:         sr['s.idx'] as number,
      title:       sr['s.title'] as string,
      description: sr['s.description'] as string,
      checkpoint:  sr['s.checkpoint'] as boolean,
      status:      sr['s.status'] as PlanStepStatus,
      complexity:  sr['s.complexity'] as string as PlanStep['complexity'],
      fileHint:    (sr['s.fileHint'] as string) || '',
      notes:       sr['s.notes'] as string,
      dependsOn:   depMap.get(stepId) ?? [],
      createdAt:   sr['s.createdAt'] as string,
      updatedAt:   sr['s.updatedAt'] as string,
      startedAt:   (sr['s.startedAt'] as string) || undefined,
      doneAt:      (sr['s.doneAt'] as string) || undefined,
    });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Get active plan for a repo
// ---------------------------------------------------------------------------

export async function getActivePlan(db: DbClient, repoPath: string): Promise<Plan | null> {
  const result = await db.graph.query(
    `MATCH (p:Plan {repoPath: $repoPath, status: 'active'})
     RETURN p.id ORDER BY p.createdAt DESC LIMIT 1`,
    { repoPath },
  );

  const rows = await resultToRows(result);
  if (rows.length === 0) return null;

  return getPlan(db, rows[0]!['p.id'] as string);
}

// ---------------------------------------------------------------------------
// Update step state
// ---------------------------------------------------------------------------

export async function updateStepState(
  db: DbClient,
  stepId: string,
  newStatus: PlanStepStatus,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  // Fetch current state
  const result = await db.graph.query(
    `MATCH (s:PlanStep {id: $id}) RETURN s.status, s.notes`,
    { id: stepId },
  );
  const rows = await resultToRows(result);
  if (rows.length === 0) return { ok: false, error: 'step not found' };

  const currentStatus = rows[0]!['s.status'] as PlanStepStatus;

  if (!isValidTransition(currentStatus, newStatus)) {
    return { ok: false, error: `invalid transition: ${currentStatus} -> ${newStatus}` };
  }

  const now = new Date().toISOString();
  const existingNotes = (rows[0]!['s.notes'] as string) || '';
  const updatedNotes = note
    ? existingNotes ? `${existingNotes}\n[${now}] ${note}` : `[${now}] ${note}`
    : existingNotes;

  // Build SET clause with timestamp stamps
  let setCypher = `SET s.status = $status, s.notes = $notes, s.updatedAt = $updatedAt`;
  const params: Record<string, unknown> = {
    id: stepId, status: newStatus, notes: updatedNotes, updatedAt: now,
  };

  // Stamp startedAt when entering in_progress
  if (newStatus === 'in_progress') {
    setCypher += `, s.startedAt = $startedAt`;
    params.startedAt = now;
  }

  // Stamp doneAt when reaching a terminal state
  if (newStatus === 'done' || newStatus === 'skipped') {
    setCypher += `, s.doneAt = $doneAt`;
    params.doneAt = now;
  }

  // Clear timestamps on revert to pending
  if (newStatus === 'pending') {
    setCypher += `, s.startedAt = $startedAt, s.doneAt = $doneAt`;
    params.startedAt = '';
    params.doneAt = '';
  }

  await db.graph.query(`MATCH (s:PlanStep {id: $id}) ${setCypher}`, params);

  // If all steps are done/skipped, mark plan as completed
  if (newStatus === 'done' || newStatus === 'skipped') {
    await maybeCompletePlan(db, stepId);
  }

  // If reverting a step to pending, re-activate the plan
  if (newStatus === 'pending') {
    await reactivatePlan(db, stepId);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Get next unblocked step
// ---------------------------------------------------------------------------

export async function getNextStep(db: DbClient, planId: string): Promise<PlanStep | null> {
  // Get all pending steps ordered by idx
  const result = await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep {status: 'pending'})
     RETURN s.id, s.planId, s.idx, s.title, s.description, s.checkpoint,
            s.status, s.complexity, s.fileHint, s.notes,
            s.createdAt, s.updatedAt, s.startedAt, s.doneAt
     ORDER BY s.idx`,
    { planId },
  );
  const pendingRows = await resultToRows(result);

  for (const sr of pendingRows) {
    const stepId = sr['s.id'] as string;

    // Check if all dependencies are terminal (done or skipped)
    const depResult = await db.graph.query(
      `MATCH (s:PlanStep {id: $stepId})-[:STEP_DEPENDS_ON]->(d:PlanStep)
       WHERE d.status <> 'done' AND d.status <> 'skipped'
       RETURN count(d) AS blocking`,
      { stepId },
    );
    const depRows = await resultToRows(depResult);
    const blocking = (depRows[0]?.['blocking'] as number) ?? 0;

    if (blocking === 0) {
      return {
        id:          stepId,
        planId:      sr['s.planId'] as string,
        idx:         sr['s.idx'] as number,
        title:       sr['s.title'] as string,
        description: sr['s.description'] as string,
        checkpoint:  sr['s.checkpoint'] as boolean,
        status:      sr['s.status'] as PlanStepStatus,
        complexity:  sr['s.complexity'] as string as PlanStep['complexity'],
        fileHint:    (sr['s.fileHint'] as string) || '',
        notes:       sr['s.notes'] as string,
        dependsOn:   [],  // not needed for next-step context
        createdAt:   sr['s.createdAt'] as string,
        updatedAt:   sr['s.updatedAt'] as string,
        startedAt:   (sr['s.startedAt'] as string) || undefined,
        doneAt:      (sr['s.doneAt'] as string) || undefined,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Delete plan and all its steps/edges
// ---------------------------------------------------------------------------

export async function deletePlan(db: DbClient, planId: string): Promise<void> {
  // Delete STEP_DEPENDS_ON edges between steps of this plan
  await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep)-[r:STEP_DEPENDS_ON]->(d:PlanStep)
     DELETE r`,
    { planId },
  );

  // Delete CONTAINS edges
  await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[r:CONTAINS]->(s:PlanStep)
     DELETE r`,
    { planId },
  );

  // Delete step nodes
  await db.graph.query(
    `MATCH (s:PlanStep {planId: $planId}) DELETE s`,
    { planId },
  );

  // Delete plan node
  await db.graph.query(
    `MATCH (p:Plan {id: $planId}) DELETE p`,
    { planId },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function maybeCompletePlan(db: DbClient, stepId: string): Promise<void> {
  // Find the plan that contains this step
  const result = await db.graph.query(
    `MATCH (s:PlanStep {id: $stepId}) RETURN s.planId`,
    { stepId },
  );
  const rows = await resultToRows(result);
  if (rows.length === 0) return;

  const planId = rows[0]!['s.planId'] as string;

  // Check if any steps are not terminal
  const remaining = await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep)
     WHERE s.status <> 'done' AND s.status <> 'skipped'
     RETURN count(s) AS remaining`,
    { planId },
  );
  const remRows = await resultToRows(remaining);
  const count = (remRows[0]?.['remaining'] as number) ?? 0;

  if (count === 0) {
    const now = new Date().toISOString();
    await db.graph.query(
      `MATCH (p:Plan {id: $planId}) SET p.status = 'completed', p.updatedAt = $now`,
      { planId, now },
    );
  }
}

/** Re-activate a plan when a step is reverted to pending. */
async function reactivatePlan(db: DbClient, stepId: string): Promise<void> {
  const result = await db.graph.query(
    `MATCH (s:PlanStep {id: $stepId}) RETURN s.planId`,
    { stepId },
  );
  const rows = await resultToRows(result);
  if (rows.length === 0) return;

  const planId = rows[0]!['s.planId'] as string;
  const now = new Date().toISOString();
  await db.graph.query(
    `MATCH (p:Plan {id: $planId})
     WHERE p.status <> 'active'
     SET p.status = 'active', p.updatedAt = $now`,
    { planId, now },
  );
}

/**
 * Reset stale in_progress locks to pending.
 * Called on session start to recover from crashes.
 */
export async function resetStaleLocks(db: DbClient, planId: string): Promise<number> {
  const now = new Date().toISOString();
  // Find all in_progress steps for this plan
  const result = await db.graph.query(
    `MATCH (p:Plan {id: $planId})-[:CONTAINS]->(s:PlanStep {status: 'in_progress'})
     RETURN s.id`,
    { planId },
  );
  const rows = await resultToRows(result);

  for (const row of rows) {
    const stepId = row['s.id'] as string;
    await db.graph.query(
      `MATCH (s:PlanStep {id: $id})
       SET s.status = 'pending', s.startedAt = '', s.updatedAt = $now,
           s.notes = s.notes + $note`,
      { id: stepId, now, note: `\n[${now}] reset stale in_progress lock` },
    );
  }

  return rows.length;
}

/** Convert Kuzu QueryResult to plain row objects. */
async function resultToRows(result: unknown): Promise<Record<string, unknown>[]> {
  // Kuzu Node.js API: result.getAll() returns Promise<Record<string, unknown>[]>
  const qr = result as { getAll: () => Promise<Record<string, unknown>[]> };
  try {
    return await qr.getAll();
  } catch {
    return [];
  }
}
