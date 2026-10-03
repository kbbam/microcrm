import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function createInvite(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  await pool.query(
    `INSERT INTO users (email, status) VALUES ($1, 'invited')
     ON CONFLICT (email) DO NOTHING`,
    [normalized],
  );

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await pool.query(
    `INSERT INTO invites (token, email, expires_at) VALUES ($1, $2, $3)`,
    [token, normalized, expiresAt],
  );
  return token;
}

export async function inspectInvite(token: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const { rows } = await pool.query(`SELECT email, expires_at, used_at FROM invites WHERE token = $1`, [token]);
  return inviteState(rows[0]);
}

function inviteState(invite: any): { ok: true; email: string } | { ok: false; error: string } {
  if (!invite) return { ok: false, error: "This setup link is invalid." };
  if (invite.used_at) return { ok: false, error: "This setup link has already been used." };
  if (new Date(invite.expires_at).getTime() <= Date.now()) return { ok: false, error: "This setup link has expired." };
  return { ok: true, email: invite.email };
}

export async function consumeInvite(
  token: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return { ok: false, error: "Use at least 8 characters and at most 72 UTF-8 bytes." };
  }
  // Reject unavailable public links before spending work on password hashing.
  const preliminary = await inspectInvite(token);
  if (!preliminary.ok) return preliminary;
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const candidate = await client.query(`SELECT email FROM invites WHERE token = $1`, [token]);
    if (!candidate.rows[0]) { await client.query("ROLLBACK"); return { ok: false, error: "This setup link is invalid." }; }
    const email = candidate.rows[0].email;
    const user = await client.query(`SELECT email FROM users WHERE email = $1 FOR UPDATE`, [email]);
    if (!user.rows[0]) { await client.query("ROLLBACK"); return { ok: false, error: "This setup link is invalid." }; }
    const { rows } = await client.query(`SELECT email, expires_at, used_at FROM invites WHERE token = $1 FOR UPDATE`, [token]);
    const state = inviteState(rows[0]);
    if (!state.ok) { await client.query("ROLLBACK"); return state; }
    await client.query(`UPDATE users SET password_hash = $1, status = 'active' WHERE email = $2`, [passwordHash, email]);
    // Resetting credentials revokes prior browser sessions and connector grants.
    await client.query(`DELETE FROM oidc_models WHERE payload->>'accountId' = $1 OR payload->'session'->>'accountId' = $1`, [email]);
    // Serialize resets per account; invalidate all older unused reset links.
    await client.query(`UPDATE invites SET used_at = now() WHERE email = $1 AND used_at IS NULL`, [email]);
    await client.query("COMMIT");
    return { ok: true, email };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { client.release(); }
}

export async function verifyLogin(
  email: string,
  password: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT password_hash, status FROM users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  const user = rows[0];
  if (!user || user.status !== "active" || !user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}
