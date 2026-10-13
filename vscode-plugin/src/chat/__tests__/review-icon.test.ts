/**
 * Story E202610131f74c81f:S001 t1 — the document review pane's own icon: a light/dark SVG
 * pair in media/, in the style of the delivery board's, declared by the pane's command.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/review-icon.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const LIGHT = 'media/insrc-review-icon.svg';
const DARK = 'media/insrc-review-icon-dark.svg';

test('review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command', () => {
  for (const f of [LIGHT, DARK]) {
    const svg = read(f);
    assert.match(svg, /^<svg[^>]*viewBox="0 0 256 256"[\s\S]*<\/svg>\s*$/, `${f} is a 256x256 SVG`);
    assert.match(svg, /<g opacity="0\.6">[\s\S]*?<circle /, `${f} carries the insrc spiral at 60% opacity`);
    // The glyph, after the spiral: the page, its folded corner and the check mark, each a stroked path with no fill.
    const glyph = svg.slice(svg.lastIndexOf('</g>'));
    const paths = glyph.match(/<path d="M [^"]+" fill="none" stroke="#[0-9a-f]{6}"/g) ?? [];
    assert.equal(paths.length, 3, `${f} draws the page, its corner and the check mark`);
    assert.match(glyph, /<path d="M 76 44 L 152 44 L 188 80 L 188 212 L 76 212 Z"/, `${f} draws a document page`);
    assert.doesNotMatch(svg, /<rect[^>]*(width="100%"|fill="#?f{3,6}")/i, `${f} has no background fill (transparent)`);
    assert.doesNotMatch(svg, /<(script|image|foreignObject)\b|href=/, `${f} is a drawing only`);
  }
  // In the delivery board's two inks, and the same spiral as the board's icon.
  assert.equal((read(LIGHT).slice(read(LIGHT).lastIndexOf('</g>')).match(/stroke="#1a4528"/g) ?? []).length, 3, 'the light icon draws in the insrc dark green');
  assert.equal((read(DARK).slice(read(DARK).lastIndexOf('</g>')).match(/stroke="#ffffff"/g) ?? []).length, 3, 'the dark icon draws in white');
  const spiral = (f: string): string => { const s = read(f); return s.slice(s.indexOf('<g opacity="0.6">'), s.lastIndexOf('</g>')); };
  assert.equal(spiral(LIGHT), spiral('media/insrc-delivery-icon.svg'), "the light spiral is the delivery board icon's");
  assert.equal(spiral(DARK), spiral('media/insrc-delivery-icon-dark.svg'), "the dark spiral is the delivery board icon's");
  assert.notEqual(read(LIGHT), read('media/insrc-delivery-icon.svg'), 'and the icon is its own, not a copy');

  // Ships in the .vsix.
  assert.doesNotMatch(read('.vscodeignore'), /^media(\/|\*)/m, '.vscodeignore does not exclude media/');

  // Declared by the command.
  const pkg = JSON.parse(read('package.json')) as {
    contributes: { commands: Array<{ command: string; icon?: { light: string; dark: string } }> };
  };
  const cmd = pkg.contributes.commands.find((c) => c.command === 'insrc.chat.docsReview');
  assert.ok(cmd, 'the command is contributed');
  assert.deepEqual(cmd.icon, { light: LIGHT, dark: DARK });
  // The delivery board's command keeps its own pair.
  assert.deepEqual(pkg.contributes.commands.find((c) => c.command === 'insrc.delivery.openBoard')?.icon,
    { light: 'media/insrc-delivery-icon.svg', dark: 'media/insrc-delivery-icon-dark.svg' });
});
