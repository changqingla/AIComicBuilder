import fs from "node:fs";
import path from "node:path";

export function resolveUploadFile(filename: string): string | null {
  try {
    const root = fs.realpathSync(
      /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads",
    );
    const resolved = fs.realpathSync(filename);
    return resolved.startsWith(root + path.sep) &&
      fs.statSync(resolved).isFile()
      ? resolved
      : null;
  } catch {
    return null;
  }
}
