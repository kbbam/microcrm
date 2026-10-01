# Isolated hosted coach QA proof

On 1 October 2026 the actual HTTPS gateway passed the thirteen assertions retained
in `https-proof.json`, using only synthetic users and generated binary/text evidence.
The proof ran the real PostgreSQL-backed OAuth provider and actual HTTP routes;
browser sessions were not injected test doubles. The record contains the exact
sanitized deployment file hashes and proof-script hash, rather than implying that
an uncommitted working tree was already a released Git revision.

- Public host: `https://coach-api-qa.up.railway.app`
- Claude connector endpoint: `https://coach-api-qa.up.railway.app/coach/mcp`
- Railway project: `bam-sales-coach-qa`, `f3f4649b-fa76-4293-a6d3-e4fa3fe27c70`
- Environment: `qa`, `6846e7c4-54ca-445d-a07e-6432366a0ce5`
- API service: `coach-api`, `da71343e-b263-4715-948f-20b03e755c5b`
- Separate PostgreSQL service: `099941ee-5168-47b1-b729-0de0ac7872e7`
- Evidence/config volume: `72eaabfa-c28a-4249-8b50-37fc02523d62`, `/var/lib/bam-coach`
- Original thirteen-check deployment: `d1fb7b02-2bc2-4209-b1db-669e6961f6a1`
- Current healthy QA deployment: `23d80b4a-22cd-40d8-8cbd-199b8a541123`

The deployed checks covered real registration/PKCE/login/consent, a 160,000-character
transcription, 440,487 original bytes with exact upload/download equality, evidence
linking, existing OIDC browser-session review, independent browser fallback login,
authenticated confirmation, cross-audience rejection, grant revocation and inactive-user
denial. Container restart was requested with Railway's inspected `deploymentRestart`
mutation and verified by a changed `/proc/1/stat` start marker before checking token
and original-file persistence. The higher-level `railway restart` command hung; the
bounded proof uses the API instead. No production project was changed.

Railway rejects Docker's `VOLUME` directive. `Dockerfile.coach` therefore relies on
the explicitly attached Railway volume. The uploaded build context contained only
the Dockerfile, exact server/coach source and dependency files, and QA deployment
configuration. No local credential files, retained company evidence or snapshots
were uploaded. New OAuth signing/cookie secrets live in QA variables, not Git.

## Current client acceptance

**Superseded setup status, 1 October 2026:** the owner has now completed both new
passwords and the executive's Claude OAuth sign-in. The coach skill is published
to JPgrowery and installed by default, and the custom remote connector is connected.
The owner approved Always allow for its bounded internal tools; consequential writes
still require authenticated human review. The isolated Twenty credential is now
installed only in the QA service secret; see `twenty-linkage.md` for the final
deployment and seven passing real CRM checks. The historical setup status below
describes the earlier thirteen-check deployment, not the current configuration.
Actual desktop ordinary-chat capture, exact-original preservation, durable fresh-chat
retrieval, current instructions in an existing chat and authenticated human rejection
are verified. The owner also completed the ordinary Android capture; independent
original hashing, transcription and provisional association are verified in
`mobile-source-verification.json`. See `claude-client-proof.md` and
`ordinary-client-independent-proof.json`. Mobile speed and default response length remain next-iteration concerns.

Two new isolated users have completed setup for `owner-qa`:
`kb@jpgrowery.com` is executive and `kb@cureous.me` is admin. Neither password has
been set by a builder. Setup URLs remain in a private local control file, excluded
from repository evidence. No email was sent and no existing account credentials
were changed. The context is bound to executive `kb@jpgrowery.com`.

The QA host is linked only to the isolated Twenty workspace, with independently
verified routine CRM creates/updates/readback. The owner connected email/calendar and selected the configuration recorded in
`owner-source-settings.md`. Read-only live verification found readable bodies on
57 of 110 messages, multiple-message threads, participants and account links, and
synchronized calendar fields. Other communication fields remain restricted by
Twenty and are now explicitly represented as unavailable rather than text.
Provider synchronization completeness, original MIME and email attachment bytes
are not claimed. No Google credential is installed directly on the QA host.

The earlier Android-to-HTTPS experiment established the client transfer capability.
The owner has now exercised the installed coach in an ordinary Android conversation;
its unchanged original and linked transcription/context are independently verified.
The 58.530-second visible request/reply interval and overlong completion are retained
as next-iteration feedback, not hidden by the passing byte-transfer check.
