/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Framework-level contract reminder footer.
 *
 * Single-sourced across the Context Builder shaper (appended to the
 * shaper's system prompt at message-build time AND rendered at the
 * tail of the assembled Markdown that downstream prompts see) and
 * the Plan Builder (stamps the same reminder into planner + task
 * prompts so the LLM sees identical citation guidance everywhere).
 *
 * Editing this string is a framework-level change -- every shaper +
 * planner output that references citation shapes depends on it. The
 * exact wording is intentionally short; longer rationale lives in
 * the framework design doc.
 *
 * See: design/analyze-framework.md "Citations -- canonical shape"
 *      design/analyze-context-builder.md "The bundle"
 */
export const CONTRACT_FOOTER_MD = `## Contract reminder
- Cite every claim. Use \`{ kind: 'source', file, lineStart, lineEnd }\` for source excerpts, \`{ kind: 'entity', entityId }\` for indexer-known code entities, \`{ kind: 'document', entityId, file }\` for whole-doc citations, \`{ kind: 'section', entityId, file, heading, lineStart, lineEnd }\` for section-level doc citations, \`{ kind: 'doc', url, anchor? }\` for external references.
- No free text outside the structured JSON output.`;
