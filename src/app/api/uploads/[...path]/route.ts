import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { resolveUploadFile } from "@/lib/upload-files";

const uploadDir = process.env.UPLOAD_DIR || "./uploads";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  // Uploaded files are supplied in the runtime upload directory.
  const filePath = path.join(
    /* turbopackIgnore: true */ uploadDir,
    ...segments,
  );

  const resolved = resolveUploadFile(filePath);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(resolved);

  return new NextResponse(buffer, {
    headers: { "Content-Type": contentType },
  });
}
