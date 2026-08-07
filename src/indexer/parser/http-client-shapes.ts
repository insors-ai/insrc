/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared HTTP-client call-site recognition tables + emit helper
 * (E20260807914cbf5e:S003 — sc1-consuming outbound HTTP detector, t3).
 *
 * The per-language recognizers (typescript / python / go / java / scala) all
 * extend their existing call walks with the SAME two-step contract encoded
 * here, so the detection surface stays uniform and the per-language parser code
 * only has to (a) compute a normalized callee path from its own AST and (b)
 * extract one argument's raw text — the library-shape knowledge + the
 * relation-emit rule live here, once.
 *
 *   1. `matchHttpClient(language, callee)` — given a normalized callee path
 *      (whitespace-stripped), returns the 0-based index of the argument that
 *      carries the URL, or `null` when the call is not a known HTTP client.
 *   2. `emitCallsHttp(relations, {...})` — pushes an UNRESOLVED CALLS_HTTP
 *      relation `{ kind:'CALLS_HTTP', from, to:<raw URL expr>, resolved:false }`,
 *      SKIPPING emission when the URL expression is empty (the LLD
 *      "unextractable URL" error case: never mint an empty-`to` boundary edge
 *      that would collapse every dynamic call onto one meaningless node).
 *
 * Matching modes (per shape):
 *   - `exact`  (default): the whole normalized callee equals `callee`. Used for
 *     module-rooted clients whose receiver is a stable import name
 *     (`fetch`, `axios.get`, `http.request`, `requests.get`, `http.Get`).
 *   - `method`: the LAST dotted segment of the callee equals `callee`. Used for
 *     clients invoked on an instance variable whose name is arbitrary
 *     (`restTemplate.getForObject`, `webClient. ... .uri(...)`,
 *     `ws.url(...)`). Keyed on HTTP-specific method names to keep precision.
 *
 * Instance-variable clients whose URL lives behind dataflow (an OkHttp
 * `Request` built elsewhere, a Go `client.Do(req)`, an aiohttp session verb on a
 * `ClientSession` bound to a local) are a deliberate recall gap: without type
 * inference we cannot statically pin their URL, and precision (no false HTTP
 * edges) is favoured over recall — consistent with the S003 LLD boundary. The
 * URL for those flows is still captured at the request-construction call
 * (`http.NewRequest`, `HttpRequest.newBuilder().uri(...)`), which IS matched.
 */

import type { Relation } from '../../shared/types.js';

/** One recognized HTTP-client call shape: a callee token + which argument
 *  holds the URL + how the token is matched against a call's callee path. */
export interface HttpClientShape {
	/** Exact normalized callee path (`match:'exact'`) or the HTTP-specific
	 *  method name to match as the callee's last segment (`match:'method'`). */
	readonly callee: string;
	/** 0-based index of the URL argument in the call's argument list. */
	readonly urlArgIndex: number;
	/** Matching mode; defaults to `'exact'`. */
	readonly match?: 'exact' | 'method';
}

/** Collapse ALL internal whitespace so `axios . get` and `axios.get` compare
 *  equal, and multi-line member chains normalize to a single token. */
export function normalizeCallee(raw: string): string {
	return raw.replace(/\s+/g, '');
}

/** The last dotted segment of a normalized callee path (`a.b.c` -> `c`). */
function lastSegment(callee: string): string {
	const i = callee.lastIndexOf('.');
	return i === -1 ? callee : callee.slice(i + 1);
}

// ---------------------------------------------------------------------------
// Per-language client-shape tables
// ---------------------------------------------------------------------------

const HTTP_VERBS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

