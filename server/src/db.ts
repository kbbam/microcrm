import pg from "pg";

const { Pool } = pg;

// Railway's managed Postgres (the postgres-ssl image) requires TLS whether
// it's reached over its internal hostname, a `railway connect --tunnel-only`
// local tunnel, or from outside -- the hostname alone doesn't tell you.
// The only case that genuinely has no TLS is a plain local/dev Postgres
// (e.g. a throwaway Docker container), so that's an explicit opt-out rather
// than something we try to sniff from the connection string.
const insecureLocalDb = process.env.LOCAL_INSECURE_DB === "1";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: insecureLocalDb ? false : { rejectUnauthorized: false },
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'invited',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    -- oidc-provider's persistent storage (sessions, grants, access/refresh
    -- tokens, authorization codes, interactions, clients, ...): one table
    -- for every model it manages, keyed by (model, id). Without this, every
    -- restart (a deploy, a crash, Railway recycling the container) wipes
    -- every logged-in user's session and forces a full re-authentication --
    -- unacceptable for people using this day to day.
    CREATE TABLE IF NOT EXISTS oidc_models (
      model TEXT NOT NULL,
      id TEXT NOT NULL,
      payload JSONB NOT NULL,
      grant_id TEXT,
      user_code TEXT,
      uid TEXT,
      expires_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      PRIMARY KEY (model, id)
    );
    CREATE INDEX IF NOT EXISTS oidc_models_grant_id_idx ON oidc_models (grant_id);
    CREATE INDEX IF NOT EXISTS oidc_models_user_code_idx ON oidc_models (model, user_code);
    CREATE INDEX IF NOT EXISTS oidc_models_uid_idx ON oidc_models (model, uid);
    CREATE INDEX IF NOT EXISTS oidc_models_expires_at_idx ON oidc_models (expires_at);
  `);
}
