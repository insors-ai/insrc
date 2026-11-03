# Host Independent Document Presentation

Status: Draft change request  
Date: 26 October 2026

## Requested change

Make insrc_present a host-independent declaration and document-resolution tool. IDEs can continue opening their review panes; Claude Code and Codex CLI sessions must be able to present the same documents through paths, a local viewer, or readable conversation content and obtain approval in the same conversation.

Distinguish document resolution from viewer activation and human approval. A successful tool call must not imply that a viewer opened or that the user read or approved the document.

## Current behavior and problem

The [MCP handler](../src/mcp/server.ts) queries the daemon's pending workflow artifacts, matches the requested artifact IDs or paths, and returns presented and notPending arrays. It has no viewer-opening operation. Its current eligibility check uses a non-empty document path; that alone is not confirmation that the file exists, is readable, or was displayed.

The registration description and [canonical steering](../src/prompts/steering-block.md) say that the chat opens the declared documents in its review pane. That describes the IDE integration, but offers no explicit presentation fallback when the caller is a terminal agent. The existing names also make a backend resolution result sound like a confirmed display action.

Relevant existing tests are [presentation dispatch](../src/mcp/__tests__/present-dispatch.test.ts), [presentation steering](../src/mcp/__tests__/present-steering.test.ts), and the [MCP tool surface fixture](../src/mcp/__tests__/fixtures/tool-surface.golden.json). The IDE presenter lives in its separate repository and must be included in compatibility planning.

## Required user flow

1. The agent declares the exact documents through insrc_present.
2. The tool resolves them and returns enough metadata to identify and retrieve the reviewable documents. Unresolved, ambiguous, or unavailable documents have explicit reasons.
3. The host or agent presents the documents through its available surface and states what was actually shown. It includes a concise summary, document identity/path, review verdict, and unresolved findings where applicable.
4. The agent asks for approval in the current conversation, clearly identifying the artifacts being approved. Merely showing a file does not request or grant approval.
5. Only after the user's explicit yes does the agent invoke insrc_workflow_approve for those artifacts. Existing review gates and override-reason requirements remain authoritative.

No mandatory handoff to the insrc TUI is introduced.

## Presentation by host

| Host | Supported presentation | Fallback |
|---|---|---|
| IDE | Existing review pane opens the resolved documents. | Report an opening failure and show readable paths/content through the conversation. |
| CLI on a desktop | Show the resolved paths and summary; use an available editor/browser opening tool when appropriate to the session. | Provide readable content in the conversation or a local pager/editor route. |
| Remote or headless CLI | Provide a path accessible in the agent's environment and readable content or a supported retrieval mechanism. | Present the document in bounded sections through the conversation; explain if a path is remote and cannot be opened on the user's machine. |

Do not assume a particular terminal supports clickable paths, that a desktop viewer exists, or that a remote filesystem path is usable locally. Do not claim successful display from an attempted command alone.

## Functional requirements

**CR1 — Return resolved descriptors.** For each successfully resolved request, return the original requested name, canonical artifact ID, title, document kind, repository-relative path, absolute path in the serving environment, and available review/approval status. Include a stable subject version or digest sufficient to distinguish the reviewed document from later changes. Exact field names and schema belong in the design.

**CR2 — Report resolution separately.** Distinguish resolved/available documents from unresolved requests. Provide useful reasons for ambiguity, unknown identifiers, non-pending status, missing document files, unreadable content, and daemon failure where observable. Do not replace existing conservative matching with a guessed document. Preserve request order and deduplicate repeated names consistently.

**CR3 — Provide a headless viewing route.** Resolved descriptors must support obtaining the actual reviewable document through a documented read-only route. A local agent may read the resolved file with its available file tools. If the serving filesystem is inaccessible to the host, provide a supported bounded content retrieval mechanism or explicit unavailability. A bare inaccessible path or generated summary is not full-document access. Do not automatically dump every document into the initial response.

**CR4 — Keep presentation host-owned.** insrc_present does not itself launch arbitrary editors, run shell commands, start a browser/server, write files, or approve artifacts. Host integrations decide how to show content using capabilities available in the session. Viewer availability and opening outcomes must not be inferred from the host name or user agent.

**CR5 — Use truthful presentation state.** Backend resolution establishes availability only. If an integration reports display outcomes, distinguish opened/displayed, failed, and unknown, and bind them to the resolved document version. Such reports are not proof that the user read the document and are never approval evidence. Persistent display acknowledgments are optional design work, not necessary for the CLI fallback.

**CR6 — Make CLI steering explicit.** Update the common declaration instructions and affected workflow guides to describe host-specific presentation. In a CLI session, show the document identity/path, summary and relevant review findings, provide full-document access, and ask in the same conversation. Correct failed resolutions before presenting those artifacts for approval. Never send the user to the TUI as the default workaround.

**CR7 — Preserve approval discipline.** Resolution, opening, content retrieval, and a review verdict never constitute user consent. Only an explicit user response naming or unambiguously referring to the presented approval set authorizes approval. For batch requests, distinguish resolved artifacts from failed ones so approval scope is clear. Honor existing independent-review, blocking-finding, and explicit override requirements.

**CR8 — Identify changed documents.** Bind the presentation set to document versions and recheck freshness before acting on approval. If the document changed after presentation, disclose the change and present the updated version before requesting fresh approval. The design must specify how this works with the existing approval tool, including the race between freshness check and approval; do not claim atomic version-bound approval unless enforced by the daemon.