/** TS/JS: fetch / axios / got are module-rooted (exact); node's http(s) too. */
const TS_JS_SHAPES: readonly HttpClientShape[] = [
	{ callee: 'fetch', urlArgIndex: 0 },
	{ callee: 'axios', urlArgIndex: 0 },
	...HTTP_VERBS.map(v => ({ callee: `axios.${v}`, urlArgIndex: 0 })),
	{ callee: 'axios.request', urlArgIndex: 0 },
	{ callee: 'got', urlArgIndex: 0 },
	...HTTP_VERBS.map(v => ({ callee: `got.${v}`, urlArgIndex: 0 })),
	{ callee: 'http.get', urlArgIndex: 0 },
	{ callee: 'http.request', urlArgIndex: 0 },
	{ callee: 'https.get', urlArgIndex: 0 },
	{ callee: 'https.request', urlArgIndex: 0 },
];

/** Python: requests / httpx are module-rooted; `.request(method, url)` puts the
 *  URL at index 1. urllib + aiohttp module-level `request` likewise. */
const PYTHON_SHAPES: readonly HttpClientShape[] = [
	...HTTP_VERBS.map(v => ({ callee: `requests.${v}`, urlArgIndex: 0 })),
	{ callee: 'requests.request', urlArgIndex: 1 },
	...HTTP_VERBS.map(v => ({ callee: `httpx.${v}`, urlArgIndex: 0 })),
	{ callee: 'httpx.request', urlArgIndex: 1 },
	{ callee: 'urllib.request.urlopen', urlArgIndex: 0 },
	{ callee: 'aiohttp.request', urlArgIndex: 1 },
];

/** Go: net/http package functions. `NewRequest(method, url, body)` -> index 1;
 *  `NewRequestWithContext(ctx, method, url, body)` -> index 2. */
const GO_SHAPES: readonly HttpClientShape[] = [
	{ callee: 'http.Get', urlArgIndex: 0 },
	{ callee: 'http.Head', urlArgIndex: 0 },
	{ callee: 'http.Post', urlArgIndex: 0 },
	{ callee: 'http.PostForm', urlArgIndex: 0 },
	{ callee: 'http.NewRequest', urlArgIndex: 1 },
	{ callee: 'http.NewRequestWithContext', urlArgIndex: 2 },
];

/** Java: RestTemplate methods carry the URL at index 0 and their names are
 *  HTTP-specific (matched by method, since the receiver is an instance var).
 *  `HttpRequest.newBuilder().uri(...)` / OkHttp `Request.Builder().url(...)`
 *  carry the URL on the builder call — matched by the `uri`/`url` method. */
const JAVA_SHAPES: readonly HttpClientShape[] = [
	{ callee: 'getForObject', urlArgIndex: 0, match: 'method' },
	{ callee: 'getForEntity', urlArgIndex: 0, match: 'method' },
	{ callee: 'postForObject', urlArgIndex: 0, match: 'method' },
	{ callee: 'postForEntity', urlArgIndex: 0, match: 'method' },
	{ callee: 'exchange', urlArgIndex: 0, match: 'method' },
	{ callee: 'uri', urlArgIndex: 0, match: 'method' },
	{ callee: 'url', urlArgIndex: 0, match: 'method' },
];

/** Scala: Play WS `ws.url(u)` and generic builder `.uri(u)` carry the URL on
 *  that call. Interpolated-`uri"..."` (sttp) and `HttpRequest(uri = ...)`
 *  (Akka/Pekko) are recall gaps (dataflow / named-arg). */
const SCALA_SHAPES: readonly HttpClientShape[] = [
	{ callee: 'url', urlArgIndex: 0, match: 'method' },
	{ callee: 'uri', urlArgIndex: 0, match: 'method' },
];

/** Per-language tables, keyed on the parser `language` tag. A language absent
 *  here simply detects nothing (additive: no behaviour change for it). */
export const HTTP_CLIENT_SHAPES: Readonly<Record<string, readonly HttpClientShape[]>> = {
	typescript: TS_JS_SHAPES,
	javascript: TS_JS_SHAPES,
	python:     PYTHON_SHAPES,
	go:         GO_SHAPES,
	java:       JAVA_SHAPES,
	scala:      SCALA_SHAPES,
};

// ---------------------------------------------------------------------------
// Import-gating for instance-method clients (Java / Scala)
// ---------------------------------------------------------------------------

