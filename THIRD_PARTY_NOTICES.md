# Third-party notices

insrc includes ideas and wording adapted from the following open-source project.

## Ponytail

- Source: https://github.com/DietrichGebert/ponytail
- Used in: the "smallest complete change" rules that the build step adds to its implement
  prompts (`src/prompts/build/implement-task.md` and `renderStandaloneImplementPrompt`) and
  that the `design.story` workflow adds to its alternatives prompt. The ladder (does it need
  to exist, is it already in the codebase, the standard library or a platform feature, an
  installed dependency, one line, otherwise the minimum) is adapted from Ponytail's skill
  prompt. The wording is insrc's own; the code is not copied.
- The rules live in `src/workflow/runners/scope-prompts.ts` (`SMALLEST_CHANGE_RULE` and
  `SMALLEST_SHAPE_RULE`).

Ponytail's licence, reproduced as it appears in its repository:

MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
