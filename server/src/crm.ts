import type { PoolClient } from "pg";
import { pool } from "./db.js";

export interface Contact {
  type: "phone" | "email" | "website" | "whatsapp" | "other";
  value: string;
  label?: string;
}

export interface CreateEntityInput {
  name: string;
  type: "organization" | "pharmacy_location";
  city?: string;
  country?: string;
  website?: string;
  leadTier?: "high" | "medium" | "watch" | "unscored";
  contacts?: Contact[];
}

export interface CaptureLeadInteractionInput {
  personName: string;
  organizationId?: number;
  title?: string;
  roleFunction?: string;
  contacts?: Contact[];
  linkedinUrl?: string;
  summary: string;
  occurredAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  actorEmail: string;
}

const ENTITY_PATCH_KEYS = new Set([
  "city",
  "country",
  "website",
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

const PEOPLE_PATCH_KEYS = new Set([
  "name",
  "resolution_status",
  "linkedin_url",
  "roles",
  "contacts",
  "event_presence",
]);

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
  if (!rows[0]?.data) return null;
  const activities = await pool.query(
    `SELECT id, entity_id, person_id, actor_email, occurred_at, summary,
            next_action, next_action_at, created_at
       FROM activities WHERE entity_id = $1 ORDER BY occurred_at DESC, id DESC`,
    [id],
  );
  return { ...rows[0].data, activities: activities.rows };
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
function noteEntry(note: string, actorEmail?: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `[${stamp}${actorEmail ? ` · ${actorEmail}` : ""}] ${note}`;
}

export async function appendEntityNote(id: number, note: string) {
  const { rows } = await pool.query(
    `UPDATE entities
        SET data = jsonb_set(
          data,
          '{notes}',
          to_jsonb(
            CASE WHEN COALESCE(data->>'notes', '') = '' THEN $2::text
                 ELSE data->>'notes' || E'\n\n' || $2::text END
          )
        )
      WHERE id = $1 RETURNING data`,
    [id, noteEntry(note)],
  );
  return rows[0]?.data ?? null;
}

export async function appendPersonNote(id: number, note: string) {
  const { rows } = await pool.query(
    `UPDATE people
        SET data = jsonb_set(
          data,
          '{notes}',
          to_jsonb(
            CASE WHEN COALESCE(data->>'notes', '') = '' THEN $2::text
                 ELSE data->>'notes' || E'\n\n' || $2::text END
          )
        )
      WHERE id = $1 RETURNING data`,
    [id, noteEntry(note)],
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
  if (!rows[0]?.data) return null;
  const activities = await pool.query(
    `SELECT id, entity_id, person_id, actor_email, occurred_at, summary,
            next_action, next_action_at, created_at
       FROM activities WHERE person_id = $1 ORDER BY occurred_at DESC, id DESC`,
    [id],
  );
  return { ...rows[0].data, activities: activities.rows };
}

export async function updatePerson(id: number, patch: Record<string, unknown>) {
  const clean = sanitizePatch(patch, PEOPLE_PATCH_KEYS);
  const { rows } = await pool.query(
    `UPDATE people SET data = data || $2::jsonb WHERE id = $1 RETURNING data`,
    [id, JSON.stringify(clean)],
  );
  return rows[0]?.data ?? null;
}

function cleanOptional(value: string | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function contactKey(contact: Contact): string {
  const value = contact.type === "email"
    ? contact.value.trim().toLowerCase()
    : contact.type === "phone" || contact.type === "whatsapp"
      ? contact.value.replace(/\D/g, "")
      : contact.value.trim().toLowerCase();
  return `${contact.type}:${value}`;
}

function mergeContacts(existing: unknown, incoming: Contact[]): Contact[] {
  const result = Array.isArray(existing) ? [...existing] as Contact[] : [];
  const seen = new Set(result.map(contactKey));
  for (const contact of incoming) {
    const key = contactKey(contact);
    if (!seen.has(key)) {
      result.push(contact);
      seen.add(key);
    }
  }
  return result;
}

async function appendNoteWithClient(
  client: PoolClient,
  table: "entities" | "people",
  id: number,
  entry: string,
): Promise<void> {
  await client.query(
    `UPDATE ${table}
        SET data = jsonb_set(
          data,
          '{notes}',
          to_jsonb(
            CASE WHEN COALESCE(data->>'notes', '') = '' THEN $2::text
                 ELSE data->>'notes' || E'\n\n' || $2::text END
          )
        )
      WHERE id = $1`,
    [id, entry],
  );
}

async function getRecordWithActivities(
  client: PoolClient,
  kind: "entities" | "people",
  id: number,
) {
  const idColumn = kind === "entities" ? "entity_id" : "person_id";
  const record = await client.query(`SELECT data FROM ${kind} WHERE id = $1`, [id]);
  if (!record.rows[0]?.data) return null;
  const activities = await client.query(
    `SELECT id, entity_id, person_id, actor_email, occurred_at, summary,
            next_action, next_action_at, created_at
       FROM activities WHERE ${idColumn} = $1 ORDER BY occurred_at DESC, id DESC`,
    [id],
  );
  return { ...record.rows[0].data, activities: activities.rows };
}

async function allocateId(
  client: PoolClient,
  kind: "entities" | "people",
): Promise<number> {
  // IDs in the imported snapshot are explicit integers. Serialize every
  // allocation for a table, then choose max+1 inside the transaction. This
  // avoids both ID races and sequence drift after a seed import.
  const lockId = kind === "entities" ? 638274101 : 638274102;
  await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);
  const result = await client.query(
    `SELECT (COALESCE(MAX(id), 0) + 1)::int AS id FROM ${kind}`,
  );
  return result.rows[0].id as number;
}

export async function createEntity(input: CreateEntityInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dedupeKey = `entity:${input.name.trim().toLowerCase()}:${(input.city ?? "").trim().toLowerCase()}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [dedupeKey]);

    const duplicate = await client.query(
      `SELECT data FROM entities
        WHERE lower(data->>'name') = lower($1)
          AND lower(COALESCE(data->>'city', '')) = lower($2)
        ORDER BY id LIMIT 1 FOR UPDATE`,
      [input.name.trim(), input.city?.trim() ?? ""],
    );
    if (duplicate.rows[0]) {
      await client.query("COMMIT");
      return { created: false, entity: duplicate.rows[0].data };
    }

    const id = await allocateId(client, "entities");
    const entity = {
      id,
      name: input.name.trim(),
      type: input.type,
      city: cleanOptional(input.city),
      country: cleanOptional(input.country),
      website: cleanOptional(input.website),
      commercial_role: null,
      cannabis_status: null,
      resolution_status: "confirmed",
      target_classes: [],
      bam_fit: null,
      commercial_position: null,
      contacts: mergeContacts([], input.contacts ?? []),
      cannabis_evidence: [],
      sis_observations: [],
      sis_identities: [],
      relationships_out: [],
      relationships_in: [],
      attendance_evidence: [],
      people: [],
      lead_tier: input.leadTier ?? "unscored",
    };
    await client.query(`INSERT INTO entities (id, data) VALUES ($1, $2::jsonb)`, [
      id,
      JSON.stringify(entity),
    ]);
    await client.query("COMMIT");
    return { created: true, entity };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function captureLeadInteraction(input: CaptureLeadInteractionInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null;
    if (Number.isNaN(occurredAt.getTime()) || (nextActionAt && Number.isNaN(nextActionAt.getTime()))) {
      throw new Error("Invalid occurred_at or next_action_at date.");
    }

    let entity: Record<string, any> | null = null;
    if (input.organizationId !== undefined) {
      const entityResult = await client.query(
        `SELECT data FROM entities WHERE id = $1 FOR UPDATE`,
        [input.organizationId],
      );
      entity = entityResult.rows[0]?.data ?? null;
      if (!entity) throw new Error(`No entity with id ${input.organizationId}.`);
    }

    const normalizedName = input.personName.trim().toLowerCase();
    const dedupeKey = `person:${normalizedName}:${input.organizationId ?? "none"}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [dedupeKey]);

    const candidates = await client.query(
      `SELECT data FROM people
        WHERE lower(data->>'name') = $1
          AND ($2::int IS NULL OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(data->'roles', '[]'::jsonb)) role
             WHERE (role->>'entity_id')::int = $2
          ))
        ORDER BY id FOR UPDATE`,
      [normalizedName, input.organizationId ?? null],
    );
    if (candidates.rows.length > 1) {
      throw new Error("Multiple matching people found; use get_person and update the intended record.");
    }

    let person = candidates.rows[0]?.data as Record<string, any> | undefined;
    const createdPerson = !person;
    if (!person) {
      const id = await allocateId(client, "people");
      const roles = entity ? [{
        entity_id: entity.id,
        org_name_text: entity.name,
        title: cleanOptional(input.title),
        function: cleanOptional(input.roleFunction),
        role_status: "current",
        confidence: "high",
      }] : [];
      person = {
        id,
        name: input.personName.trim(),
        resolution_status: "confirmed",
        linkedin_url: cleanOptional(input.linkedinUrl),
        notes: null,
        roles,
        contacts: input.contacts ?? [],
        event_presence: [],
        observations: [],
      };
      await client.query(`INSERT INTO people (id, data) VALUES ($1, $2::jsonb)`, [
        id,
        JSON.stringify(person),
      ]);
    } else {
      person.contacts = mergeContacts(person.contacts, input.contacts ?? []);
      if (!person.linkedin_url && input.linkedinUrl) person.linkedin_url = input.linkedinUrl.trim();
      if (entity) {
        const role = (person.roles ?? []).find((item: any) => item.entity_id === entity!.id);
        if (role) {
          if (input.title) role.title = input.title.trim();
          if (input.roleFunction) role.function = input.roleFunction.trim();
        } else {
          person.roles = [...(person.roles ?? []), {
            entity_id: entity.id,
            org_name_text: entity.name,
            title: cleanOptional(input.title),
            function: cleanOptional(input.roleFunction),
            role_status: "current",
            confidence: "high",
          }];
        }
      }
      await client.query(`UPDATE people SET data = $2::jsonb WHERE id = $1`, [
        person.id,
        JSON.stringify(person),
      ]);
    }

    if (entity) {
      const member = (entity.people ?? []).find((item: any) => item.person_id === person!.id);
      if (member) {
        if (input.title) member.title = input.title.trim();
        if (input.roleFunction) member.function = input.roleFunction.trim();
      } else {
        entity.people = [...(entity.people ?? []), {
          person_id: person.id,
          title: cleanOptional(input.title),
          function: cleanOptional(input.roleFunction),
          role_status: "current",
          confidence: "high",
          org_name_text: entity.name,
        }];
      }
      await client.query(`UPDATE entities SET data = $2::jsonb WHERE id = $1`, [
        entity.id,
        JSON.stringify(entity),
      ]);
    }

    const activityResult = await client.query(
      `INSERT INTO activities
        (entity_id, person_id, actor_email, occurred_at, summary, next_action, next_action_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, entity_id, person_id, actor_email, occurred_at, summary,
                 next_action, next_action_at, created_at`,
      [
        entity?.id ?? null,
        person.id,
        input.actorEmail,
        occurredAt,
        input.summary.trim(),
        cleanOptional(input.nextAction),
        nextActionAt,
      ],
    );

    const note = `${input.summary.trim()}${input.nextAction ? ` Next: ${input.nextAction.trim()}${nextActionAt ? ` (${nextActionAt.toISOString()})` : ""}.` : ""}`;
    const entry = noteEntry(note, input.actorEmail);
    await appendNoteWithClient(client, "people", person.id, entry);
    if (entity) await appendNoteWithClient(client, "entities", entity.id, entry);

    const freshPerson = await getRecordWithActivities(client, "people", person.id);
    const freshEntity = entity
      ? await getRecordWithActivities(client, "entities", entity.id)
      : null;
    await client.query("COMMIT");
    return {
      created_person: createdPerson,
      person: freshPerson,
      entity: freshEntity,
      activity: activityResult.rows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
