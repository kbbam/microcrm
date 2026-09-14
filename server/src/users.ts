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

export async function consumeInvite(
  token: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const { rows } = await pool.query(
    `SELECT email, expires_at, used_at FROM invites WHERE token = $1`,
    [token],
  );
  const invite = rows[0];
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.used_at) return { ok: false, error: "Invite already used." };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Invite expired." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE users SET password_hash = $1, status = 'active' WHERE email = $2`,
      [passwordHash, invite.email],
    );
    await pool.query(`UPDATE invites SET used_at = now() WHERE token = $1`, [
      token,
    ]);
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
  return { ok: true, email: invite.email };
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
