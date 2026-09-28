import { cpSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Match the files copied into the Docker runtime image.
const directory = path.resolve(".next/standalone");
for (const name of ["public", ".next/static", "drizzle"]) {
  cpSync(name, path.join(directory, name), { recursive: true });
}
process.chdir(directory);
await import(pathToFileURL(path.join(directory, "server.js")).href);
