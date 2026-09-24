import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shots } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { id as genId } from "@/lib/id";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { insertAssetVersion, getActiveAsset } from "@/lib/shot-asset-utils";

const uploadSchema = z
  .object({
    type: z.enum(["first_frame", "last_frame", "reference"]),
    sequenceInType: z.coerce.number().int().nonnegative(),
  })
  .refine(
    ({ type, sequenceInType }) => type === "reference" || sequenceInType === 0,
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> },
) {
  const { id: projectId, shotId } = await params;
  if (
    !(await assertProjectOwnership(request, projectId)) ||
    !db
      .select()
      .from(shots)
      .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId)))
      .get()
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const parsed = uploadSchema.safeParse(Object.fromEntries(form));
  if (
    !(file instanceof File) ||
    !parsed.success ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    return NextResponse.json(
      { error: "Invalid image or asset position" },
      { status: 400 },
    );
  }
  const { type, sequenceInType } = parsed.data;
  const previous = await getActiveAsset(shotId, type, sequenceInType);
  const directory = path.join(process.env.UPLOAD_DIR || "./uploads", "frames");
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[file.type];
  const fileUrl = path.join(directory, `${genId()}.${extension}`);
  await mkdir(directory, { recursive: true });
  await writeFile(fileUrl, Buffer.from(await file.arrayBuffer()));
  const asset = insertAssetVersion({
    shotId,
    type,
    sequenceInType,
    fileUrl,
    prompt: previous?.prompt ?? "",
    status: "completed",
  });
  return NextResponse.json(asset);
}
