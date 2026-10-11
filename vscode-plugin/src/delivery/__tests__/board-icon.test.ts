/**
 * The delivery board's own icon: a light/dark SVG pair in media/, used by the
 * insrc.delivery.openBoard command and as the board's editor-tab icon.
 *
 * Run: npx tsx --test vscode-plugin/src/delivery/__tests__/board-icon.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const LIGHT = 'media/insrc-delivery-icon.svg';
const DARK = 'media/insrc-delivery-icon-dark.svg';

test('the delivery board icon pair exists, draws the insrc spiral behind a progress path, and ships in the .vsix', () => {
  for (const f of [LIGHT, DARK]) {
    const svg = read(f);
    assert.match(svg, /^<svg[\s\S]*<\/svg>\s*$/, `${f} is a valid SVG`);
    assert.match(svg, /<g opacity="0\.6">[\s\S]*?<circle /, `${f} carries the insrc spiral at 60% opacity`);
    assert.match(svg, /<path d="M [^"]+" fill="none"/, `${f} draws the progress path`);
    assert.doesNotMatch(svg, /<rect[^>]*(width="100%"|fill="#?f{3,6}")/i, `${f} has no background fill (transparent)`);
  }
  assert.match(read(LIGHT), /stroke="#1a4528"/, 'the light icon draws the path in the insrc dark green');
  assert.match(read(DARK), /stroke="#ffffff"/, 'the dark icon draws the path in white');
  assert.doesNotMatch(read('.vscodeignore'), /^media(\/|\*)/m, '.vscodeignore does not exclude media/');
});

test('the insrc.delivery.openBoard command declares the light/dark icon pair', () => {
  const pkg = JSON.parse(read('package.json')) as {
    contributes: { commands: Array<{ command: string; icon?: { light: string; dark: string } }> };
  };
  const cmd = pkg.contributes.commands.find((c) => c.command === 'insrc.delivery.openBoard');
  assert.ok(cmd, 'the command is contributed');
  assert.deepEqual(cmd.icon, { light: LIGHT, dark: DARK });
});

test('extension.ts hands the board the icon pair as its tab icon', () => {
  const ext = read('src/extension.ts');
  const block = /registerDeliveryBoard\(\{([\s\S]*?)\n  \}\);/.exec(ext);
  assert.ok(block, 'the delivery board is registered');
  const b = block![1]!;
  assert.match(b, /tabIcon: \{\s*light: vscode\.Uri\.file\(join\(context\.extensionPath, 'media', 'insrc-delivery-icon\.svg'\)\),\s*dark: vscode\.Uri\.file\(join\(context\.extensionPath, 'media', 'insrc-delivery-icon-dark\.svg'\)\),\s*\}/, 'the light and dark files from media/');
});
