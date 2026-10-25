import { writeFileSync } from 'node:fs';
const R = '/Users/subhagho/work/projects/insors/insrc';
const { CliProvider } = await import(`${R}/src/agent/providers/cli-provider.ts`);
const { verifyClaim, VERIFY_CALL_STALL_MS, VERIFY_CALL_TIMEOUT_MS } = await import(`${R}/src/workflow/review/verify.ts`);
const { gatherEvidence } = await import(`${R}/src/workflow/review/probe.ts`);
const claims = [
  { id: 'p1', kind: 'citation', text: 'VERIFY_CALL_TIMEOUT_MS is defined from the design-verify row of REVIEW_CALL_LIMITS in src/workflow/review/verify.ts', anchors: ['src/workflow/review/verify.ts'], probe: { greps: ['VERIFY_CALL_TIMEOUT_MS ='], reads: [] } },
  { id: 'p2', kind: 'citation', text: 'The build-validation judge session deadline JUDGE_DEADLINE_MS is 120 seconds', anchors: ['src/daemon/steps/build-step/phases/validate.ts'], probe: { greps: ['JUDGE_DEADLINE_MS = '], reads: [] } },
  { id: 'p3', kind: 'inventory', text: 'REVIEW_CALL_LIMITS has exactly four rows: design-verify, design-extract, code-review and build-validate', anchors: ['src/workflow/review/call-limits.ts'], probe: { greps: ["^\\t'[a-z-]+':"], reads: [] } },
];
const p = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
const out: unknown[] = [];
console.log(JSON.stringify({ VERIFY_CALL_STALL_MS, VERIFY_CALL_TIMEOUT_MS }));
const evidence = await gatherEvidence(claims as never, R, { readEntitiesForRepo: async () => [] } as never);
for (const c of claims) {
  const ev = evidence.find((e: { claimId: string }) => e.claimId === c.id);
  const t0 = Date.now();
  try {
    const f = await verifyClaim(c as never, ev, p);
    out.push({ id: c.id, ms: Date.now() - t0, ok: true, severity: f.severity, outcome: f.outcome, fixability: f.fixability, hasFix: f.proposedFix !== undefined, evidence: String(f.evidence).slice(0, 200) });
  } catch (e) {
    out.push({ id: c.id, ms: Date.now() - t0, ok: false, err: (e as Error).name + ': ' + (e as Error).message.slice(0, 400) });
  }
  console.log(JSON.stringify(out[out.length - 1]));
}
writeFileSync('/tmp/t10live/live-verify.json', JSON.stringify(out, null, 2));
