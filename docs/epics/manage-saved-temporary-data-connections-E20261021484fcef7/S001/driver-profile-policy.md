# Driver profile materialization policy

Task t3 implements the audited field classification in `src/daemon/db/driver-profiles.ts`. It has no registry writer, keychain writer or driver factory. Its only credential port reads an owner-validated reference; caller admission and reference ownership are enforced by subsequent service/generation tasks.

The driver descriptor schema is an allowlist for public patches. Credentials use separate Keep, Replace and Clear actions. Existing server snapshots retain supported fields that a form does not expose, including explicit family pins. Unknown private fields and unsupported shapes set the additive `SafeConnection.readOnly` flag with read-only guidance and are never projected or silently rewritten.

| Stored field | Public view | Credential action slots |
| --- | --- | --- |
| SQL/Redis/Mongo hierarchical URL | `endpoint`, with userinfo removed | `url.username`, `url.password` |
| NATS/Memcached server list, etcd hosts | credential-free endpoint list | `options.servers` / `options.hosts`; Replace takes a JSON string array, Clear removes URI userinfo |
| DynamoDB endpoint | credential-free endpoint | `options.endpoint`; Clear removes URI userinfo |
| etcd/Memcached password | no value | `options.password` |
| File path and supported reader options | schema-validated values | none |

Raw URI spelling is preserved for label-only edits. Credential edits encode only changed userinfo, preserve endpoint text and leave known non-secret URI parameters intact. PostgreSQL SSL mode/application/encoding parameters and common MongoDB non-secret parameters are explicitly classified from the installed SDK parsers. Unclassified query parameters, ambiguous/unsupported URI dialects and malformed private fields remain read-only. No URI query is blindly exposed or discarded.

Reference values are never accepted from public input or credential replacements. Safe views omit opaque sealed endpoint values and report configured credential slots without returning references. Internal slot mapping can place generation references into a server snapshot for the later secret-generation task; it does not persist them. SQL userinfo references are percent encoded and decoded at the component boundary so passwords containing `/`, `@` or `%` retain their exact meaning.

Options-only KV connections receive an internal `<kind>:options` URL placeholder when first created, satisfying the existing saved-document loader without changing the driver options that determine the actual endpoint. Saved-only lookup still uses the caller's own directory; profile materialization does not grant management rights or redirect it to a containing repository.

Tests cover all 29 registered kinds, invalid public/identity fields, pinned-family and retained-field preservation, exact URI handling, sealed references, credential actions, and abandoned drafts with exact registry/vault equality and observed zero writer/keychain-write calls. Live-service tests remain outside this task's required mappings. The full sweep is deferred until all tasks per the user's instruction.
