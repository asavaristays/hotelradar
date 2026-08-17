import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pool } from "./pool.js";
import { log } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sqlDir(): string {
  const candidates = [
    join(__dirname, "../../../../infra/sql"),
    join(process.cwd(), "infra/sql"),
    join(process.cwd(), "../../infra/sql"),
  ];
  for (const dir of candidates) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error("Could not locate infra/sql migrations directory");
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = sqlDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE id = $1",
      [id]
    );
    if (existing.rowCount) {
      log.info("migration already applied", { id });
      continue;
    }

    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
        [id]
      );
      await client.query("COMMIT");
      log.info("migration applied", { id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  migrate()
    .then(() => pool.end())
    .catch(async (error) => {
      log.error("migration failed", { error: String(error) });
      await pool.end();
      process.exit(1);
    });
}
