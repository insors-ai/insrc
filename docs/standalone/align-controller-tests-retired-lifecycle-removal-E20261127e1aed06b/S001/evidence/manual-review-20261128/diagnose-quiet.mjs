import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { writeFileSync } from 'node:fs';
const run = createRun(process.cwd());
const base = run.environment;
run.environment = () => ({...base(), INSRC_BUILD_CONFIRM_CLOSURE:'1'});
const result = await withRun(run, scope => scope.start(run.runtime.executable, ['--import','tsx','--import', new URL('./handles.mjs',import.meta.url).href,'--test','--test-concurrency=1','--test-reporter=tap','--test-name-pattern=owner context is immutable lazy quiet','src/daemon/db/__tests__/driver-log-policy.test.ts'], { budgetMs:15000, env:{...run.environment(), INSRC_MODE:'probe-worker'} }));
writeFileSync(new URL('./diagnostic-quiet-result.json',import.meta.url), JSON.stringify({runId:run.runId,workspace:run.workspace,result},null,2));
console.log(JSON.stringify({runId:run.runId,workspace:run.workspace,result}));
