import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

const databaseState = globalThis as typeof globalThis & {
  comicDb?: DrizzleDB;
};

function getDatabase(): DrizzleDB {
  if (databaseState.comicDb) return databaseState.comicDb;

  // Open the native connection lazily, after Next.js has loaded runtime settings.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const filename = path.resolve(process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/aicomic.db");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  databaseState.comicDb = drizzle(sqlite, { schema });
  return databaseState.comicDb;
}

export function runMigrations() {
  migrate(getDatabase(), { migrationsFolder: path.resolve("drizzle") });
}

export const db: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_, property) {
    const instance = getDatabase();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type DB = typeof db;
