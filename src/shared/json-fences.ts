/**
 * Strip markdown code fences from a JSON-emitting LLM response.
 *
 * Shared helper used by every module that JSON.parses LLM output.
 * The implementation is lenient: it tolerates BOTH matched fence
 * pairs (` ```json ... ``` `) AND truncated single-sided fences
 * (a leading ` ```json ` with no closer, which happens when the
 * model bumps maxTokens or when a streaming response gets cut).
 *
 * Earlier copies of this lived locally in three places:
 *   - agent/classify/index.ts (lenient)
 *   - agent/classify/scope.ts (lenient)
 *   - daemon/skills/built-ins/code.meta.select-scope.ts (strict --
 *     required a matched pair, dropped single-sided open fences)
 *   - daemon/skills/built-ins/data.meta.select-scope.ts (strict)
 *
 * The strict variants caused the live "JSON parse failed:
 * Unexpected token '`'" warning on 2026-05-11 -- the LLM emitted
 * an opening ` ```json ` with no closer and the skills' regex
 * fell back to returning the raw text, including the fence.
 * Phase A.3 of plans/intent-funnel-followups.md consolidates
 * everything on the lenient version.
 *
 * No throw, no fallback errors -- if the text doesn't start with a
 * fence we return it trimmed and pass through. The caller's
 * JSON.parse is the one that surfaces malformed content.
 */
export function stripJsonFences(text: string): string {
	let out = text.trim();
	if (out.startsWith('```')) {
		out = out
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/\s*```$/, '');
	}
	return out.trim();
}
