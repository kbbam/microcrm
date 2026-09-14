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
  `);
  // OAuth grants/tokens/interactions (oidc-provider) intentionally use the
  // default in-memory adapter, not Postgres: this service runs as a single
  // Railway instance, and losing in-flight authorization state on a redeploy
  // just means affected users re-authenticate. Not worth a custom adapter.
}
