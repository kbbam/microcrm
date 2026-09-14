import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, initSchema } from "./db.js";

// data.json lives at the repo root, two levels up from dist/migrate.js.
const DATA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data.json",
);

interface Dataset {
  entities: Array<{ id: number; [key: string]: unknown }>;
  people: Array<{ id: number; [key: string]: unknown }>;
}

async function main() {
  await initSchema();

  const raw = readFileSync(DATA_PATH, "utf-8");
  const data = JSON.parse(raw) as Dataset;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const entity of data.entities) {
      await client.query(
        `INSERT INTO entities (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [entity.id, entity],
      );
    }

    for (const person of data.people) {
      await client.query(
        `INSERT INTO people (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [person.id, person],
      );
    }

    await client.query("COMMIT");
    console.log(
      `Migrated ${data.entities.length} entities and ${data.people.length} people into Postgres.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
