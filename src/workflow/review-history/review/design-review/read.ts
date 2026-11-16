/** Read-only historical review compatibility. No live review execution. */
import type { PermanentDesignReview } from "./history.js";
import type { DesignFinding } from "./contracts.js";
export interface DesignFindingView {
    readonly attempt: number;
    readonly chunkId: string;
    readonly finding: DesignFinding;
}
export function designFindingViews(record: PermanentDesignReview): readonly DesignFindingView[] {
    const a = record.attempts.find(a => a.number === record.applicableAttempt)!;
    const origins = a.report!.impact?.effectiveFindingOrigins ?? a.completedChunks.flatMap(r => r.findings.map(f => ({ attempt: a.number, chunkId: r.chunkId, findingId: f.id })));
    return origins.map(o => ({ attempt: o.attempt, chunkId: o.chunkId, finding: record.attempts.find(a => a.number === o.attempt)!.completedChunks.find(c => c.chunkId === o.chunkId)!.findings.find(f => f.id === o.findingId)! }));
}
/** Current report prose for existing tracker/CLI surfaces; never synthesizes legacy claims. */
export function renderPermanentDesignReview(record: PermanentDesignReview): string {
    const a = record.attempts.find(a => a.number === record.applicableAttempt)!, r = a.report!;
    const lines = [`## Design review — ${r.status}`, `Attempt ${a.number} · ${r.reviewer} · ${r.counts.HIGH} HIGH, ${r.counts.MED} MED, ${r.counts.LOW} LOW`];
    if (record.schemaVersion === 2)
        for (const failure of record.admissionFailures)
            lines.push(`Attempt ${failure.number}: technical admission ${failure.status}; no chunk assessment. ${failure.error ? `${failure.error.code} (${failure.error.field}): ${failure.error.summary}` : 'Admission interrupted.'}`);
    for (const c of r.chunks)
        lines.push(`### ${c.chunkId}`, c.summary, ...c.limitations.map(l => `- Verification gap: ${l}`), ...c.advice.map(l => `- Advice: ${l}`));
    for (const f of designFindingViews(record))
        lines.push(`- **${f.finding.severity}** ${f.finding.message} (${f.finding.location}; attempt ${f.attempt}, ${f.chunkId})`);
    return lines.join('\n\n') + '\n';
}
