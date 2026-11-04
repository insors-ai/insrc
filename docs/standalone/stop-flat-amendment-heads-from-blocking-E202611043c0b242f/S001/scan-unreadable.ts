import { createRepoLifecycle } from '../../../../src/workflow/artifact-core/repo-lifecycle.js';
const repo = '/home/subho/work/dev/insors/insrc';
const { store } = createRepoLifecycle(repo);
for (const id of ['STORY-3c0b242fcabf01e9-s1', 'EPIC-3c0b242fcabf01e9', 'TASK-3c0b242fcabf01e9-s1-t1']) {
  const r = await store.childrenOfStrict(id);
  process.stdout.write(`${id}: children=${r.children.length} unreadable=${JSON.stringify(r.unreadable)}\n`);
}
