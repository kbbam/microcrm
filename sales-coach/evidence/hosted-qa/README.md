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
- Final deployment: `d1fb7b02-2bc2-4209-b1db-669e6961f6a1`

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

## Owner onboarding still required

Two new invited users exist only in the empty `owner-qa` context:
`kb@jpgrowery.com` is executive and `kb@cureous.me` is admin. Neither password has
been set by a builder. Setup URLs remain in a private local control file, excluded
from repository evidence. No email was sent and no existing account credentials
were changed. The context is bound to executive `kb@jpgrowery.com`.

The owner still needs to set these new account passwords, authorize the Claude
organization skill/custom connector, and consent to linking the isolated Twenty
test workspace credential. No Twenty or Google credential is currently installed
on this QA host. Confirmed synthetic CRM changes therefore correctly remain blocked
with `NOT_CONFIGURED`; the proof does not claim a deployed live CRM write.

The earlier actual Android-to-HTTPS experiment establishes the client transfer
capability. The installed coach must still be exercised in an ordinary Android
Claude conversation; a synthetic HTTP client is not that final client proof.
