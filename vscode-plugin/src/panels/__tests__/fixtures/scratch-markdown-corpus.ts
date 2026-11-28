export const supportedScratchMarkdown = [
  '# Heading\n\nText with **bold**, *emphasis*, ~~deletion~~ and `inline code`.\n',
  '- one\n- two\n\n1. first\n2. second\n',
  '- loose one\n\n- loose two\n',
  '| A | B |\n| - | - |\n| 1 | 2 |\n',
  '[link](https://example.test/a?b=c) and ![image](assets/a.png)\n',
  'Unicode: 😀 café 漢字\r\n\r\nEscaped \\*literal\\* and [link](file.md).\r\n',
  '```txt\r\nkeep multiline\r\nsecond line\r\n```\r\n',
  '```ts\nconst value = "untouched";\n```\n',
  '```mermaid\ngraph TD\n  A --> B\n```\n',
  '[literal target](insrc://scratchpads/note.md#section)\n',
];
export const unsupportedScratchMarkdown = [
  '---\ntitle: Keep this\n---\n\n# Heading\n',
  '+++\ntitle = "Keep this"\n+++\n\n# Heading\n',
  '<!-- keep comment -->\n\nText\n',
  'Text with <span data-unknown="keep">HTML</span>.\n',
  '[reference][x]\n\n[x]: https://example.test "title"\n',
  '[[future-note#section]]\n',
  '[^footnote]\n\n[^footnote]: retained text\n',
  '::: custom\nMust survive\n:::\n',
];
