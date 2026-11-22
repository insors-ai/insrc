/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SecurityLocator (LLD s1 t2, standalone Story add-securityfinding-capability-
 * family-delegates-framing): a structural subtype of the review framework's
 * Locator (artifact-core/types.ts:271-274), adding trust-boundary id and
 * taint-path step index as first-class fields, following the same open-
 * Locator-kind extensibility pattern (a string-typed `kind` field, read
 * structurally rather than via exhaustive switch).
 *
 * RESOLVED: extends Locator, never a separate SecurityPointer. Pointer
 * (artifact-core/types.ts:277-281) already composes a file path with an
 * optional Locator-shaped `section`, and TypeScript's structural typing lets
 * a SecurityLocator (a structural superset of Locator) occupy `Pointer.section`
 * wherever a Locator is expected -- no change to Locator or Pointer themselves.
 * A security-graph citation needing both a file path and a region is simply
 * `Pointer{ path, section: SecurityLocator, contentHash? }`.
 */

import type { Locator } from '../artifact-core/types.js';

export interface SecurityLocator extends Locator {
	readonly trustBoundaryId?:    string | undefined;
	readonly taintPathStepIndex?: number | undefined;
}