/**
 * Per-language import-specifier substrings that indicate an HTTP-client library
 * is in scope. Java/Scala clients are invoked on instance vars, so their shapes
 * match by bare method name (`exchange`/`uri`/`url`/`getForObject`/...) — which
 * without gating would false-positive on mainstream non-HTTP code that shares
 * those names (RabbitMQ `channel.exchange`, JDBC `builder.url("jdbc:…")`, Play
 * reverse-routing `.url()`, fluent `.uri(path)`). We therefore only run the
 * Java/Scala HTTP recognizer when the file actually imports one of these
 * libraries. (TS/JS/Python/Go match on the module receiver itself — `axios.get`,
 * `http.Get`, `requests.get` — already unambiguous, so they are NOT gated.) A
 * residual false positive remains only when a file imports an HTTP library AND
 * separately calls a same-named non-HTTP method — rare, and the
 * precision-over-recall stance accepts it.
 */
export const HTTP_LIBRARY_IMPORT_MARKERS: Readonly<Record<string, readonly string[]>> = {
	java: [
		'org.springframework.web',          // RestTemplate (spring-web) + WebClient (spring-webflux)
		'okhttp3',                          // OkHttp
		'java.net.http',                    // JDK 11+ HttpClient
		'org.apache.http', 'org.apache.hc', // Apache HttpClient 4 / 5
		'jakarta.ws.rs', 'javax.ws.rs',     // JAX-RS client
		'retrofit2',                        // Retrofit
		'feign',                            // OpenFeign
	],
	scala: [
		'play.api.libs.ws',                   // Play WS
		'sttp',                               // sttp
		'akka.http', 'org.apache.pekko.http', // Akka / Pekko HTTP
		'scalaj.http',                        // scalaj-http
	],
};

/**
 * True if any of the file's raw import specifiers references a known HTTP
 * library for `language` (substring test against the marker table). A language
 * with no marker table is treated as NOT gated (returns `true`).
 */
export function fileImportsHttpLibrary(language: string, importSpecifiers: Iterable<string>): boolean {
	const markers = HTTP_LIBRARY_IMPORT_MARKERS[language];
	if (markers === undefined) return true;  // ts/js/python/go — not gated
	for (const spec of importSpecifiers) {
		for (const m of markers) if (spec.includes(m)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Matching + emit — the stable contract each recognizer calls
// ---------------------------------------------------------------------------

/**
 * Match a call's callee path against `language`'s client-shape table.
 * `callee` is normalized (whitespace collapsed) internally, so callers may
 * pass raw member/selector text. Returns `{ urlArgIndex }` on a match, else
 * `null` (not an HTTP client call — keep it a plain CALLS edge / no edge).
 */
export function matchHttpClient(language: string, callee: string): { urlArgIndex: number } | null {
	const table = HTTP_CLIENT_SHAPES[language];
	if (table === undefined) return null;
	const norm = normalizeCallee(callee);
	if (norm === '') return null;
	const seg = lastSegment(norm);
	for (const shape of table) {
		const hit = (shape.match ?? 'exact') === 'method'
			? seg === shape.callee
			: norm === shape.callee;
		if (hit) return { urlArgIndex: shape.urlArgIndex };
	}
	return null;
}

/**
 * Push an UNRESOLVED CALLS_HTTP relation (`from` -> raw URL expression) into
 * `relations`. SKIPS emission when `rawUrlExpr` is empty/whitespace — the LLD
 * "unextractable URL" error case: emitting an empty-`to` would collapse every
 * such call-site onto one meaningless endpoint node, so we drop it instead
 * (the intra-code CALLS edge, if any, is unaffected). Returns whether a
 * relation was emitted.
 */
export function emitCallsHttp(
	relations: Relation[],
	args: { readonly from: string; readonly repo: string; readonly file: string; readonly rawUrlExpr: string },
): boolean {
	const raw = args.rawUrlExpr.trim();
	if (raw === '') return false;
	relations.push({
		kind:     'CALLS_HTTP',
		from:     args.from,
		to:       raw,
		resolved: false,
		meta:     { file: args.file, repo: args.repo },
	});
	return true;
}
