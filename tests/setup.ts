import { afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "aicomic-test-"));
process.env.DATABASE_URL = `file:${path.join(testDirectory, "test.db")}`;
process.env.UPLOAD_DIR = path.join(testDirectory, "uploads");
fs.mkdirSync(process.env.UPLOAD_DIR);

afterAll(async () => {
  const { db } = await import("@/lib/db");
  db.$client.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
