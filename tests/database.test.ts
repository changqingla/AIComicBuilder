import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import { db, runMigrations } from "@/lib/db";

const journal = JSON.parse(
  fs.readFileSync("drizzle/meta/_journal.json", "utf8"),
);

describe("database initialization", () => {
  test("reuses its connection and initializes the current schema", () => {
    runMigrations();
    runMigrations();
    expect(db.$client).toBe(db.$client);
    expect(
      db.$client
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('agents', 'agent_bindings', 'shot_assets')",
        )
        .all(),
    ).toHaveLength(3);
  });

  test("migrations are ordered by increasing timestamps", () => {
    const times = journal.entries.map((entry: { when: number }) => entry.when);
    expect(
      times.every(
        (time: number, index: number) => index === 0 || time > times[index - 1],
      ),
    ).toBe(true);
  });

  test("moves existing media into assets before removing the old columns", () => {
    const folder = path.join(process.env.UPLOAD_DIR!, "migrations");
    fs.mkdirSync(path.join(folder, "meta"), { recursive: true });
    const entries = journal.entries.slice(0, 50);
    fs.writeFileSync(
      path.join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    for (const entry of entries)
      fs.copyFileSync(
        `drizzle/${entry.tag}.sql`,
        path.join(folder, `${entry.tag}.sql`),
      );
    const sqlite = new Database(":memory:");
    try {
      const connection = drizzle(sqlite);
      migrate(connection, { migrationsFolder: folder });
      sqlite
        .prepare(
          "INSERT INTO projects (id, title, created_at, updated_at) VALUES ('p', 'Test', 1, 1)",
        )
        .run();
      sqlite
        .prepare(
          "INSERT INTO shots (id, project_id, sequence, first_frame, last_frame, video_url, start_frame_desc, reference_images) VALUES ('s', 'p', 1, 'first.png', 'last.png', 'video.mp4', 'First frame prompt', ?)",
        )
        .run(
          JSON.stringify([
            {
              type: "reference",
              prompt: "Ref prompt",
              imagePath: "ref-new.png",
              history: ["ref-old.png", "ref-new.png"],
              characters: ["Alice"],
            },
          ]),
        );
      migrate(connection, { migrationsFolder: "drizzle" });
      expect(
        sqlite
          .prepare(
            "SELECT type, file_url FROM shot_assets WHERE is_active = 1 ORDER BY type",
          )
          .all(),
      ).toEqual([
        { type: "first_frame", file_url: "first.png" },
        { type: "keyframe_video", file_url: "video.mp4" },
        { type: "last_frame", file_url: "last.png" },
        { type: "reference", file_url: "ref-new.png" },
      ]);
      expect(
        sqlite
          .prepare("SELECT file_url FROM shot_assets WHERE is_active = 0")
          .all(),
      ).toEqual([{ file_url: "ref-old.png" }]);
      expect(
        sqlite
          .prepare("SELECT prompt FROM shot_assets WHERE type = 'first_frame'")
          .get(),
      ).toEqual({ prompt: "First frame prompt" });
      expect(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE name = 'agents'")
          .get(),
      ).toBeTruthy();
      expect(
        sqlite.prepare("PRAGMA table_info(shots)").all(),
      ).not.toContainEqual(expect.objectContaining({ name: "first_frame" }));
    } finally {
      sqlite.close();
    }
  });
});
