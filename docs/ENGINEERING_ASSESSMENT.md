# Engineering assessment and stabilization backlog

Last assessed: 2026-09-15. This is a living, code-grounded handoff for the engineering agents. It is not proof that an issue remains open; re-check the current revision before acting.

## Current system

The product has two coupled delivery paths:

- A self-contained browser CRM built from `template.html` plus `data.json`, emitted as `index.html` and `artifact.html`.
- A Railway-hosted TypeScript/Express service exposing an OAuth-protected MCP endpoint backed by Postgres. The static UI attempts to hydrate live data through the Claude artifact MCP bridge and falls back to its embedded snapshot.

Railway currently reports `microcrm-api` online at `https://microcrm-api-production.up.railway.app`; deployment state is separate from application correctness. GitHub has Railway deployment records but no GitHub Actions runs, project tests, or open issue/PR trail at the time of this assessment.

Local baseline on the assessed revision:

- `npm run build -- --noEmit` passes in `server/`.
- `data.json` parses and the Python files compile.
- A clean temporary run of `build.py` reproduces the checked-in `index.html` and `artifact.html` byte-for-byte.
- The initial assessment found no repository-owned automated tests. The first
  Postgres integration suite and GitHub Actions workflow were added during the
  stabilization pass; expand them with the remaining cases below.

## Stabilization order

### P0 — expand and enforce the verification loop

The initial test command and CI workflow now cover deterministic generation,
transactional lead capture, deduplication, contact merging, rollback, and
concurrent note appends. Before relying on it as a release gate, protect `main`
and add the remaining coverage:

- deterministic static generation from `template.html` and `data.json`;
- dataset invariants and the contact schema rendered by the UI;
- CRM query limits, filters, summary/full projections, missing IDs, patch allowlists, contact replacement, and note append behavior;
- unauthenticated MCP response and `WWW-Authenticate` metadata;
- OAuth/OIDC discovery documents and resource-indicator configuration;
- one end-to-end MCP initialize/list/call sequence against an isolated test database;
- browser smoke coverage for snapshot search/detail and live summary-to-detail hydration.

CI should install from lockfiles, run the static checks, run server tests, build TypeScript, regenerate artifacts, and fail if generation leaves an unexpected diff.

### P0 — make snapshot-to-production migration non-destructive

`server/src/migrate.ts` upserts each full JSON document from `data.json`. Because connector writes do not sync back to Git, a later production migration can replace live-edited records with stale snapshot values. Before any further production migration:

1. Export and back up current Postgres records.
2. Decide field-level ownership and reconciliation rules between snapshot and live CRM data.
3. Add dry-run/diff output and an explicit production confirmation gate.
4. Test conflict cases where both snapshot and Postgres changed.

Until that exists, production migration is a data-loss risk and must remain a manual, explicitly authorized operation.

### P1 — repair transaction correctness in invite consumption

`server/src/users.ts` issues `BEGIN`, updates, `COMMIT`, and `ROLLBACK` through `pool.query`. A pool does not guarantee those statements use the same connection, so the intended transaction is not reliable. A fix should acquire a client with `pool.connect()`, execute the whole transaction on that client, lock or atomically claim the invite to prevent double consumption, and release the client in `finally`. Add concurrent-consumption coverage.

### P1 — escape every reflected HTML value

`server/src/setup.ts` interpolates the setup token, query-string error, and resulting email into HTML without escaping. Treat all three as untrusted. Use one shared escaping function or a template mechanism, then add tests using quotes and HTML/script characters. Review the OAuth interaction pages for the same class whenever their templates change.

### P1 — validate production configuration at startup

The server has development fallbacks for `PUBLIC_URL` and `COOKIE_SECRET`, while the database pool accepts an absent `DATABASE_URL`. In production, fail startup with a clear error when required configuration is missing or obviously using a development fallback. Do not print secret values. Cover production and local-development modes separately.

### P1 — test authorization, not only authentication

`requireAccessToken` currently proves that a token exists in the provider store. Verify and test the intended policy for token resource/audience, scopes, client, revocation/expiry, and user status before treating it as sufficient authorization for CRM writes. Preserve RFC 9728 discovery behavior on every 401.

### P1 — make health reflect dependencies

`/healthz` always returns `{ok:true}` after startup and does not prove a current database round trip or MCP readiness. Separate liveness from readiness, use a bounded database check for readiness, and configure Railway against the appropriate endpoint. Test database-unavailable behavior.

### P2 — reconcile documentation with implementation

`server/README.md` says OAuth state uses the in-memory adapter, but `server/src/oidc.ts` configures `PgAdapter` and `server/src/db.ts` creates `oidc_models`. Update the limitation section after confirming runtime persistence. Keep the snapshot-versus-Postgres ownership warning prominent.

### P2 — harden runtime failure handling and observability

The process-level `uncaughtException` handler logs and keeps running. Continuing after an uncaught exception can leave unknown process state. Prefer structured request error handling and a controlled process exit/restart for truly uncaught failures. Add request correlation and useful protocol error logging without logging credentials, cookies, authorization codes, tokens, invite URLs, or personal CRM content.

## Release evidence template

Every engineering handoff should include:

```text
User-visible failure:
Reproduction before:
Root cause:
Files changed:
Regression test:
Verification commands and results:
Production checks performed:
Checks not performed and why:
Rollback/data-recovery considerations:
```

Do not use “build passed,” “Railway is green,” or “page loads” as a substitute for verifying the reported user outcome.
