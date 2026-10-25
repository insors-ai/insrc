// Reproduce the four-clause regression using the checkout's freshly built judge.
// This is a targeted adherence re-review, not a replacement for the full Story CR.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const repo = process.cwd();
const load = name => JSON.parse(readFileSync(resolve(repo, '.insrc/artifacts', name), 'utf8'));
const lld = load('LLD-b7a68147dcf72034-s4.json');
const previous = load('CR-b7a68147dcf72034-s4.json');
const originalHighs = previous.body.dimensions.flatMap(d => d.findings.filter(f => d.dimension === 'adherence' && f.severity === 'HIGH'));
if (originalHighs.length !== 4) throw new Error('Expected exactly four original HIGH findings; inspect the baseline before rerunning.');
const errorCases = lld.body.errorPaths.errorCases.filter(x => x.scenario.includes('refspec'));
const edgeCases = lld.body.errorPaths.edgeCases.filter(x => x.input === "git_push with ref ':dev' and no force flag" || x.input === "git_push with ref '+main:main'");
if (errorCases.length !== 1 || edgeCases.length !== 2) throw new Error('Approved clause selection changed.');
const { CliProvider } = await import(pathToFileURL(resolve(repo, 'out/agent/providers/cli-provider.js')));
const { judgeAdherence } = await import(pathToFileURL(resolve(repo, 'out/workflow/code-review/dimensions/adherence.js')));
const subject = {
 repoPath: repo, epicHash: 'b7a68147dcf72034', storyId: 's4', changedFiles: previous.body.subject.changedFiles,
 approvedLld: { ...lld, body: { errorPaths: { errorCases, edgeCases, invariantsToPreserve: [] }, migration: { stateAfter: lld.body.migration.stateAfter } } },
 approvedPlan: null, buildRecord: load('BUILD-b7a68147dcf72034-s4.json'),
};
const provider = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
const grounding = { symbols: ['push', 'index'].map(name => ({ entityId: `regression-${name}`, file: `src/daemon/tools/builtins/git/${name}.ts`, name, kind: 'module', signature: `${name}: summary deliberately omits implementation detail`, callers: [], callees: [], testsReaching: [] })) };
const startedAt = new Date().toISOString();
const sourceHashes = Object.fromEntries(['src/workflow/code-review/dimensions/adherence.ts', 'src/workflow/code-review/source-inspection.ts', 'src/workflow/review-pipeline/code-review.ts'].map(file => [file, createHash('sha256').update(readFileSync(resolve(repo, file))).digest('hex')]));
const result = await judgeAdherence(subject, grounding, provider, { onCall: call => process.stdout.write(`review-call ${call.stage} ${call.role}\n`) });
const evidence = { startedAt, finishedAt: new Date().toISOString(), scope: 'Targeted adherence re-review of the four previously false HIGH findings; original approved clauses selected verbatim; original full CR preserved.', model: 'codex:gpt-6.1-sol', effort: 'high', sourceHashes, originalHighs, reviewedClauses: subject.approvedLld.body, result, highFindings: result.findings.filter(f => f.severity === 'HIGH') };
writeFileSync(new URL('./four-highs-result.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
process.stdout.write(JSON.stringify({ high: evidence.highFindings.length, findings: result.findings }, null, 2) + '\n');
if (evidence.highFindings.length > 0) process.exitCode = 1;
