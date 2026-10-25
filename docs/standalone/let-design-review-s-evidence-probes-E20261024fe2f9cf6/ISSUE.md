<!-- insrc:artifact ISSUE-fe2f9cf6027d2f7d -->

# Let the design review's evidence probes confirm true premises

## Reproduction

Review a DEF whose current-state claims are true and anchored at path:line, on a machine with no ripgrep binary on the daemon's PATH (the case here: `rg` exists only as a shell function, no /opt/homebrew/bin/rg or /usr/local/bin/rg). Observed on DEF-ce99b72065d03b1b, review cycles of 2026-10-24 and 2026-10-25: the verdict is block with 7 to 18 MED findings per round, all 'could not verify', while the same premises verified as LOW in other rounds. The daemon log shows 'review:probe: grep errored on root; skipping' six or more times per review, each with 'Invalid regular expression: /(?i)…/: Invalid group'. Findings read 'the supplied reads omit the complete interface body' for a claim about a whole declaration (for example that TierModel carries only runner, model and effort), and 'the grep is truncated at 50 matches' for an absence or inventory claim. Expected: a true, anchored premise is confirmed (holds), so the review blocks only on premises that do not hold.

## Root cause

Three gaps in the review's deterministic evidence pass make evidence that exists unavailable to the judge. (1) The extract prompt asks for 'ripgrep PATTERNS' (src/workflow/review/extract.ts:102), so the model writes inline-flag patterns such as `(?i)…`. runGrepSearch tries ripgrep first (src/daemon/tools/builtins/search/grep.ts:109, invoked as plain `rg` at src/daemon/tools/builtins/search/grep.ts:259) and, when no ripgrep binary is on the daemon's PATH, falls back to compiling the pattern as a JavaScript RegExp (src/daemon/tools/builtins/search/grep.ts:125), which rejects `(?i)` as an invalid group. runGrep in the probe catches that per root and skips it (src/workflow/review/probe.ts:70), so the claim gets an empty result. (2) runRead (src/workflow/review/probe.ts:162) returns only the single anchored line (src/workflow/review/probe.ts:174), so a premise about a whole declaration or block can never be confirmed from its read. (3) Every grep keeps at most MATCH_CAP = 50 matches across all roots (src/workflow/review/probe.ts:27, enforced at src/workflow/review/probe.ts:58) and is then marked truncated, so the judge treats inventory and absence claims as unverifiable. Each gap turns a true premise into 'could not verify', which blocks a DEF at MED.

## Fix intent

A premise that is true and anchored can be confirmed by the review: a probe pattern written in ripgrep syntax (including inline flags such as `(?i)`) searches the same way whether or not a ripgrep binary is installed, and a pattern that cannot run is reported to the judge as not run rather than as an empty result; a read can show the judge enough of the anchored declaration or block to confirm a claim about it; and a grep's result tells the judge whether it covered every match, so an absence or inventory claim is judged on complete results or explicitly marked incomplete. The other callers of the shared search backend (the analyzer's text search and config trace) keep their current behaviour except for gaining the same pattern support. The review's verdict rules are unchanged.

## Citations

- **[[c1]]** `code` `src/workflow/review/probe.ts:27` — "const MATCH_CAP = 50;"
- **[[c2]]** `code` `src/workflow/review/probe.ts:70` — "log.warn({ pattern, root: root.path, err: msg }, 'review:probe: grep errored on root; skipping');"
- **[[c3]]** `code` `src/workflow/review/probe.ts:174` — "return { anchor, found: true, line };"
- **[[c4]]** `code` `src/daemon/tools/builtins/search/grep.ts:125` — "const regex = new RegExp(opts.pattern, flags);"
- **[[c5]]** `code` `src/daemon/tools/builtins/search/grep.ts:259` — "const argv = [opts.rgCommand ?? 'rg', '--no-heading', '--line-number', '--color=never'];"
- **[[c6]]** `code` `src/workflow/review/extract.ts:102` — "`greps`: ripgrep PATTERNS (regex, passed as argv — no shell)"
- **[[c7]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "review cycle 2 round 3: block, 0 HIGH / 16 MED, all could-not-verify; approved with override 2026-10-25"
- **[[c8]]** `doc` `/tmp/.insrc/daemon.log` — "review:probe: grep errored on root; skipping … err: "Invalid regular expression: /(?i)context.?window|input.?limit|max.?input|context.?limit|context.?length|num_ctx/: Invalid group""
