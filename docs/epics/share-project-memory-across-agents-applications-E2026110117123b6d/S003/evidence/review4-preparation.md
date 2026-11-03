# S3 design review round four preparation

User authorized another correction/review cycle after round three. This is its
first independent review, not an approval or implementation completion.

- **error-paths.1 / HIGH:** AdmissionErrorBoundaryV1 replaces the policy-only
  wrapper assumption with explicit trusted, pure module transforms outside the
  original host-policy try/catch. QueueAdmission gains an optional private
  constructor seam, identified as a real change site. Module validation and
  FileQueue identity conflicts retain their codes. Host callback failures keep
  existing sanitization, including host-thrown INVALID_REQUEST/REVISION_CONFLICT
  becoming NOT_READY. Public-submit tests require correct codes, unchanged queue
  bytes and released reservations.
- **data-compatibility.2 / MED:** EmbeddingCompatibilityV1 defines the package's
  embedding preprocessing/Float32 normalization version, persists it in root and
  initialization metadata, and checks runtime/model/dimension/plan/query parity.
  Semantic normalizer versions remain separate. Missing/mismatched metadata
  fails closed; no public ModelPort change or automatic re-embedding is added.

The earlier source/provenance test subject names are retained for traceability;
their S3 admission composition uses the newly specified transforms, not a
policy-only wrapper. All new test cases are design requirements, not executed
implementation tests.

Workflow schemas and git diff --check passed. Regenerated [ER](review4-er.png)
and [sequence](review4-sequence.png) screenshots were rendered locally with
headless Chrome and inspected. The existing artifact-only font preparation was
reapplied. Platform crash qualification and later-story integration gates remain
pending. No production code or runtime configuration was changed.
