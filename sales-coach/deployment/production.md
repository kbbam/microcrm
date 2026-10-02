# Production coach pilot — 2 October 2026

The owner authorized this pilot in the real Cureous Twenty workspace. The coach executes in ordinary Claude conversations through the organization skill and Business OS remote connector. No Project, terminal or model API key is required from the executive. This deployment does not make Twenty, Claude or Railway a universal Business OS boundary.

## Current deployment

- Public login/help: https://business-os-production-1193.up.railway.app/
- Claude connector: https://business-os-production-1193.up.railway.app/coach/mcp
- Executive source connection: https://business-os-production-1193.up.railway.app/account/twenty/connect
- Selected CRM interface: https://cureous.twenty.com/
- Runtime source revision: `b80dec9696ca0b9bbce06f691f94b9baf8b11988`, root `Dockerfile.coach`, locked package manifests.
- Dedicated Railway project `bam-business-os-production`, service `business-os`, environment `production`; separate Postgres and durable `/var/lib/bam-coach` volume. One replica; service sleep disabled.
- Executive `kb@jpgrowery.com`: assigned companies/opportunities and independently verified own connected sources. Admin/teamlead `kb@cureous.me`: workspace scope and the executive's retained report. Roles derive from central database grants, never model arguments.
- Fresh owner account invitations and contexts; no QA passwords, evidence or account memories copied. Setup links and all credentials are stored privately outside Git.

The final cloud functional proof and public health records are in `../evidence/production-readiness/`. The executive password and actual Claude Desktop production connection are now active after correcting a browser OAuth redirect defect; see `../evidence/production-readiness/oauth-redirect-fix/`. Real Cureous source authorization is now active: the actual production status check reports email and calendar sync with separate timestamps. This is provider status, not complete content coverage. Production tool prompt persistence, actual source-content coverage and physical Android acceptance remain separate verification steps. Missing or revoked source authorization is explicitly surfaced; it is not reported as an empty inbox. See the source-status proof linked from the release record.

## First activation and Android check

The owner sets the production Business OS password with the private one-time executive link, then connects Claude using the connector URL above and signs in as `kb@jpgrowery.com`. Use the published BAM coach organization skill in a regular conversation. Keep QA and production connectors visibly distinct; select production for this check.

Connect the executive's Google email/calendar in the **real Cureous** Twenty workspace, and complete Business OS's Twenty connection as that same executive. The callback verifies exact email, workspace and member identity and encrypts the user-scoped refresh/access credential. Saved channel IDs alone never prove ownership or present coverage. A source synchronization state or authorization gap must remain visible in relevant answers.

Before routine use, complete the single-session tool permission setup in `../claude-skill/permission-preflight.md`, then start a fresh conversation to check persistence. New/changed tools can still prompt; do not claim client approval settings persist until the actual fresh-chat and Android check succeeds. Consequential changes retain Business OS's separate human review regardless of client Always allow preferences. Sending email/calendar writes are absent.

Android prompt, with no attachment: “BAM coach, use production. What account can I work on, what do I owe there, and what needs my attention?” Confirm the correct account scope, concise useful answer, and an honest source-coverage statement. Then submit one harmless real operational note and verify it is available in a new chat. Do not create synthetic work inside real customer opportunities merely to trigger tool approvals. Optional file check: attach one clean document once and ask to preserve its original, retain transcription/extraction and report the stored checksum; compare the original locally if desired. Builder-owned synthetic original/receipt/retrieval checks already cover byte integrity, recovery and access denial.

## Runtime ownership and source credentials

The image runs as `node` UID/GID `1000:1000`; Railway SSH provisioning runs as root. After root provisioning or restoring files, recursively set ownership of the **coach volume only** to `1000:1000`, with private directories `0700` and private files `0600`. The config directory must be writable, not only readable: the source callback uses atomic rename. Prove public authenticated MCP after provisioning; `/readyz` only proves database reachability and misses unreadable configuration.

Required runtime values are managed privately in Railway: database binding, `PUBLIC_URL`, persistent signing/cookie/admin secrets, `COACH_ENABLED=1`, `COACH_CONFIG_ROOT`, production Twenty service key, `TWENTY_SOURCE_BASE_URL`, registered `TWENTY_SOURCE_CLIENT_ID` and `TWENTY_SOURCE_TOKEN_KEY`. Preserve signing/encryption keys across container replacement. Never put keys or OAuth vaults into a model prompt or the image. Production's service credential does not confer broader executive access: adapter checks and fresh source-user ownership checks enforce central scope at every operation.

## Backup, recovery and rollback

Initial Postgres dump and coach volume snapshot are privately retained together. The unchanged SQL dump restored successfully with matching PostgreSQL 18 into an isolated database; the volume snapshot restored every file byte-for-byte. Sanitized hashes/counts are retained in `database-backup-proof.json` and `volume-backup-proof.json`. Those initial snapshots predate live executive usage and must never overwrite later facts without a current backup and explicit recovery decision.

For an incident, stop or disable affected central coach access while preserving both stores. Redeploy this verified production artifact/configuration; do not roll production back to an older broad-scope QA build. Before replacement, snapshot current database and volume plus persistent signing/encryption configuration. After paired restoration, repair runtime ownership, invalidate restored sessions/grants and outstanding invitation/capability links as appropriate, issue fresh owner activation, and repeat public MCP, scoped CRM, exact-source/original and restart recovery checks. Restore in isolation first. No destructive production restore is authorized by this document.

All synthetic production verification uses an isolated fixture identity/context and recoverable synthetic CRM records. Disable the fixture grant/user and revoke its sessions on completion; retain private archived verification evidence. Real customer email and calendar writes remain excluded.
