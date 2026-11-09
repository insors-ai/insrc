import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const predecessor = '../../../../docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9';
const successor = '../../../../docs/epics/show-long-running-task-progress-chat-E20261109206db342';
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope', async () => {
  const definition = await read(successor + '/DEF.md');
  const story = (id: number): string => {
    const sections = definition.split(/^### 6\./m);
    const section = sections.find(section => section.startsWith(id + ' STORY-206db3426ffd4428-s' + id + ' '));
    assert.ok(section, 'successor story s' + id);
    return section;
  };
  const foundation = await read(predecessor + '/S001/LLD.md');
  assert.match(foundation, /insrc#42/);
  assert.match(foundation, /### `ProgressEvent`/);
  assert.match(story(1), /Track long-running work consistently across executors/);
  assert.match(story(2), /Preserve live progress for workflows and analysis/);
  const mcp = await read(predecessor + '/S002/LLD.md');
  assert.match(mcp, /insrc#43/);
  assert.match(mcp, /McpProgressForwarding/);
  assert.match(story(6), /MCP request includes a valid caller progress token/);
  const reader = await read(predecessor + '/S003/LLD.md');
  assert.match(reader, /insrc#44/);
  assert.match(reader, /DaemonProgressReaderApi/);
  assert.match(story(5), /Keep inline progress with its originating VS Code chat/);
  assert.match(definition, /Tracker retirement is a separate decision/);
});
