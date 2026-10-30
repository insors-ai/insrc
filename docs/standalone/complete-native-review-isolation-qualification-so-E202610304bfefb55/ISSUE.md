<!-- insrc:artifact ISSUE-4bfefb556f0dc560 -->

# Complete native review isolation qualification so activation can succeed

## Reproduction

On installed commit 6693bf60f8f424a65c7bff1d18c22313d9d993db with Claude Code 2.1.310, run one serial control/restricted pair for each source-only and indexed-impact mode. Probe IDs 51a933dd-b081-4e1f-b222-1ba6d19dc85a and 60962171-c7ff-46b4-8dd5-2b2a93339ddb both fail: native init exposes StructuredOutput and cc-plugin-agents-md, cc-plugin-telemetry, cc-plugin-plugin-authoring with builtin provenance. Controls exercise all four synthetic canaries; restricted canaries do not fire. Both restricted processes accept two durable scoped ACKs and are actually cancelled. Independently inspect the runner return: even with no failures it always chooses unsupported/cancelled, exports no candidate, and cannot reach completed qualification. Expected: accurate native capability classification, disabled unwanted customizations, and a reachable qualification result when all approved checks are genuinely proved, followed by real production acceptance and explicit activation signoff.

## Root cause

The shared restricted launch supplies an empty settings object and does not explicitly disable default builtin plugins. The collector treats every non-scoped-MCP tool, including the schema-output mechanism, as a builtin leak and every listed plugin as a customization leak; this conflates inventory entries with their verified capability meaning. More fundamentally runNativeInvestigationProbe computes missing evidence but never constructs a completed candidate: its terminal success branch is unconditionally unsupported. Some required checks (effective configuration provenance, native approval behavior, instruction/customization isolation) have no sufficient evidence producer. Installed export validation can validate a candidate but the real runner cannot produce one. These are diagnosed implementation gaps; absence of canary hits alone is not proof of denial.

## Fix intent

Correct the existing launch/collector/qualification path as one bounded bugfix. Disable unwanted plugins and instruction/hooks through supported session-local controls, preserve CLI OAuth and the scoped MCP bridge, classify any protocol-only schema tool using explicit version-bound evidence rather than blanket exemptions, and reject unknown or executable capabilities. Supply independently checkable evidence for the actual required isolation properties and construct a candidate only when every required property is proven. If a property is unattainable under the existing contract, expose the precise incompatibility and resolve the contract explicitly rather than silently weakening it. Verify negative fixtures, tampering/version/foreign-scope refusal, both serial installed modes, then an actual review through the new engine and a concrete activation handoff. No automatic retries, global credential/config changes, signing keys, automatic activation, or legacy deletion. This fix is incomplete if it only changes failed into unsupported.

## Citations

- **[[c1]]** `code` `src/agent/providers/claude-investigation-session.ts`
- **[[c2]]** `code` `src/agent/providers/claude-investigation-probe.ts`
- **[[c3]]** `code` `src/agent/providers/native-investigation-probe.ts`
- **[[c4]]** `code` `src/daemon/review-investigation-probe-export.ts`
- **[[c5]]** `step-output` `/tmp/inventory-canaries-live-acceptance.json`
- **[[c6]]** `doc` `https://code.claude.com/docs/en/settings-reference#enabledplugins`
- **[[c7]]** `prior-artifact` `.insrc/artifacts/BUILD-3789fd85d0bbeb22-s1.json`