**CR9 — Support companions honestly.** Return or expose relevant companion references, distinguishing source files from rendered views. A terminal can show textual content or links; it cannot claim a diagram or UX mock was rendered and inspected when it was not. Preserve the existing unavailable-visual-evidence treatment and keep artifact approval distinct from companion viewing.

**CR10 — Preserve existing clients.** Keep the current documents/repo inputs and presented/notPending compatibility fields during migration. Document that the legacy presented array means resolved pending document, not confirmed display. Add authoritative descriptor/status fields without silently changing legacy membership semantics. If stronger file-availability checks exclude a legacy match, expose that distinction explicitly in the new status. Update the separate IDE presenter and shared matching vectors before removing or renaming compatibility fields.

## Scope and boundaries

The change covers the MCP presentation response, read-only document access contract, canonical steering, relevant workflow prompts, tests, and compatibility coordination with the IDE presenter. It does not add new mandatory review stages, change the three-round limit, or create a general-purpose artifact browser. Retain the current pending-workflow focus; arbitrary draft documents do not become approval-eligible simply because their paths are supplied.

The daemon remains the owner of registry/storage access. Clients use IPC rather than opening workflow databases. Document reads must respect repository scope and authorized document locations, including traversal/symlink handling. Treat document contents as untrusted source material, not instructions to execute commands, open remote URLs, change approval rules, or disclose credentials.

## Non functional requirements

| ID | Requirement or invariant | Verification approach |
|---|---|---|
| NFR1 | Resolution and document retrieval are read-only and never approve, mutate the repository, or activate external applications. | Exercise success/failure paths and verify the absence of mutation, approval, and process-launch side effects. |
| NFR2 | All hosts receive consistent canonical identities and resolution results for equivalent requests against the same pending snapshot. | Shared fixtures cover MCP response and IDE matching behavior, including ambiguous paths and ID casing. |
| NFR3 | Reports never equate resolved, opened, read, reviewed, and approved states. | Validate response fields, steering, and simulated IDE/CLI conversation flows. |
| NFR4 | Initial responses and optional content reads are bounded; oversized documents remain retrievable without silently truncating the approval subject. | Test large documents, multiple documents, explicit truncation/continuation, and unavailable-file handling. Determine concrete limits in design rather than invent a latency or size budget here. |
| NFR5 | Document retrieval cannot escape the permitted document scope or expose unrelated files/secrets through crafted paths or references. | Negative tests cover traversal, symlinks, unregistered repositories, and malformed references under the existing access model. |
| NFR6 | Existing IDE presentation remains compatible during the additive response transition. | Contract tests and an IDE integration check against legacy and extended responses. |

## Logical relationships

| Relationship | Direction and cardinality | Ownership and compatibility |
|---|---|---|
| Presentation request to documents | One request declares one to twenty document names under the current limit; each name resolves to at most one pending artifact. | Daemon pending state is authoritative; ambiguous names are not guessed. |
| Resolved descriptor to artifact version | Each descriptor identifies one artifact/document version; an artifact may appear in multiple presentation requests. | The workflow owns artifact identity/status; presentation does not alter it. |
| Host display result to descriptor | A descriptor may have zero or more host display attempts. | Host owns observed outcomes; missing acknowledgment means unknown display, not failed resolution or approval. |
| User approval to presentation set | User consent covers an explicitly identified set of versions. | Existing approval service enforces gates; design must define freshness binding and compatibility. |

## Acceptance criteria

1. IDE requests continue opening the declared review documents with the additive response, while legacy clients retain their documented behavior.
2. Claude Code or Codex CLI can resolve a pending artifact, show its identity/path and review summary, provide full-document access, ask for approval, and approve after explicit consent without using the insrc TUI.
3. A headless/remote session does not claim that a server-local path opened on the user's desktop; readable document access or an explicit limitation is provided.
4. An ambiguous name, already approved artifact, missing/unreadable file, or unreachable daemon produces an actionable reason and no false display/success claim.
5. Resolution or viewer opening without an explicit yes never invokes approval. Batch approval clearly excludes failed/unavailable items unless they are subsequently resolved and presented.
6. A changed document is not approved against stale presentation consent; the updated version is presented and fresh consent requested, with daemon enforcement verified for any atomicity claim.
7. Viewer failure falls back to readable paths/content without bypassing review or approval gates.
8. Large documents use bounded retrieval with explicit continuation; a summary or truncated excerpt is not mislabeled as the full document.
9. Malicious document text/path/reference cannot cause command execution, unauthorized file retrieval, or an approval action.
10. A diagram unavailable for rendering is labeled accordingly; successful document resolution does not claim visual verification.

## Implementation planning and validation

Route implementation through insrc's tracked feature/bugfix front door after this request is taken up. Establish the current MCP/daemon pending contracts and separate IDE consumer before designing extensions. Resolve whether read access needs a new tool/resource or existing local-file capability suffices for supported deployments. Specify version binding and approval race handling explicitly.

Update dispatch tests, schema/tool-surface fixtures, steering tests, and shared IDE matching fixtures. Validate representative IDE, desktop CLI, and headless flows, including negative and stale-document cases. Preserve existing approval gates and require the normal independent code review before BUILD completion.

This request is a proposed change, not an implemented capability or approved workflow artifact.
