import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to an isolated test Postgres database.");
}
process.env.LOCAL_INSECURE_DB = "1";

const { initSchema, pool } = await import("../dist/db.js");
const crm = await import("../dist/crm.js");

before(async () => {
  await initSchema();
});

beforeEach(async () => {
  await pool.query("TRUNCATE activities, people, entities RESTART IDENTITY CASCADE");
});

after(async () => {
  await pool.end();
});

test("createEntity assigns an id and returns an exact duplicate instead of inserting twice", async () => {
  const first = await crm.createEntity({
    name: "Event Test GmbH",
    type: "organization",
    city: "Munich",
    country: "Germany",
  });
  const second = await crm.createEntity({
    name: "event test gmbh",
    type: "organization",
    city: "MUNICH",
  });

  assert.equal(first.created, true);
  assert.equal(first.entity.id, 1);
  assert.equal(second.created, false);
  assert.equal(second.entity.id, first.entity.id);
  const count = await pool.query("SELECT count(*)::int AS count FROM entities");
  assert.equal(count.rows[0].count, 1);
});

test("captureLeadInteraction creates and links a person and persists an attributed activity", async () => {
  const { entity } = await crm.createEntity({
    name: "Card Company",
    type: "organization",
    city: "Munich",
  });

  const result = await crm.captureLeadInteraction({
    personName: "Ada Event",
    organizationId: entity.id,
    title: "Head of Purchasing",
    contacts: [
      { type: "email", value: "ada@example.com", label: "Work" },
      { type: "phone", value: "+49 170 1234567", label: "Mobile" },
    ],
    summary: "Discussed flower supply and exchanged business cards.",
    occurredAt: "2026-09-15T10:30:00+02:00",
    nextAction: "Send the catalogue",
    nextActionAt: "2026-09-16T09:00:00+02:00",
    actorEmail: "colleague@example.com",
  });

  assert.equal(result.created_person, true);
  assert.equal(result.person.name, "Ada Event");
  assert.equal(result.person.roles[0].entity_id, entity.id);
  assert.equal(result.entity.people[0].person_id, result.person.id);
  assert.equal(result.activity.actor_email, "colleague@example.com");
  assert.equal(result.activity.next_action, "Send the catalogue");
  assert.equal(result.person.activities.length, 1);
  assert.match(result.person.notes, /Discussed flower supply/);
  assert.match(result.entity.notes, /Send the catalogue/);
});

test("a second capture matches the same person, merges contacts, and preserves both activities", async () => {
  const { entity } = await crm.createEntity({
    name: "Repeat Meeting AG",
    type: "organization",
  });
  const base = {
    personName: "Grace Repeat",
    organizationId: entity.id,
    summary: "First meeting",
    actorEmail: "one@example.com",
  };
  const first = await crm.captureLeadInteraction({
    ...base,
    contacts: [{ type: "email", value: "grace@example.com" }],
  });
  const second = await crm.captureLeadInteraction({
    ...base,
    summary: "Second meeting",
    actorEmail: "two@example.com",
    title: "Commercial Director",
    roleFunction: "Purchasing",
    contacts: [
      { type: "email", value: "GRACE@example.com" },
      { type: "phone", value: "+49 89 1234" },
    ],
  });

  assert.equal(first.created_person, true);
  assert.equal(second.created_person, false);
  assert.equal(second.person.id, first.person.id);
  assert.equal(second.person.contacts.length, 2);
  assert.equal(second.person.activities.length, 2);
  assert.equal(second.person.roles[0].title, "Commercial Director");
  assert.equal(second.entity.people[0].title, "Commercial Director");
  assert.equal(second.person.roles[0].function, "Purchasing");
  assert.equal(second.entity.people[0].function, "Purchasing");
  assert.match(second.person.notes, /First meeting/);
  assert.match(second.person.notes, /Second meeting/);
});

test("concurrent note appends do not overwrite one another", async () => {
  const created = await crm.captureLeadInteraction({
    personName: "Concurrent Contact",
    summary: "Initial meeting",
    actorEmail: "owner@example.com",
  });
  const notes = Array.from({ length: 20 }, (_, index) => `concurrent-note-${index}`);

  await Promise.all(notes.map((note) => crm.appendPersonNote(created.person.id, note)));
  const person = await crm.getPerson(created.person.id);

  for (const note of notes) assert.match(person.notes, new RegExp(note));
  assert.equal((person.notes.match(/concurrent-note-/g) ?? []).length, notes.length);
});

test("concurrent captures create one person and preserve every activity", async () => {
  const { entity } = await crm.createEntity({
    name: "Concurrent Capture GmbH",
    type: "organization",
  });
  const captures = Array.from({ length: 10 }, (_, index) =>
    crm.captureLeadInteraction({
      personName: "One Shared Person",
      organizationId: entity.id,
      summary: `meeting-${index}`,
      actorEmail: `colleague-${index}@example.com`,
    }));

  const results = await Promise.all(captures);
  assert.equal(results.filter((result) => result.created_person).length, 1);
  const peopleCount = await pool.query("SELECT count(*)::int AS count FROM people");
  const activityCount = await pool.query("SELECT count(*)::int AS count FROM activities");
  assert.equal(peopleCount.rows[0].count, 1);
  assert.equal(activityCount.rows[0].count, 10);
  const person = await crm.getPerson(results[0].person.id);
  assert.equal(person.activities.length, 10);
});

test("concurrent entity creation allocates unique IDs", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) => crm.createEntity({
      name: `Concurrent Entity ${index}`,
      type: "organization",
    })),
  );
  const ids = results.map((result) => result.entity.id);
  assert.equal(new Set(ids).size, results.length);
  const count = await pool.query("SELECT count(*)::int AS count FROM entities");
  assert.equal(count.rows[0].count, results.length);
});

test("capture rolls back when the requested organization does not exist", async () => {
  await assert.rejects(
    crm.captureLeadInteraction({
      personName: "Nobody Persisted",
      organizationId: 999999,
      summary: "This must roll back",
      actorEmail: "owner@example.com",
    }),
    /No entity with id 999999/,
  );
  const counts = await pool.query(
    `SELECT (SELECT count(*)::int FROM people) AS people,
            (SELECT count(*)::int FROM activities) AS activities`,
  );
  assert.deepEqual(counts.rows[0], { people: 0, activities: 0 });
});

test("common correction fields update while unknown fields remain blocked", async () => {
  const { entity } = await crm.createEntity({
    name: "Typo Compny",
    type: "organization",
  });
  const captured = await crm.captureLeadInteraction({
    personName: "Ada Typo",
    organizationId: entity.id,
    summary: "Initial capture",
    actorEmail: "owner@example.com",
  });

  const updatedEntity = await crm.updateEntity(entity.id, {
    city: "Cologne",
    forbidden: "must not persist",
  });
  const updatedPerson = await crm.updatePerson(captured.person.id, {
    name: "Ada Corrected",
    linkedin_url: "https://www.linkedin.com/in/ada-corrected",
    forbidden: "must not persist",
  });

  assert.equal(updatedEntity.name, "Typo Compny");
  assert.equal(updatedEntity.city, "Cologne");
  assert.equal(updatedEntity.forbidden, undefined);
  assert.equal(updatedPerson.name, "Ada Corrected");
  assert.equal(updatedPerson.linkedin_url, "https://www.linkedin.com/in/ada-corrected");
  assert.equal(updatedPerson.forbidden, undefined);
});
