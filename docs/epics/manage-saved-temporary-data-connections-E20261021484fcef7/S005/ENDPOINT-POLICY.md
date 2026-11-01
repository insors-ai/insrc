# Public endpoint safety grammar

This consumer boundary screens public connection fields. It does not determine driver URL validity, establish connectivity, normalize configuration, or authorize a connection. Those remain daemon responsibilities. TypeScript `wire.ts` and Kotlin `ConnectionProtocol.kt` implement the same grammar; `endpointPolicy` and `endpointCases` in the versioned, digested shared corpus define its regression contract.

- Require an absolute ASCII scheme and nonempty remainder. Preserve accepted text exactly; never trim, decode or rewrite the returned configuration.
- Refuse raw C0/DEL/C1 controls, unpaired UTF-16 surrogates and backslashes. Network schemes `http`, `https`, `ws`, `wss`, `ftp`, and `file` require canonical `//` syntax. Their authority must be nonempty except for `file:///…`. Missing/extra-slash and backslash spellings that a browser might normalize are refused consistently.
- For hierarchical forms, screen the authority before the first `/`, `?` or `#`. For other absolute schemes, conservatively screen the opaque prefix before those delimiters as well. Refuse user-info `@`, authority delimiters, controls, Unicode whitespace and unsafe authority punctuation, including percent-encoded forms after bounded strict decoding. Authorities such as underscore hosts, IPv6 and multi-host driver addresses are structurally supported; their operational validity is a daemon decision.
- Preserve path/query/fragment Unicode and escapable punctuation, including spaces, braces, literal percent signs and repeated `#`. Existing recursive secret-reference and private-field checks still run on the original configuration. This is a safety grammar, not full WHATWG or RFC URL conformance.

The shared cases exercise safe read, whole-list decode, public patch and nested option patch in both runtimes. Cross-language parity compares every verdict, including a divergent-consumer negative control. Fixtures contain synthetic data and confer no authority. No wire envelope, stored schema, session ownership or driver contract changes.

Compatibility is explicit: ambiguous browser-normalized network forms are refused by both clients, while accepted query/fragment text no longer depends on Java URI strictness. Validity peculiar to a database protocol is checked by the daemon rather than inferred from a generic browser parser.
