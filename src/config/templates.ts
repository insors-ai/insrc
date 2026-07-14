/**
 * Template bootstrapping — create default template files for a language.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../shared/logger.js';

const log = getLogger('config-templates');

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------

const VITEST_UNIT_TEMPLATE = `---
category: template
namespace: tester
language: typescript
name: vitest-unit
tags: [unit, vitest, typescript]
---

# Vitest Unit Test Template

## Structure
- One test file per source module: \`src/foo.ts\` → \`src/__tests__/foo.test.ts\`
- Use \`describe\` blocks to group related tests
- Use \`it\` or \`test\` for individual test cases

## Conventions
- Import the module under test at the top
- Mock external dependencies with \`vi.mock()\`
- Use \`beforeEach\` / \`afterEach\` for setup/teardown
- Assert with \`expect(...).toBe()\`, \`.toEqual()\`, \`.toThrow()\`
- Test both happy path and error cases
- Name tests descriptively: "should [action] when [condition]"
`;

const PYTEST_UNIT_TEMPLATE = `---
category: template
namespace: tester
language: python
name: pytest-unit
tags: [unit, pytest, python]
---

# Pytest Unit Test Template

## Structure
- One test file per source module: \`src/foo.py\` → \`tests/test_foo.py\`
- Use classes to group related tests: \`class TestFoo:\`
- Use functions for individual tests: \`def test_foo_does_bar():\`

## Conventions
- Import the module under test at the top
- Use \`@pytest.fixture\` for shared setup
- Use \`pytest.raises()\` for exception testing
- Use \`unittest.mock.patch()\` or \`pytest-mock\` for mocking
- Name tests descriptively: \`test_[method]_[scenario]_[expected]\`
`;

const GO_UNIT_TEMPLATE = `---
category: template
namespace: tester
language: go
name: go-unit
tags: [unit, testing, go]
---

# Go Unit Test Template

## Structure
- Test file in same package: \`foo.go\` → \`foo_test.go\`
- Test functions: \`func TestFoo(t *testing.T)\`
- Table-driven tests for multiple cases

## Conventions
- Use \`t.Run()\` for subtests
- Use \`t.Helper()\` in test helper functions
- Use \`t.Parallel()\` for parallelizable tests
- Assert with custom helpers or \`testify/assert\`
- Name subtests descriptively
- Use \`t.TempDir()\` for file-based tests
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bootstrap default template files for a language if they don't already exist.
 */
export function bootstrapTemplates(language: string, globalDir: string): void {
  const templates: Record<string, string> = {
    typescript: VITEST_UNIT_TEMPLATE,
    python: PYTEST_UNIT_TEMPLATE,
    go: GO_UNIT_TEMPLATE,
  };

  const template = templates[language];
  if (!template) {
    log.debug({ language }, 'no default template for language');
    return;
  }

  const dir = join(globalDir, 'tester');
  const filename = language === 'typescript' ? 'vitest-unit.md'
    : language === 'python' ? 'pytest-unit.md'
    : 'go-unit.md';
  const filePath = join(dir, filename);

  if (existsSync(filePath)) {
    log.debug({ filePath }, 'template already exists, skipping');
    return;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, template);
  log.info({ filePath }, 'bootstrapped default template');
}
