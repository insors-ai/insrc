/**
 * Epic 00d80121c593053c Story S001 t6: clicking a diff line, or the path in a widget's header, opens the file at
 * the line. The registry's page script runs over the shared fake DOM; the host side runs over a real temporary
 * workspace.
 *
 *   npx tsx --test src/chat/__tests__/diff-click.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderRegistryWebviewSource } from '../render-registry.js';
import { createLinkOpener } from '../link-opener.js';
import { allOf, bodyStub, fire, textNode, type BodyStub } from './fake-dom.js';

type Posted = Record<string, unknown>;
interface Page {
  render(row: Record<string, unknown>): BodyStub;
  /** What the page's document click handlers do for a click on `target`. */
  click(target: BodyStub): void;
  posted: Posted[];
  selection: { text: string };
}

function page(): Page {
  const listeners: Array<(e: unknown) => void> = [];
  const selection = { text: '' };
  const posted: Posted[] = [];
  const document = {
    createElement: (tag: string) => bodyStub(tag),
    createTextNode: (t: string) => textNode(t),
    addEventListener: (type: string, l: (e: unknown) => void) => { if (type === 'click') listeners.push(l); },
    getSelection: () => selection.text,
  };
  const make = runInNewContext(`(${renderRegistryWebviewSource()})`, { document }) as (d: unknown, line: unknown) => {
    renderRow(vm: unknown): BodyStub | null;
    onLinkOpen(cb: (m: unknown) => void): void;
  };
  const reg = make(document, () => bodyStub('div'));
  reg.onLinkOpen((m) => posted.push(JSON.parse(JSON.stringify(m)) as Posted));
  return {
    posted, selection,
    render: (row) => reg.renderRow({ kind: 'diff', meta: { added: 0, removed: 0, ...row } })!,
    click: (target) => { for (const l of listeners) l({ target, preventDefault: () => {} }); },
  };
}
const byClass = (root: BodyStub, cls: string): BodyStub[] => allOf(root).filter((e) => e.className.split(' ').includes(cls));

test('a click on an added or context line posts open-code-ref with its path and new-side line', () => {
  const p = page();
  const box = p.render({ path: 'src/foo.ts', oldStart: 5, newStart: 7, lines: [' keep', '+added', '+more', ' tail', '\\ No newline at end of file'] });
  const rows = byClass(box, 'insrc-diffw__line');
  p.click(byClass(rows[0]!, 'insrc-diffw__text')[0]!);
  p.click(rows[1]!);
  p.click(byClass(rows[2]!, 'insrc-diffw__num')[0]!);
  p.click(rows[3]!);
  assert.deepEqual(p.posted, [
    { type: 'open-code-ref', path: 'src/foo.ts', line: 7 },
    { type: 'open-code-ref', path: 'src/foo.ts', line: 8 },
    { type: 'open-code-ref', path: 'src/foo.ts', line: 9 },
    { type: 'open-code-ref', path: 'src/foo.ts', line: 10 },
  ], 'the context line and each added line open at their own line in the file as it is now');
  // The note line is not a line of the file: it opens nothing.
  p.click(rows[4]!);
  assert.equal(p.posted.length, 4);
});

test('a click on a removed line posts the new-side line it sat before', () => {
  const p = page();
  const box = p.render({ path: 'src/foo.ts', oldStart: 40, newStart: 10, lines: ['-gone one', '-gone two', ' after', '-gone three', '+new'] });
  const rows = byClass(box, 'insrc-diffw__line');
  for (const r of rows) p.click(r);
  assert.deepEqual(p.posted.map((m) => m['line']), [10, 10, 10, 11, 11], 'a removed line opens where it was, never at its old-side number (40, 41, ...)');
  assert.ok(p.posted.every((m) => m['path'] === 'src/foo.ts' && m['type'] === 'open-code-ref'));
  // A click during a text selection posts nothing, so a line can be copied.
  p.selection.text = 'some selected text';
  p.click(rows[0]!);
  assert.equal(p.posted.length, 5);
});

test("a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget", () => {
  const p = page();
  const lines = Array.from({ length: 12 }, (_, i) => `+line ${i}`);
  const box = p.render({ path: 'src/foo.ts', oldStart: 0, newStart: 30, lines, added: 12 });
  const head = byClass(box, 'insrc-diffw__head')[0]!;
  const path = byClass(head, 'insrc-diffw__path')[0]!;
  const open = (): boolean => box.className.includes('insrc-diffw--open');
  assert.equal(open(), false);

  // The path: opens the file at the section's first line and does not toggle.
  const bdi = path.children[0]!;
  fire(head, 'click', { target: bdi });
  p.click(bdi);
  assert.deepEqual(p.posted, [{ type: 'open-code-ref', path: 'src/foo.ts', line: 30 }]);
  assert.equal(open(), false, 'a click on the path leaves the widget as it was');

  // The rest of the header: toggles, and posts nothing.
  const stat = byClass(head, 'insrc-diffw__stat')[0]!;
  fire(head, 'click', { target: stat });
  p.click(stat);
  assert.equal(open(), true, 'the stat area opens the rest of the lines');
  fire(head, 'click', { target: head });
  p.click(head);
  assert.equal(open(), false, 'and the header itself closes them');
  assert.equal(p.posted.length, 1, 'neither posted an open');
  // A new file starts at line 1; a deleted file has no new-side line, so the path opens without one.
  const created = p.render({ path: 'src/new.ts', oldStart: 0, newStart: 1, lines: ['+a'], fileState: 'new' });
  p.click(byClass(created, 'insrc-diffw__path')[0]!.children[0]!);
  const deleted = p.render({ path: 'src/old.ts', oldStart: 1, newStart: 0, lines: ['-a'], fileState: 'deleted' });
  p.click(byClass(deleted, 'insrc-diffw__path')[0]!.children[0]!);
  assert.deepEqual(p.posted.slice(1), [{ type: 'open-code-ref', path: 'src/new.ts', line: 1 }, { type: 'open-code-ref', path: 'src/old.ts' }]);
});

test('a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-diff-click-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'foo.ts'), 'a\nb\nc\n');
    const opened: Array<{ path: string; line: number | undefined }> = [];
    const warnings: string[] = [];
    const opener = createLinkOpener({
      root: () => root,
      openExternal: async () => true,
      openFile: async (path, line) => { opened.push({ path, line }); },
      log: { warn: (m) => void warnings.push(m) },
    });
    // The messages the widget posts are what the host's opener takes.
    const p = page();
    const box = p.render({ path: 'src/foo.ts', oldStart: 1, newStart: 2, lines: [' b', '+c'] });
    for (const r of byClass(box, 'insrc-diffw__line')) p.click(r);
    const gone = p.render({ path: 'src/removed.ts', oldStart: 1, newStart: 0, lines: ['-x'], fileState: 'deleted' });
    p.click(byClass(gone, 'insrc-diffw__path')[0]!.children[0]!);
    for (const m of p.posted) await opener.openCodeRef(m['path'], m['line']);
    const real = realpathSync(join(root, 'src', 'foo.ts'));
    assert.deepEqual(opened, [{ path: real, line: 2 }, { path: real, line: 3 }], 'the existing file opens at each line');
    assert.equal(warnings.length, 1, 'the deleted file is refused and logged');
    assert.match(warnings[0]!, /not a file inside the workspace/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  // The group the opened file lands in is the review pane's rule (the opener's column is reviewColumn() ?? Beside),
  // which link-opener.test.ts pins in extension.ts.
});
