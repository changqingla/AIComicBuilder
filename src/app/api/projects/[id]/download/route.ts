import { db } from "@/lib/db";
import {
  projects,
  episodes,
  shots,
  characters,
  episodeCharacters,
  storyboardVersions,
  shotAssets,
} from "@/lib/db/schema";
import { and, eq, asc, desc } from "drizzle-orm";
import archiver from "archiver";
import path from "node:path";
import fs from "node:fs";
import { getUserIdFromRequest } from "@/lib/get-user-id";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getUserIdFromRequest(request);

  const [project] = userId
    ? await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    : [];

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const query = new URL(request.url).searchParams;
  const episodeId = query.get("episodeId");
  const versionId = query.get("versionId");
  if (!episodeId) {
    return new Response("Episode is required", { status: 400 });
  }

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
  if (!episode) {
    return new Response("Episode not found", { status: 404 });
  }

  const [version] = await db
    .select()
    .from(storyboardVersions)
    .where(
      and(
        eq(storyboardVersions.projectId, projectId),
        eq(storyboardVersions.episodeId, episodeId),
        versionId ? eq(storyboardVersions.id, versionId) : undefined,
      )
    )
    .orderBy(desc(storyboardVersions.versionNum))
    .limit(1);
  if (!version) {
    return new Response("Storyboard version not found", { status: 404 });
  }

  const episodeChars = await db
    .select({ name: characters.name, referenceImage: characters.referenceImage })
    .from(characters)
    .innerJoin(episodeCharacters, eq(episodeCharacters.characterId, characters.id))
    .where(
      and(eq(characters.projectId, projectId), eq(episodeCharacters.episodeId, episodeId))
    );

  const assets = await db
    .select({
      sequence: shots.sequence,
      type: shotAssets.type,
      sequenceInType: shotAssets.sequenceInType,
      fileUrl: shotAssets.fileUrl,
    })
    .from(shotAssets)
    .innerJoin(shots, eq(shotAssets.shotId, shots.id))
    .where(
      and(
        eq(shots.projectId, projectId),
        eq(shots.episodeId, episodeId),
        eq(shots.versionId, version.id),
        eq(shotAssets.isActive, 1),
      )
    )
    .orderBy(asc(shots.sequence), asc(shotAssets.type), asc(shotAssets.sequenceInType));

  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Uint8Array[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const uploadRoot = fs.existsSync(uploadDir) ? fs.realpathSync(uploadDir) : uploadDir;

  function addFile(srcPath: string, archiveName: string) {
    if (!fs.existsSync(srcPath)) return;
    const abs = fs.realpathSync(srcPath);
    if (!abs.startsWith(uploadRoot + path.sep) || !fs.statSync(abs).isFile()) return;
    archive.file(abs, { name: archiveName });
  }

  for (const char of episodeChars) {
    if (char.referenceImage) {
      const ext = path.extname(char.referenceImage) || ".png";
      const safeName = char.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_");
      addFile(char.referenceImage, `characters/${safeName}${ext}`);
    }
  }

  for (const asset of assets) {
    if (!asset.fileUrl) continue;
    const prefix = `shot-${String(asset.sequence).padStart(2, "0")}`;
    const name = asset.type === "reference"
      ? `reference-${String(asset.sequenceInType + 1).padStart(2, "0")}`
      : asset.type.replace(/_/g, "-");
    const ext = path.extname(asset.fileUrl);
    addFile(asset.fileUrl, `${prefix}/${name}${ext}`);
  }

  if (episode.finalVideoUrl) {
    const ext = path.extname(episode.finalVideoUrl) || ".mp4";
    addFile(episode.finalVideoUrl, `final-video${ext}`);
  }

  await archive.finalize();

  const buffer = Buffer.concat(chunks);
  const safeName = (project.title || "project").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}-storyboard.zip"`,
    },
  });
}
