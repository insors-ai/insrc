/**
 * Import for its effect: every repository this test file builds counts as converted to the current schema, so the schema guard at
 * the daemon entry points lets its calls through. Each test file runs in its own process, so this reaches that file alone. A test of
 * the guard itself does not import it.
 */

import { _setRepoSchemaGuardForTests } from '../../../daemon/repo-schema-guard.js';

_setRepoSchemaGuardForTests(() => undefined);
