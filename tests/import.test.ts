import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { extractTextFromFile } from "@/lib/import-utils";

test("PDF import extracts the screenplay with the maintained parser", async () => {
  const file = readFileSync(
    new URL("./fixtures/short-script.pdf", import.meta.url),
  );
  expect(await extractTextFromFile(file, "short-script.pdf")).toContain(
    "SCENE 1: A quiet forest.",
  );
});
