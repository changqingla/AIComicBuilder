import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export default function setup() {
  const uploads = process.env.UPLOAD_DIR!;
  mkdirSync(uploads, { recursive: true });
  writeFileSync(
    path.join(uploads, "frame.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=24",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    path.join(uploads, "clip.mp4"),
  ]);
  return () =>
    rmSync(process.env.AICOMIC_E2E_DIR!, { recursive: true, force: true });
}
