import { pool } from "./db.js";

const ENTITY_PATCH_KEYS = new Set([
  "lead_tier",
  "bam_fit",
  "commercial_position",
  "commercial_role",
  "contacts",
  "cannabis_status",
  "target_classes",
  "cannabis_relevance_status",
  "cannabis_evidence_strength",
]);

const PEOPLE_PATCH_KEYS = new Set(["roles", "contacts", "event_presence"]);

function sanitizePatch(
  patch: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) clean[key] = value;
  }
  return clean;
}

export async function searchEntities(opts: {
  query?: string;
  type?: string;
  leadTier?: string;
  cannabisStatus?: string;
  limit?: number;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    clauses.push(`lower(data->>'name') LIKE $${params.length}`);
  }
  if (opts.type) {
    params.push(opts.type);
    clauses.push(`data->>'type' = $${params.length}`);
  }
  if (opts.leadTier) {
    params.push(opts.leadTier);
    clauses.push(`data->>'lead_tier' = $${params.length}`);
  }
  if (opts.cannabisStatus) {
    params.push(opts.cannabisStatus);
    clauses.push(`data->>'cannabis_status' = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT data FROM entities ${where} ORDER BY id LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => r.data);
}

export async function getEntity(id: number) {
  const { rows } = await pool.query(
    `SELECT data FROM entities WHERE id = $1`,
    [id],
  );
  return rows[0]?.data ?? null;
}

export async function updateEntity(id: number, patch: Record<string, unknown>) {
  const clean = sanitizePatch(patch, ENTITY_PATCH_KEYS);
  const { rows } = await pool.query(
    `UPDATE entities SET data = data || $2::jsonb WHERE id = $1 RETURNING data`,
    [id, JSON.stringify(clean)],
  );
  return rows[0]?.data ?? null;
}

export async function searchPeople(opts: { query?: string; limit?: number }) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    clauses.push(`lower(data->>'name') LIKE $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT data FROM people ${where} ORDER BY id LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => r.data);
}

export async function getPerson(id: number) {
  const { rows } = await pool.query(`SELECT data FROM people WHERE id = $1`, [
    id,
  ]);
  return rows[0]?.data ?? null;
}

export async function updatePerson(id: number, patch: Record<string, unknown>) {
  const clean = sanitizePatch(patch, PEOPLE_PATCH_KEYS);
  const { rows } = await pool.query(
    `UPDATE people SET data = data || $2::jsonb WHERE id = $1 RETURNING data`,
    [id, JSON.stringify(clean)],
  );
  return rows[0]?.data ?? null;
}
