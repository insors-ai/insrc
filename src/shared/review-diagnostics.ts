/** Host-owned output diagnostics. Never an alternative review-result protocol. */
export interface ReviewValidationIssue {
 readonly code: string;
 readonly field: string;
 readonly correction: string;
 readonly message?: string | undefined;
}
export interface ReviewDiagnosticSnapshot {
 readonly provider: 'claude' | 'codex' | 'vibe';
 readonly issues: readonly (ReviewValidationIssue & { readonly occurrences: number })[];
 readonly terminal?: { readonly reason: string; readonly exitCode?: number | undefined; readonly message?: string | undefined } | undefined;
 readonly lastRejectedFeedback?: { readonly preview: string; readonly truncated: boolean } | undefined;
 readonly truncated?: boolean | undefined;
}
export class ReviewOutputFailureError extends Error {
 constructor(message: string, readonly diagnostic: ReviewDiagnosticSnapshot, cause?: unknown) {
  super(message, cause === undefined ? undefined : { cause });
  this.name = 'ReviewOutputFailureError';
 }
}

/** Cut on a UTF-8 boundary. Byte limits, unlike JS string length, bound storage. */
export function diagnosticText(text: string, maxBytes: number): string {
 const bytes = Buffer.from(text);
 if (bytes.length <= maxBytes) return text;
 let end = maxBytes;
 while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
 return bytes.subarray(0, end).toString('utf8');
}

/** One bounded snapshot per native session; callers own task/phase association. */
export class ReviewDiagnosticCollector {
 private readonly value: { provider: 'claude' | 'codex' | 'vibe'; issues: (ReviewValidationIssue & { occurrences: number })[];
  terminal?: ReviewDiagnosticSnapshot['terminal']; lastRejectedFeedback?: ReviewDiagnosticSnapshot['lastRejectedFeedback']; truncated?: boolean };
 constructor(provider: 'claude' | 'codex' | 'vibe') { this.value = { provider, issues: [] }; }
 snapshot(): ReviewDiagnosticSnapshot { return structuredClone(this.value); }
 issue(issue: ReviewValidationIssue): void {
  const bounded = { code: diagnosticText(issue.code, 64), field: diagnosticText(issue.field, 256), correction: diagnosticText(issue.correction, 256),
   ...(issue.message ? { message: diagnosticText(issue.message, 1024) } : {}) };
  if (bounded.code !== issue.code || bounded.field !== issue.field || bounded.correction !== issue.correction || bounded.message !== issue.message) this.value.truncated = true;
  const prior = this.value.issues.find(x => x.code === bounded.code && x.field === bounded.field && x.correction === bounded.correction);
  if (prior) { prior.occurrences = Math.min(Number.MAX_SAFE_INTEGER, prior.occurrences + 1); return; }
  if (this.value.issues.length === 8) { this.value.truncated = true; return; }
  this.value.issues.push({ ...bounded, occurrences: 1 });
 }
 rejected(raw: unknown, allowedFields: readonly string[]): void {
  // Preserve only declared output fields. Never retain arbitrary frame/tool data.
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
  const selected = source ? Object.fromEntries(allowedFields.filter(k => Object.hasOwn(source, k)).map(k => [k, source[k]])) : undefined;
  const encoded = JSON.stringify(selected, (key, value: unknown) => /^(?:thinking|reasoning|prompt|system_prompt|messages)$/i.test(key) ? undefined : value);
  if (encoded === undefined) return;
  const preview = diagnosticText(encoded, 8192), truncated = preview !== encoded;
  this.value.lastRejectedFeedback = { preview, truncated };
  if (truncated) this.value.truncated = true;
 }
 rejectedText(text: string): void {
  // Invalid JSON cannot safely be separated from reasoning/prose. Keep the
  // parse failure, not a verbatim arbitrary assistant message.
  this.value.lastRejectedFeedback = { preview: '', truncated: text.length > 0 };
  if (text.length) this.value.truncated = true;
 }
 terminal(reason: string, message?: string, exitCode?: number): void {
  this.value.terminal = { reason: diagnosticText(reason, 64), ...(message ? { message: diagnosticText(message, 1024) } : {}),
   ...(Number.isSafeInteger(exitCode) ? { exitCode } : {}) };
  if (reason !== this.value.terminal.reason || message !== this.value.terminal.message) this.value.truncated = true;
 }
}
