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

// A full entity (contacts, relationships, evidence, long excerpt text, ...)
// runs to a few KB each; 296 of them in one search result is ~700KB of JSON.
// That's fine for an agent's targeted query (a handful of rows), but the
// artifact's initial full-dataset sync was requesting all 296 in one call at
// full detail, which is both wasteful and a real risk of tripping some
// transport's size limit -- summary mode returns just what a list view / a
// name lookup needs; get_entity still returns full detail for one record.
const ENTITY_SUMMARY_PROJECTION =
  "jsonb_build_object('id', data->'id', 'name', data->'name', 'type', data->'type', 'city', data->'city', 'country', data->'country', 'lead_tier', data->'lead_tier', 'cannabis_status', data->'cannabis_status')";
const PEOPLE_SUMMARY_PROJECTION =
  "jsonb_build_object('id', data->'id', 'name', data->'name', 'roles', data->'roles', 'resolution_status', data->'resolution_status')";

export async function searchEntities(opts: {
  query?: string;
  type?: string;
  leadTier?: string;
  cannabisStatus?: string;
  limit?: number;
  summary?: boolean;
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
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 1000);
  params.push(limit);
  const projection = opts.summary ? ENTITY_SUMMARY_PROJECTION : "data";

  const { rows } = await pool.query(
    `SELECT ${projection} AS data FROM entities ${where} ORDER BY id LIMIT $${params.length}`,
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

// Notes are append-only on purpose: they're not in ENTITY_PATCH_KEYS /
// PEOPLE_PATCH_KEYS, so the only way to change them is through here, which
// always appends to the existing text rather than letting a shallow-merge
// patch silently overwrite a colleague's earlier notes.
function appendNoteText(existing: unknown, note: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `[${stamp}] ${note}`;
  return typeof existing === "string" && existing.length > 0
    ? `${existing}\n\n${entry}`
    : entry;
}

export async function appendEntityNote(id: number, note: string) {
  const current = await getEntity(id);
  if (!current) return null;
  const updated = appendNoteText((current as any).notes, note);
  const { rows } = await pool.query(
    `UPDATE entities SET data = jsonb_set(data, '{notes}', to_jsonb($2::text)) WHERE id = $1 RETURNING data`,
    [id, updated],
  );
  return rows[0]?.data ?? null;
}

export async function appendPersonNote(id: number, note: string) {
  const current = await getPerson(id);
  if (!current) return null;
  const updated = appendNoteText((current as any).notes, note);
  const { rows } = await pool.query(
    `UPDATE people SET data = jsonb_set(data, '{notes}', to_jsonb($2::text)) WHERE id = $1 RETURNING data`,
    [id, updated],
  );
  return rows[0]?.data ?? null;
}

export async function searchPeople(opts: { query?: string; limit?: number; summary?: boolean }) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    clauses.push(`lower(data->>'name') LIKE $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 1000);
  params.push(limit);
  const projection = opts.summary ? PEOPLE_SUMMARY_PROJECTION : "data";

  const { rows } = await pool.query(
    `SELECT ${projection} AS data FROM people ${where} ORDER BY id LIMIT $${params.length}`,
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
