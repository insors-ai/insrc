/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Internal-shared sc1/sc2 domain. Importing this module activates no services. */
export type * from './types.js';
export { USAGE_SCHEMA_VERSION, USAGE_LIMITS, USAGE_SOURCE_DOMAIN } from './types.js';
export { DefaultUsageReducer, UsageReductionError } from './reducer.js';
export { DefaultUsageAttributionPolicy } from './attribution.js';
export { requireEffectiveOwners } from './ownership.js';
export { canonicalData, canonicalSource, sourceDigest, sameSource, UsageInputError } from './canonical.js';
export { eventSetDigest, validateScope } from './validation.js';
export { validateSourceCapability } from './capabilities.js';
export { ledgerRecordV1Schema, ledgerRecordV1AvroSchema, createUsageAvroType } from './schemas.js';
