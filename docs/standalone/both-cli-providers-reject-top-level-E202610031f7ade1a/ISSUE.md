<!-- insrc:artifact ISSUE-1f7ade1a889013da -->

# Guard structured-output schemas against the cross-vendor top-level union rejection

## Reproduction

Both vendor errors were obtained by running the real binaries, not read from documentation.

Send a structured-output schema whose ROOT is a discriminated union — `{ type: 'object', anyOf: [ {…kind:'sufficient'}, {…kind:'context-needed'} ] }` — through each CLI:

1. `claude --print --output-format json --json-schema '<that schema>'`
   OBSERVED: exit 1, and the envelope carries `is_error: true` with
   `result: "API Error: 400 tools.8.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level"`.
   Note the CLI still reports `subtype: success` and `stop_reason: stop_sequence` alongside `is_error: true`, so the failure is only visible by reading the envelope, not the exit path alone.
2. `codex exec --output-schema <file> --json` with the same schema
   OBSERVED: a `turn.failed` event carrying
   `"Invalid schema for response_format 'codex_output_schema': schema must have type 'object' and not have 'oneOf'/'anyOf'/'allOf'/'enum'"`.

EXPECTED: either the call succeeds, or it fails LOCALLY with an error naming the unsupported shape — before a billed round trip and before a vendor-specific 400 surfaces to a caller who did not write the schema.

EXPOSURE IS LATENT, NOT AN OUTAGE. A repo-wide scan for schema literals with a root-level `anyOf`/`oneOf`/`allOf` found two candidates and neither is provider-bound: the triage classifier's schema is a root `type: 'object'`, and the one genuine root `oneOf` is the hand-mirrored MCP OUTPUT schema, which is validated locally with ajv by a contract test and never passed to a CLI. So nothing is broken today; what is missing is the guard that keeps it that way.

## Root cause

Two separate gaps, and the second is worse than having no guard at all.

FIRST, the constraint is real and CROSS-VENDOR, which means it is a property of the providers rather than of one SDK or one version. Anthropic rejects `oneOf`/`allOf`/`anyOf` at the top level of a tool `input_schema`, which is how the claude CLI forwards a `--json-schema`. OpenAI requires the `response_format` schema to have root `type: 'object'` and to carry no `oneOf`/`anyOf`/`allOf`/`enum`. Two independent vendors, the same prohibition.

SECOND, the codebase contains a helper that LOOKS like protection and is neither wired up nor correct. `normaliseSchemaForAnthropic` has zero references outside its own definition — nothing calls it. And its algorithm cannot work even if called: it stamps `type: 'object'` onto the root and returns, LEAVING the `anyOf`/`oneOf` in place, which is exactly the shape both vendors reject. It also returns the schema untouched whenever `'type' in root` is already true, which is the common case for a hand-written schema. The reproduced schema above carries that very root-type stamp and still fails on both CLIs, so the stamping strategy is disproved rather than merely untested.

The danger of that second gap is specific: a future maintainer finds the helper, reasonably concludes the problem is handled, wires it into the provider path, and ships a call that still fails at the vendor — now with a layer of apparent mitigation in between making the diagnosis harder.

## Fix intent

A structured-output schema that the providers cannot accept should be caught by this codebase, not by a vendor, and the misleading helper should stop implying otherwise.

Deliberately NOT settled here, because this is the decision the fix turns on and the alternatives are not interchangeable:

  - WRAP a root union into an object envelope so the call succeeds. It keeps unions expressible, but it silently changes the payload shape that every consumer and every ajv backstop downstream sees, which is a transform applied behind the caller's back.
  - REJECT a root union locally with an error naming the shape and the vendors that refuse it. Nothing is transformed and the failure is honest and immediate, but any caller that genuinely wants a union must restructure its own schema.

Those should be weighed with their consequences written down, including whether the answer differs per provider. Whichever is chosen, two things should hold: the dead helper must not survive as a false signal of safety — either removed or made real and actually called — and the constraint should be asserted by a test that does NOT require a billed live call, so the guard keeps working in the hermetic sweep.

Out of scope: changing any existing schema. The scan found no provider-bound root union to repair, and the MCP output schema's root `oneOf` is legitimate because it never reaches a CLI.

## Citations

- **[[c1]]** `code` `src/agent/providers/structured-output.ts:341` — "export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:193` — "'--json-schema', JSON.stringify(schema),"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:210` — "const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)]"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:16` — "claude --print --output-format json --json-schema '<inline>'"
- **[[c5]]** `code` `src/docgen/schema.ts` — "RENDERED_DOCUMENT_SHELL_SCHEMA — the hand-mirrored MCP output JSON schema, root oneOf, ajv-validated by a contract test"
- **[[c6]]** `code` `src/workflow/triage/classify.ts` — "Schema = { type: 'object', additionalProperties: false, … }"
- **[[c7]]** `prior-artifact` `commit 617734f — deleted the two live fixtures that probed this shape; both vendor error strings above were captured from those runs and the claude one re-reproduced by hand afterwards`
