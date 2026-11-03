// Artifact-only repair for raw font CSS emitted by pageStyleTags.
// Definitions and generated diagram content remain unchanged. Re-run after
// workflow regeneration until the shared renderer is corrected separately.
import { readFile, writeFile } from 'node:fs/promises';

for (const name of ['er-model.html', 'sequence-diagram.html']) {
  const path = new URL('../' + name, import.meta.url);
  const before = await readFile(path, 'utf8');
  const start = before.indexOf('\n@font-face');
  if (start < 0) {
    if (!before.includes('<style data-s3-font-repair>')) throw new Error('Unexpected font layout: ' + name);
    continue;
  }
  const end = before.indexOf('<style data-iv-mode="light">', start);
  if (end < start) throw new Error('Missing generated style boundary: ' + name);
  const css = before.slice(start + 1, end);
  if (!css.trim().startsWith('@font-face') || css.includes('<')) throw new Error('Unexpected generated CSS: ' + name);
  const after = before.slice(0, start) + '\n<style data-s3-font-repair>' + css + '</style>\n' + before.slice(end);
  await writeFile(path, after);
}
