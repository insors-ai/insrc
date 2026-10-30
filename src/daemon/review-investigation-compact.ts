/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { CompactReviewError } from '../shared/review-investigation-compact.js';
import type { CompactCommand, CompactRead, CompactProgress } from '../shared/review-investigation-compact.js';
import type { InvestigationTools, InvestigationTurnV1, InvestigationState, ReviewBlockProgressV1, InvestigationReplyV1 } from '../workflow/code-review/investigation/continuation-types.js';
import type { CoverageV1, LedgerRequirement, EvidenceV1 } from '../workflow/code-review/investigation/ledger-types.js';
import type { ReviewSubjectV1 } from '../workflow/code-review/investigation/types.js';
import { sourceReference } from '../workflow/code-review/investigation/source.js';
import { assertRepoPath } from '../workflow/code-review/investigation/git-packets.js';
import { digestValue, snapshotValue } from '../workflow/code-review/investigation/identity.js';

function refuse(code: string, hint: string): never {
 throw new CompactReviewError({ code, message: 'Review request needs correction.', hint, retryable: true });
}
type Scope = Pick<ReviewSubjectV1, 'tasks' | 'contracts' | 'packets'>;
/** Private, ephemeral presentation/translation only. Accepted state is always read from the kernel. */
export class CompactReviewFacade {
 private readonly scope: Scope;
 private readonly requirements: readonly LedgerRequirement[];
 private readonly evidence = new Map<string, string>();
 private readonly progress = new Map<string, ReviewBlockProgressV1>();
 constructor(private readonly turn: InvestigationTurnV1, tools: InvestigationTools,
  private readonly state: () => InvestigationState, private readonly expiresAt: number, private readonly now: () => number = Date.now) {
  this.scope = tools.seed['scope'] as Scope;
  this.requirements = tools.seed['obligations'] as readonly LedgerRequirement[];
  if (!this.scope || !Array.isArray(this.scope.packets) || !Array.isArray(this.scope.tasks) || !Array.isArray(this.scope.contracts) || !Array.isArray(this.requirements)) refuse('invalid-seed', 'Host must supply the canonical scoped seed.');
  for (const value of state().ledger.evidence) this.evidenceAlias(value.evidenceId);
 }
 private blocks() { return this.scope.packets.flatMap(p => p.blocks); }
 private block(alias: string) {
  const index = /^b([1-9][0-9]*)$/.exec(alias), block = index ? this.blocks()[Number(index[1]) - 1] : undefined;
  if (!block) refuse('unknown-block', 'Use a blockId such as b1 from the latest packet view.');
  return block;
 }
 private evidenceAlias(id: string): string {
  for (const [alias, value] of this.evidence) if (value === id) return alias;
  const alias = `e${this.evidence.size + 1}`; this.evidence.set(alias, id); return alias;
 }
 private evidenceIds(aliases: readonly string[]) { return aliases.map(alias => {
  const id = this.evidence.get(alias); if (!id) refuse('unknown-evidence', 'Use only evidence aliases returned by this host session.'); return id;
 }); }
 private row(alias: string): CoverageV1 {
  const index = /^r([1-9][0-9]*)$/.exec(alias), row = index ? this.state().ledger.coverage[Number(index[1]) - 1] : undefined;
  if (!row) refuse('unknown-expectation', `Copy an expectation field exactly (r1, r2, etc.), not its text, category or criterion. Current expectations: ${JSON.stringify(this.status(true).expectations)}`); return row;
 }
 private remaining() {
  const state = this.state(), reviewed = new Set(state.accepted.filter(a => a.progress.disposition === 'reviewed').map(a => a.progress.blockId));
  return [...new Set([...state.ledger.coverage.filter(r => r.disposition === 'pending' || r.disposition === 'unverified').map(r => r.requirementRef), ...this.blocks().filter(b => !reviewed.has(b.blockId)).map(b => b.blockId)])];
 }
 view() {
  const blocks = this.blocks();
  return snapshotValue({ protocol: 'compact-v1', ...this.status(true),
   tasks: this.scope.tasks, artifacts: this.scope.contracts.map(({ artifactId, path, revision }) => ({ artifactId, path, revision })),
   packets: this.scope.packets.map(p => ({ commit: p.commitId, parent: p.parentId, blocks: p.blocks.map(b => ({ blockId: `b${blocks.indexOf(b) + 1}`, kind: b.kind,
    before: b.oldBlob && b.oldLines ? { path: b.oldPath, lines: b.oldLines } : null,
    after: b.newBlob && b.newLines ? { path: b.newPath, lines: b.newLines } : null })) })),
   evidence: [...this.evidence.keys()]
  });
 }
 /** Ordinary read replies contain progress/time only, not another copy of the seed. */
 status(includeExpectations = false) {
  const state = this.state(), blocks = this.blocks(), reviewed = new Set(state.accepted.filter(a => a.progress.disposition === 'reviewed').map(a => a.progress.blockId)), focus = blocks.find(b => !reviewed.has(b.blockId));
  return snapshotValue({ remainingMs: Math.max(0, this.expiresAt - this.now()),
   focus: focus ? `b${blocks.indexOf(focus) + 1}` : null,
   ...(includeExpectations ? { expectations: state.ledger.coverage.flatMap((row, i) => {
    if (row.category === 'change' && focus && !row.requirementRef.endsWith(`/${focus.blockId}`)) return [];
    const requirement = this.requirements.find(r => r.requirementRef === row.requirementRef && r.category === row.category);
    return [{ expectation: `r${i + 1}`, category: row.category, ...(row.category === 'criterion' ? { criterion: row.requirementRef.slice('criterion:'.length) } : {}), text: requirement?.text ?? row.requirementRef,
     needs: requirement?.needs ?? 'inspection', allowNotApplicable: requirement?.allowNotApplicable ?? false, disposition: row.disposition }];
   }) } : {}),
   acceptedBlocks: [...new Set(state.accepted.map(a => a.progress.blockId))].map(id => `b${blocks.findIndex(b => b.blockId === id) + 1}`),
   covered: state.ledger.coverage.filter(r => ['satisfied', 'finding', 'not-applicable'].includes(r.disposition)).length, required: state.ledger.coverage.length
  });
 }
 read(target: CompactRead): string | null {
  if (target.kind === 'test') {
   // Planless Tasks may come from TESTS rather than the approved subject's task list;
   // the existing evidence adapter validates canonical membership and provenance.
   return JSON.stringify({ kind: 'test-result', taskId: target.taskId });
  }
  if (target.kind === 'change') {
   const b = this.block(target.blockId), before = target.side === 'before', lines = before ? b.oldLines : b.newLines, oid = before ? b.oldBlob : b.newBlob;
   if (!lines || !oid) return null;
   const start = target.start ?? lines[0], end = target.end ?? Math.min(lines[1], start + 499);
   if ((target.start === undefined) !== (target.end === undefined) || start < lines[0] || end > lines[1] || end < start || end - start >= 500) refuse('invalid-range', 'Read a bounded subrange of the displayed changed span, or use a context target for surrounding code.');
   return sourceReference({ kind: 'blob', oid, start, end });
  }
  if (target.end < target.start || target.end - target.start >= 500) refuse('invalid-range', 'Use inclusive start/end with at most 500 lines.');
  if (target.kind === 'context') {
   try { assertRepoPath(target.path); } catch { refuse('invalid-path', 'Use a repository-relative regular file path from the pinned source tree.'); }
   return sourceReference({ kind: 'context', path: target.path, start: target.start, end: target.end });
  }
  if (!this.scope.contracts.some(p => p.artifactId === target.artifactId)) refuse('unknown-artifact', 'Use an artifactId from the pinned artifact list.');
  return sourceReference({ kind: 'artifact', artifactId: target.artifactId, start: target.start, end: target.end });
 }
 progressPayload(input: CompactProgress): ReviewBlockProgressV1 {
  const key = digestValue(input), previous = this.progress.get(key); if (previous) return previous;
  const block = this.block(input.blockId), evidenceIds = this.evidenceIds(input.evidence), progressId = `progress-${digestValue({ attempt: this.turn.attemptId, input })}`;
  if (new Set(input.assessments.map(a => a.expectation)).size !== input.assessments.length) refuse('duplicate-assessment', 'Assess each expectation member once.');
  const findings = input.findings.map((f, index) => ({ findingId: `finding-${digestValue({ progressId, index })}`, criterion: f.criterion, severity: f.severity, confidence: f.confidence,
   evidenceIds: this.evidenceIds(f.evidence), expectationRefs: f.expectations.map(alias => this.row(alias).requirementRef), message: f.message }));
  const coverageUpdates = input.assessments.map(a => ({ ...this.row(a.expectation), disposition: a.disposition, evidenceIds: this.evidenceIds(a.evidence),
   findingIds: a.findings.map(index => { const finding = findings[index]; if (!finding) refuse('unknown-finding', 'Use zero-based indexes into this request\'s findings array.'); return finding.findingId; }),
   rationale: a.rationale, assessedByAttempt: this.turn.attemptId }));
  const outstandingWork = input.unresolved.map(alias => alias.startsWith('b') ? this.block(alias).blockId : this.row(alias).requirementRef);
  const payload = snapshotValue({ runId: this.turn.runId, subjectDigest: this.turn.subjectDigest, generation: this.turn.generation, attemptId: this.turn.attemptId,
   progressId, expectedSequence: this.state().sequence, blockId: block.blockId, disposition: input.disposition, evidenceIds, notes: input.notes, coverageUpdates, findings, outstandingWork });
  this.progress.set(key, payload); return payload;
 }
 replyPayload(input: Extract<CompactCommand, { operation: 'reply' }>['reply']): InvestigationReplyV1 {
  const state = this.state(), remainingWork = this.remaining();
  return { runId: this.turn.runId, subjectDigest: this.turn.subjectDigest, generation: this.turn.generation, attemptId: this.turn.attemptId,
   acceptedBlockReceiptIds: state.accepted.map(a => a.receipt.progressId), lastAcceptedSequence: state.sequence,
   inspectedEvidenceIds: state.ledger.evidence.map(e => e.evidenceId), coverageUpdates: [], findings: [],
   next: { kind: input.action === 'finish' && !remainingWork.length ? 'request-completion' : 'pause', remainingWork, reason: input.reason } };
 }
 presentRead(result: Awaited<ReturnType<InvestigationTools['read']>>) {
  return { evidence: this.evidenceAlias(result.evidenceId), text: result.text, lines: result.lines, completeness: result.completeness, limitations: result.limitations };
 }
 presentImpact(value: EvidenceV1) {
  return { evidence: this.evidenceAlias(value.evidenceId), source: value.source, completeness: value.completeness, limitations: value.limitations };
 }
}
