# codex strict-mode keyword probe — ISSUE-487ad7a67474d321

Establishes which JSON Schema keywords the codex CLI's strict `--output-schema` accepts. It is the source of `CODEX_REFUSED_KEYWORDS` and `CODEX_FORMATS` in `src/agent/providers/structured-output.ts`.

## Method

- Run on 2026-10-18 (local time) against the installed `codex` CLI, through `CliProvider({ kind: 'codex' })` at the commit before this fix. That path sent the schema after `processSchemaForOpenAIStrict` only, so nothing was stripped.
- One probe per keyword: an object schema with a single property `x` carrying the keyword. Prompt: "Emit the smallest valid JSON object matching the schema."
- Probes ran serially.
- **Refused** means codex returned 400 `invalid_json_schema` "... is not permitted when strict is true".
- **No answer** means codex started the turn and never answered. The call was killed after 2 minutes, then 4 minutes on the re-run, and reported "codex emitted no agent_message item".

## Probe script (`/tmp/probe-keywords.mts`)

```ts
import { CliProvider } from '/Users/subhagho/work/projects/insors/insrc/src/agent/providers/cli-provider.js';
// One probe per keyword: a minimal object schema whose property `x` carries it.
const S = (x: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: 'object', properties: { x }, ...extra });
const probes: Record<string, unknown> = {
	uniqueItems:       S({ type: 'array', items: { type: 'string' }, uniqueItems: true }),
	minItems:          S({ type: 'array', items: { type: 'string' }, minItems: 1 }),
	maxItems:          S({ type: 'array', items: { type: 'string' }, maxItems: 3 }),
	contains:          S({ type: 'array', items: { type: 'string' }, contains: { type: 'string' } }),
	prefixItems:       S({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'string' } }),
	minLength:         S({ type: 'string', minLength: 1 }),
	maxLength:         S({ type: 'string', maxLength: 50 }),
	pattern:           S({ type: 'string', pattern: '^[a-z]+$' }),
	'format:date-time':S({ type: 'string', format: 'date-time' }),
	'format:uri':      S({ type: 'string', format: 'uri' }),
	'format:email':    S({ type: 'string', format: 'email' }),
	minimum:           S({ type: 'integer', minimum: 0 }),
	maximum:           S({ type: 'integer', maximum: 9 }),
	exclusiveMinimum:  S({ type: 'number', exclusiveMinimum: 0 }),
	multipleOf:        S({ type: 'integer', multipleOf: 2 }),
	const:             S({ type: 'string', const: 'a' }),
	enum:              S({ type: 'string', enum: ['a', 'b'] }),
	default:           S({ type: 'string', default: 'a' }),
	description:       S({ type: 'string', description: 'a thing' }),
	title:             S({ type: 'string', title: 'X' }),
	examples:          S({ type: 'string', examples: ['a'] }),
	not:               S({ type: 'string', not: { const: 'b' } }),
	allOf:             S({ allOf: [{ type: 'string' }] }),
	anyOf:             S({ anyOf: [{ type: 'string' }, { type: 'null' }] }),
	'if/then/else':    S({ type: 'string', if: { const: 'a' }, then: { minLength: 1 }, else: { minLength: 1 } }),
	patternProperties: S({ type: 'object', properties: { a: { type: 'string' } }, patternProperties: { '^b': { type: 'string' } } }),
	propertyNames:     S({ type: 'object', properties: { a: { type: 'string' } }, propertyNames: { pattern: '^[a-z]+$' } }),
	minProperties:     S({ type: 'object', properties: { a: { type: 'string' } }, minProperties: 1 }),
	maxProperties:     S({ type: 'object', properties: { a: { type: 'string' } }, maxProperties: 3 }),
	'$defs/$ref':      S({ $ref: '#/$defs/s' }, { $defs: { s: { type: 'string' } } }),
	'type:[string,null]': S({ type: ['string', 'null'] }),
	'dictionary(additionalProperties schema)': S({ type: 'object', additionalProperties: { type: 'string' } }),
};
const only = process.argv.slice(2);
const p = new CliProvider({ kind: 'codex' });
for (const [kw, schema] of Object.entries(probes)) {
	if (only.length > 0 && !only.includes(kw)) continue;
	const t = Date.now();
	try {
		const r = await p.completeStructured([{ role: 'user', content: 'Emit the smallest valid JSON object matching the schema. Schema probe.' }], schema as never);
		console.log(`ACCEPTED ${kw} (${Date.now() - t} ms) ${JSON.stringify(r).slice(0, 80)}`);
	} catch (e) {
		const m = String((e as Error).message);
		console.log(`REFUSED  ${kw} (${Date.now() - t} ms) ${m.match(/Invalid schema[^"\\]*/)?.[0] ?? m.slice(0, 300)}`);
	}
}
process.exit(0);
```

## Raw results, first run (debug log lines removed)

```
REFUSED  uniqueItems (3978 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.uniqueItems' is not permitted when strict is true.
ACCEPTED minItems (6648 ms) {"x":[""]}
ACCEPTED maxItems (6899 ms) {"x":[]}
REFUSED  contains (3335 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.contains' is not permitted when strict is true.
ACCEPTED prefixItems (5914 ms) {"x":[""]}
ACCEPTED minLength (5742 ms) {"x":":)"}
ACCEPTED maxLength (5953 ms) {"x":""}
ACCEPTED pattern (7283 ms) {"x":"ok"}
ACCEPTED format:date-time (7015 ms) {"x":"1764-11-29T05:43:59Z"}
REFUSED  format:uri (342562 ms) codex emitted no agent_message item
REFUSED  format:email (122561 ms) codex emitted no agent_message item
ACCEPTED minimum (6704 ms) {"x":0}
ACCEPTED maximum (6000 ms) {"x":0}
REFUSED  exclusiveMinimum (122264 ms) codex emitted no agent_message item
ACCEPTED multipleOf (133260 ms) {"x":0}
ACCEPTED const (16952 ms) {"x":"a"}
ACCEPTED enum (6423 ms) {"x":"a"}
ACCEPTED default (6795 ms) {"x":""}
ACCEPTED description (9146 ms) {"x":""}
ACCEPTED title (6525 ms) {"x":""}
ACCEPTED examples (6531 ms) {"x":""}
REFUSED  not (2688 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.not' is not permitted when strict is true.
REFUSED  allOf (2803 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.allOf' is not permitted when strict is true.
ACCEPTED anyOf (6397 ms) {"x":null}
REFUSED  if/then/else (2774 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.if' is not permitted when strict is true.
ACCEPTED patternProperties (7735 ms) {"x":{"a":""}}
REFUSED  propertyNames (3460 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.propertyNames' is not permitted when strict is true.
REFUSED  minProperties (2850 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.minProperties' is not permitted when strict is true.
REFUSED  maxProperties (3380 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.maxProperties' is not permitted when strict is true.
ACCEPTED $defs/$ref (5813 ms) {"x":""}
ACCEPTED type:[string,null] (8493 ms) {"x":null}
REFUSED  dictionary(additionalProperties schema) (2722 ms) Invalid schema for response_format 'codex_output_schema': 'schema.properties.x.properties' is required for object schemas.
```

## Re-run of the slow probes (4-minute cap)

```
REFUSED  format:uri (240497 ms) codex emitted no agent_message item
REFUSED  format:email (242108 ms) codex emitted no agent_message item
ACCEPTED exclusiveMinimum (8020 ms) {"x":0.0033}
ACCEPTED multipleOf (5762 ms) {"x":0}
```

`multipleOf` did not finish its re-run before the probe was stopped. It was accepted in the first run, so it is kept. `exclusiveMinimum` got no answer in the first run but was accepted in the re-run, so it is kept.

## `format: uri` run directly against codex (45 s)

Command: `echo 'Emit the smallest valid JSON object matching the schema. Schema probe.' | codex exec --output-schema s.json --json`, where `s.json` is `{"type":"object","properties":{"x":{"type":"string","format":"uri"}},"required":["x"],"additionalProperties":false}`. The complete output:

```
Reading prompt from stdin...
{"type":"thread.started","thread_id":"01a14b39-0578-7fd3-8b49-72ad272e3339"}
{"type":"turn.started"}
```

## Third run: two keywords kept without a probe until now

Run after these two entries were added to the script above, after its `'$defs/$ref'` entry:

```ts
	'definitions/$ref':S({ $ref: '#/definitions/s' }, { definitions: { s: { type: 'string' } } }),
	exclusiveMaximum:  S({ type: 'number', exclusiveMaximum: 10 }),
```

Results:

```
ACCEPTED definitions/$ref (9671 ms) {"x":"ok"}
ACCEPTED exclusiveMaximum (5656 ms) {"x":0}
```

## Outcome (the rule the code applies)

- **The codex copy keeps only:**
  - keywords probed and ACCEPTED above;
  - `type`, `properties`, `required`, `additionalProperties`, `items` and `$ref`, which every probe schema used and codex accepted;
  - `oneOf`, which the strict form rewrites to the accepted `anyOf`.

  This is `CODEX_KEPT_KEYWORDS`. Every other keyword is left out: the refused ones (uniqueItems, contains, not, allOf, if/then/else, propertyNames, minProperties, maxProperties) and any never probed (for example prefixItems, dependentSchemas, unevaluatedItems).
- **`format`:** only `date-time` is sent as is. Another format is left out when the reply check enforces it (an ajv-formats format name), because codex got no answer for `uri` and `email`. A format the reply check cannot enforce is kept in the copy, so nothing is lost.
- **Reply check:** every codex reply is checked against the caller's FULL schema by `validateCodexReply`. That is ajv's draft 2020-12 build with ajv-formats, so prefixItems, dependentSchemas, unevaluatedItems and formats all hold on the reply.
- **Not changed:** a pure dictionary object (an `additionalProperties` schema with no `properties`) is refused ("properties is required for object schemas"). It has no lossless strict form.
- **Shared code:** `processSchemaForOpenAIStrict` and `validateAgainstSchema` are unchanged.

## Live check after the fix

`modelFacingBundleSchema({ withMeta: true })`, which carries `uniqueItems` on `meta.emptyLayers`, sent to codex through `completeStructured` (`/tmp/probe-schema2.mts`, nothing stripped by the script):

```
KEYWORDS additionalProperties,const,enum,items,minLength,minimum,properties,required,title,type,uniqueItems
OK {"system":"","focus":"","summary":"","structure":"","surface":"","artefacts":"","upstream":"","meta":{"mode":"classification","shaper":"classification
```
