<!-- insrc:artifact ISSUE-738d62b848fd173f -->

# Fix Claude on Ollama and Mistral Vibe streaming reviews

## Reproduction

Set the daemon core tier to ollama-claude with glm-5.3:cloud and high effort, then start an independent design review. The review selects the model but planning ends with NATIVE_CLI_FAILURE and pauses after the initial dispatch and three retries. A local fake Claude executable reproduces the dispatch difference. Bounded review receives the Ollama endpoint and auth, strips the vendor login environment and runs one preflight. Activity-mode review passes the same model argument, receives neither Ollama launch setting and skips preflight. The checkpoint stores a generic CLI failure, so the exact backend response is unavailable.

**Mistral Vibe.** Configure the core and mid tiers to use Mistral Large 4 via Mistral Vibe. The installed insrc Vibe catalog does not include the versioned Large 4 model that Mistral documents. Explicit selection of an uncataloged model is refused before a Vibe turn starts. Separately, the activity-mode review entry point rejects Vibe before dispatch, so a catalog entry alone cannot enable independent reviews.

## Root cause

The activity-mode review branch spawns Claude directly through the process-group runner. It bypasses both the preflight and the per-child Ollama environment applied by the bounded Claude path. An Ollama model selection therefore does not bind the child to Ollama, and the child can inherit vendor routing or credentials.

Vibe has an existing bounded review path. The streaming path has Claude and Codex implementations and explicitly rejects Vibe. Explicit Vibe selection also requires a matching entry in the shared model catalog and a verified model and effort in the installed Vibe runtime.

## Fix intent

Preserve Ollama preflight and per-child routing and auth in streaming review while preserving normal Claude and Codex behavior. Validate the endpoint, model and hosting before dispatch. Test that an Ollama-targeted activity child uses the expected environment, does not inherit vendor routing, and is never spawned after preflight rejection. Keep existing daemon retry and structured-output behavior.

Deliver Vibe streaming review in the same change. Preserve the read-only review tool policy, structured feedback validation, activity tracking, cancellation and resumable checkpoint semantics. Add the exact Mistral Large 4 entry to the shared Vibe model catalog with only verified effort values. Verify both catalog resolution and native session readback for the requested model and supported effort, including core and mid tier configurations. Exercise both provider paths through independent review and verify that unsupported model or effort settings fail before model dispatch.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:611`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:803`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:825`
- **[[c4]]** `stakeholder` `Observed design-review failure and local bounded-versus-activity subprocess reproduction`
- **[[c5]]** `code` `src/assets/models/cloud-model-catalog.json:43`
- **[[c6]]** `code` `src/shared/vibe-session.ts:382`
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts:642`
- **[[c8]]** `doc` `https://docs.mistral.ai/vibe/code/cli/configuration`
