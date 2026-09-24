import { beforeAll, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assembleVideo } from "@/lib/video/ffmpeg";

const file = (name: string) => path.join(process.env.UPLOAD_DIR!, name);
const probe = (video: string) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
      { encoding: "utf8" },
    ),
  );
beforeAll(() => {
  for (const [name, color, frequency] of [
    ["a", "red", 440],
    ["b", "blue", 660],
  ] as const) {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=${color}:s=160x90:r=30:d=2`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=2`,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      file(`${name}.mp4`),
    ]);
  }
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=black:s=160x90:r=30:d=2",
    "-c:v",
    "libx264",
    file("silent.mp4"),
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=0.5",
    file("bgm.wav"),
  ]);
});

for (const transition of [
  "cut",
  "dissolve",
  "fade_in",
  "fade_out",
  "wipeleft",
  "slideright",
  "circleopen",
] as const) {
  test(`${transition} preserves sound and uses the same timeline for subtitles`, async () => {
    const result = await assembleVideo({
      projectId: `test-${transition}`,
      videoPaths: [file("a.mp4"), file("b.mp4")],
      transitions: [transition],
      subtitles: [
        {
          shotIndex: 1,
          text: "Second retained shot (original sequence 3)",
          dialogueSequence: 0,
          dialogueCount: 1,
        },
      ],
    });
    const metadata = probe(result.videoPath);
    expect(
      metadata.streams.some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ),
    ).toBe(true);
    expect(Number(metadata.format.duration)).toBeCloseTo(
      transition === "cut" ? 4 : 3.5,
      1,
    );
    expect(fs.readFileSync(result.srtPath!, "utf8")).toContain(
      transition === "cut"
        ? "00:00:02,000 --> 00:00:04,000"
        : "00:00:01,500 --> 00:00:03,500",
    );
  });
}

test("silent clips retain their duration and short background music does not truncate the video", async () => {
  const result = await assembleVideo({
    projectId: "music",
    videoPaths: [file("silent.mp4"), file("a.mp4")],
    subtitles: [],
    bgmPath: file("bgm.wav"),
  });
  expect(Number(probe(result.videoPath).format.duration)).toBeCloseTo(4, 1);
  const audio = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    result.videoPath,
    "-ss",
    "2.5",
    "-t",
    "0.25",
    "-f",
    "f32le",
    "-ac",
    "1",
    "-ar",
    "8000",
    "pipe:1",
  ]);
  const samples = Array.from({ length: audio.length / 4 }, (_, index) =>
    audio.readFloatLE(index * 4),
  );
  const magnitude = (hz: number) =>
    Math.hypot(
      ...[Math.cos, Math.sin].map(
        (fn) =>
          samples.reduce(
            (sum, value, index) =>
              sum + value * fn((2 * Math.PI * hz * index) / 8000),
            0,
          ) / samples.length,
      ),
    );
  expect(magnitude(440)).toBeGreaterThan(0.02);
  expect(magnitude(880)).toBeGreaterThan(0.005);
});
