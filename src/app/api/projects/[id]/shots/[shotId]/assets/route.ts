import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shotAssets, shots } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { replaceAssetsSchema } from "@/lib/asset-input";
import { insertAssetVersion } from "@/lib/shot-asset-utils";

// Replace the active items of exactly one type. An empty list clears that type.
export async function PUT(
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
  const parsed = replaceAssetsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid asset list" }, { status: 400 });
  const { type, items } = parsed.data;
  const existing = db
    .select()
    .from(shotAssets)
    .where(and(eq(shotAssets.shotId, shotId), eq(shotAssets.type, type)))
    .all();
  for (const item of items) {
    const row = item.id
      ? db.select().from(shotAssets).where(eq(shotAssets.id, item.id)).get()
      : undefined;
    if (
      row &&
      (row.shotId !== shotId ||
        row.type !== type ||
        row.sequenceInType !== item.sequenceInType ||
        !row.isActive)
    ) {
      return NextResponse.json(
        { error: "Asset changed; refresh before editing" },
        { status: 409 },
      );
    }
  }
  db.transaction((tx) => {
    const submitted = new Set(items.map((item) => item.id));
    for (const row of existing.filter(
      (row) => row.isActive && !submitted.has(row.id),
    )) {
      tx.update(shotAssets)
        .set({ isActive: 0 })
        .where(eq(shotAssets.id, row.id))
        .run();
    }
    for (const item of items) {
      const row = existing.find((row) => row.id === item.id);
      if (row) {
        tx.update(shotAssets)
          .set({
            prompt: item.prompt,
            characters:
              item.characters === undefined
                ? row.characters
                : JSON.stringify(item.characters),
            modelProvider: item.modelProvider,
            modelId: item.modelId,
            updatedAt: new Date(),
          })
          .where(eq(shotAssets.id, row.id))
          .run();
      } else {
        insertAssetVersion({ shotId, type, ...item });
      }
    }
  });
  return NextResponse.json({ ok: true });
}
