import { pool } from "./db.js";

/**
 * oidc-provider's persistent storage interface, backed by the oidc_models
 * table (one generic row shape shared by every model oidc-provider manages:
 * sessions, grants, access/refresh tokens, authorization codes,
 * interactions, dynamically-registered clients, ...).
 *
 * oidc-provider instantiates one of these per model name (`new
 * PgAdapter('AccessToken')`, `new PgAdapter('Client')`, etc.) and only ever
 * calls the methods below -- this is the documented Adapter contract,
 * mirroring the official Redis/TypeORM example adapters.
 */
export class PgAdapter {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async upsert(
    id: string,
    payload: Record<string, unknown>,
    expiresIn?: number,
  ): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    await pool.query(
      `INSERT INTO oidc_models (model, id, payload, grant_id, user_code, uid, expires_at, consumed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       ON CONFLICT (model, id) DO UPDATE SET
         payload = EXCLUDED.payload,
         grant_id = EXCLUDED.grant_id,
         user_code = EXCLUDED.user_code,
         uid = EXCLUDED.uid,
         expires_at = EXCLUDED.expires_at,
         consumed_at = NULL`,
      [
        this.model,
        id,
        payload,
        (payload as any).grantId ?? null,
        (payload as any).userCode ?? null,
        (payload as any).uid ?? null,
        expiresAt,
      ],
    );
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const { rows } = await pool.query(
      `SELECT payload, expires_at, consumed_at FROM oidc_models WHERE model = $1 AND id = $2`,
      [this.model, id],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return undefined;
    return {
      ...row.payload,
      ...(row.consumed_at ? { consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) } : {}),
    };
  }

  async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
    const { rows } = await pool.query(
      `SELECT payload, expires_at, consumed_at FROM oidc_models WHERE model = $1 AND user_code = $2`,
      [this.model, userCode],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return undefined;
    return {
      ...row.payload,
      ...(row.consumed_at ? { consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) } : {}),
    };
  }

  async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    const { rows } = await pool.query(
      `SELECT payload, expires_at, consumed_at FROM oidc_models WHERE model = $1 AND uid = $2`,
      [this.model, uid],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return undefined;
    return {
      ...row.payload,
      ...(row.consumed_at ? { consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) } : {}),
    };
  }

  async consume(id: string): Promise<void> {
    await pool.query(
      `UPDATE oidc_models SET consumed_at = now() WHERE model = $1 AND id = $2`,
      [this.model, id],
    );
  }

  async destroy(id: string): Promise<void> {
    await pool.query(`DELETE FROM oidc_models WHERE model = $1 AND id = $2`, [
      this.model,
      id,
    ]);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await pool.query(`DELETE FROM oidc_models WHERE grant_id = $1`, [grantId]);
  }
}
