/** Public v1 contracts. No backend or provider SDK types cross this boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface ProjectBinding { readonly projectId: string; readonly root: string; readonly scopeEpoch: string; }
export interface ModelRequest { readonly role: 'normalize' | 'reconcile' | 'compress' | 'validate'; readonly input: Json; readonly schema: Json; readonly signal: AbortSignal; }
export interface ModelPort { complete(request: ModelRequest): Promise<Json>; embed(text: string, signal: AbortSignal): Promise<readonly number[]>; readonly embeddingModel: string; readonly embeddingDimension: number; }
export interface HostPolicy { bind(projectId: string, sessionId?: string | undefined): Promise<ProjectBinding>; admit(binding: ProjectBinding, event: Json): Promise<Json>; }
export interface MemoryLogger { write(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, string | number | boolean>): void; }
export interface MemoryLimits { readonly maxEventBytes: number; readonly maxPendingBytes: number; readonly segmentBytes: number; readonly modelTimeoutMs: number; }
export interface MemoryOptions { readonly dataDirectory: string; readonly models: ModelPort; readonly policy: HostPolicy; readonly logger: MemoryLogger; readonly limits: MemoryLimits; }
export interface DrainResult { readonly completed: boolean; readonly pending: number; }
export interface MemoryLifecycle { ready(): Promise<void>; drain(deadlineMs: number): Promise<DrainResult>; close(): Promise<void>; }
export interface MemoryFactory { open(options: MemoryOptions): Promise<MemoryService>; }
export type OperationState = 'accepted' | 'processing' | 'committed' | 'failed' | 'quarantined' | 'cleanup-pending';
export interface Scope { readonly projectId: string; readonly sessionId?: string | undefined; readonly branch?: string | undefined; readonly environment?: string | undefined; }
export interface SourceIdentity { readonly producerId: string; readonly eventId: string; readonly sessionId: string; readonly turnId: string; readonly sourceVersion: string; }
export interface MemoryCommand { readonly version: 1; readonly scope: Scope; readonly source: SourceIdentity; readonly kind: 'capture' | 'correct' | 'forget' | 'resolve' | 'maintenance' | 'delivery'; readonly payload: Json; readonly expectedRevision?: string | undefined; }
export interface OperationReceipt { readonly operationId: string; readonly eventId: string; readonly state: OperationState; readonly generation?: string | undefined; readonly errorCode?: string | undefined; }
export interface ReadRequest { readonly scope: Scope; readonly budgetTokens: number; readonly afterOperationId?: string | undefined; readonly deadlineMs?: number | undefined; }
export interface SearchRequest extends ReadRequest { readonly query: string; readonly limit: number; }
export interface InspectRequest { readonly scope: Scope; readonly memoryId: string; }
export interface MemoryView { readonly id: string; readonly revision: string; readonly kind: string; readonly text: string; readonly status: string; readonly sourceIds: readonly string[]; }
export interface ContextResult { readonly generation: string; readonly items: readonly MemoryView[]; readonly overflow: boolean; readonly degraded: boolean; }
export interface OperationRequest { readonly scope: Scope; readonly operationId: string; }
export interface MemoryService extends MemoryLifecycle { submit(command: MemoryCommand): Promise<OperationReceipt>; context(request: ReadRequest): Promise<ContextResult>; search(request: SearchRequest): Promise<ContextResult>; inspect(request: InspectRequest): Promise<Json>; operation(request: OperationRequest): Promise<OperationReceipt>; }
export type MemoryFailureCode = 'INVALID_REQUEST' | 'UNBOUND_PROJECT' | 'POLICY_DENIED' | 'BACKPRESSURE' | 'NOT_READY' | 'UNSUPPORTED_VERSION' | 'OWNERSHIP_CONFLICT' | 'REVISION_CONFLICT' | 'STORE_UNAVAILABLE' | 'CONTEXT_OVERFLOW' | 'DEADLINE_EXCEEDED';
export interface MemoryFailure { readonly code: MemoryFailureCode; readonly retryable: boolean; readonly operationId?: string | undefined; }
