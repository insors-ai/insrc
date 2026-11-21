import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSubprocessRunner } from '../subprocess.js';

test('VS Code delegates runtime selection to fixed shell and strips Node injection from lifecycle children', async () => {
 const result=await defaultSubprocessRunner.run(['/bin/sh','-c',
  '[ "${NODE_OPTIONS+x}" != x ] && [ "${NODE_PATH+x}" != x ] && [ "$KEEP_FLAG" = preserved ]'],
  {env:{NODE_OPTIONS:'--invalid-injection',NODE_PATH:'/external',KEEP_FLAG:'preserved'}});
 assert.equal(result.code,0);
});
