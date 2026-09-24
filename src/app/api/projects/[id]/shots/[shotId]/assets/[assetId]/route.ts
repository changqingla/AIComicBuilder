import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shotAssets, shots } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { assetEditSchema } from "@/lib/asset-input";

const patchSchema = assetEditSchema.omit({ id: true, sequenceInType: true }).partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; shotId: string; assetId: string }> }) {
  const { id: projectId, shotId, assetId } = await params;
  if (!(await assertProjectOwnership(request, projectId)) || !db.select().from(shots)
    .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId))).get()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const target = db.select().from(shotAssets).where(and(eq(shotAssets.id, assetId), eq(shotAssets.shotId, shotId))).get();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target.isActive) return NextResponse.json({ error: "Asset changed; refresh before editing" }, { status: 409 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid asset changes" }, { status: 400 });
  const { characters, ...fields } = parsed.data;
  db.update(shotAssets).set({ ...fields, updatedAt: new Date(),
    ...(characters !== undefined ? { characters: characters === null ? null : JSON.stringify(characters) } : {}),
  }).where(eq(shotAssets.id, assetId)).run();
  return NextResponse.json({ ok: true });
}
