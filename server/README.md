# microcrm-api

Remote MCP connector for the `microcrm` dataset: read/write access to
entities and people, gated behind OAuth-based logins. Deployed on Railway
as a second service (`microcrm-api`) alongside the static `microcrm` site,
sharing the project's Postgres database.

## Endpoints

- `POST /mcp` — the MCP server (Streamable HTTP transport), gated behind an
  OAuth access token (`Authorization: Bearer <token>`). Tools: `search_entities`,
  `get_entity`, `update_entity`, `create_entity`, `search_people`, `get_person`,
  `update_person`, and `capture_lead_interaction`. The capture tool atomically
  matches or creates a person, links them to an existing organization, merges
  business-card contacts, and records an attributed meeting/follow-up activity.
- `/.well-known/openid-configuration`, `/auth`, `/token`, `/reg`, `/jwks` —
  standard OAuth 2.1 (PKCE + dynamic client registration) endpoints, backed
  by [`oidc-provider`](https://github.com/panva/node-oidc-provider). This is
  what Claude (or any MCP client) talks to when you add this as a custom
  connector.
- `POST /admin/invites` — admin-only (`Authorization: Bearer $ADMIN_TOKEN`),
  body `{"email": "..."}`. Creates a user row and a one-time `/setup?token=...`
  link for them to set a password.
- `GET/POST /setup?token=...` — where an invited person sets their password.
- `GET /livez`, `GET /readyz`, `GET /version` — process liveness, database
  readiness, and deployed Git revision diagnostics.

## Environment variables

| Variable         | Purpose                                                        |
| ---------------- | --------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string (set to `${{Postgres.DATABASE_URL}}`) |
| `PUBLIC_URL`     | This service's public URL (used as the OAuth issuer)             |
| `ADMIN_TOKEN`    | Bearer secret for `POST /admin/invites`                          |
| `COOKIE_SECRET`  | Signs the interaction-flow cookies                               |
| `PORT`           | Set by Railway automatically                                     |

## Local development

```bash
npm install
npm run build
DATABASE_URL=postgresql://postgres:test@localhost:5432/microcrm \
  LOCAL_INSECURE_DB=1 ADMIN_TOKEN=dev-secret PUBLIC_URL=http://localhost:8080 \
  npm run migrate   # loads ../data.json into Postgres
DATABASE_URL=postgresql://postgres:test@localhost:5432/microcrm \
  LOCAL_INSECURE_DB=1 ADMIN_TOKEN=dev-secret PUBLIC_URL=http://localhost:8080 \
  npm start
```

Integration tests require an isolated Postgres database and never use the
production database:

```bash
DATABASE_URL=postgresql://postgres:test@localhost:5432/microcrm_test \
  LOCAL_INSECURE_DB=1 npm test
```

`LOCAL_INSECURE_DB=1` is the only way to talk to Postgres without TLS —
Railway's managed Postgres (and any tunnel to it) always requires it.

## Deploying / migrating on Railway

This service builds from this subdirectory of a monorepo, so `railway up`
needs to be pointed at it explicitly from the repo root:

```bash
railway up ./server --path-as-root --service microcrm-api
```

To run the migration (or any one-off script) against the real database from
a local machine, tunnel in first (this goes over Railway's private network,
unlike `railway run`, which only forwards environment variables and executes
locally):

```bash
railway connect Postgres --tunnel-only   # prints a local DATABASE_URL
DATABASE_URL=<printed-url> npm run migrate
```

## Known limitations (by design, see the repo's plan history)

- OAuth grants, tokens, interactions, and dynamically registered clients are
  persisted in Postgres through `PgAdapter`; normal redeploys should preserve
  sessions.
- Writes made through this connector do **not** sync back to `data.json`,
  the git repo, or the published Claude Artifact. Postgres is the source of
  truth for anything edited here; the static file/Artifact are a snapshot
  from whenever `build.py` was last run.
- Never run the snapshot migration against production without a backup and a
  reviewed reconciliation plan: its full-document upserts can overwrite live
  connector edits.
