/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Review-only estimates. Native CLI/host history is reserved, never measured or hard-bounded. */
export type ReviewBudgetQualification = 'managed-estimate' | 'reserved-native' | 'controller-reserved';
export type ReviewSchemaDialect = 'json-v1' | 'codex-strict-v1' | 'controller-json-v1';
export type ReviewExecutionKind = 'structured' | 'reviewer-session' | 'controller';

/** Pure serializable provider preparation; one immutable copy belongs to each job. */
export interface ReviewProviderBudgetProfile {
	readonly profileVersion: 1;
	readonly providerId: string;
	readonly transport: string;
	readonly transportVersion: string;
	readonly schemaDialect: ReviewSchemaDialect;
	readonly promptDialect: 'cli-text-v1' | 'ollama-chat-v1' | 'controller-frame-v1';
	readonly qualification: ReviewBudgetQualification;
	/** Serialized declared tool manifest, including observable wire framing. */
	readonly declaredToolsJson: string;
	/** Known native context size (or controller-declared size); only lowers admission. */
	readonly contextWindowTokens?: number | undefined;
	readonly nativeReserveTokens: number;
	readonly transportReserveTokens: number;
	readonly completionReserveTokens: number;
	readonly inspectionReserveTokens: number;
}

export interface ReviewBudgetPolicy {
	readonly policyVersion: 1;
	readonly estimatorVersion: 'chars-per-token-v1';
	readonly charsPerToken: 3;
	readonly totalTokens: number;
	readonly executionKind: ReviewExecutionKind;
	readonly retryHeadroomChars: number;
	readonly profile: ReviewProviderBudgetProfile;
}

/** Numeric metadata only; the original request and schema are never retained here. */
export interface ReviewBudgetBreakdown {
	readonly limitTokens: number;
	readonly configuredLimitTokens: number;
	readonly promptChars: number;
	readonly promptTokens: number;
	readonly schemaChars: number;
	readonly schemaTokens: number;
	readonly declaredToolsChars: number;
	readonly declaredToolsTokens: number;
	readonly nativeReserveTokens: number;
	readonly transportReserveTokens: number;
	readonly completionReserveTokens: number;
	readonly inspectionReserveTokens: number;
	readonly hostContextReserveTokens: number;
	readonly retryHeadroomTokens: number;
	readonly estimatedTotalTokens: number;
	readonly remainingTokens: number;
	readonly estimatorVersion: 'chars-per-token-v1';
	readonly qualification: ReviewBudgetQualification;
}

/** Required only when an external controller will execute the emitted request. */
export interface ReviewControllerBudgetDeclaration {
	readonly version: 1;
	readonly profile: ReviewProviderBudgetProfile;
	/** Caller estimate of its current conversation. Does not raise the server cap. */
	readonly hostContextReserveTokens: number;
}

export type ReviewBudgetErrorCode =
	| 'invalid-budget-policy' | 'native-budget-unqualified' | 'budget-profile-mismatch'
	| 'review-budget-exceeded' | 'required-context-over-budget'
	| 'dispatch-budget-exceeded' | 'mandatory-context-over-budget' | 'inspection-budget-exceeded' | 'controller-frame-over-budget'
	| 'controller-budget-required' | 'controller-budget-incompatible' | 'review-budget-state-stale';

/** Review-only request metadata. Optional on existing provider calls. */
export interface ReviewExecutionBudget {
	readonly policy: ReviewBudgetPolicy;
	readonly admitted: ReviewBudgetBreakdown;
	readonly outputAllowanceTokens: number;
	readonly reviewId: string;
	readonly callId: string;
	readonly stage: string;
	readonly role: string;
	readonly attempt: number;
}
