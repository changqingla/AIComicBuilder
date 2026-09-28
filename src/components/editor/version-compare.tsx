"use client";

import { fetchJson } from "@/lib/api-fetch";
import { getFirstFrameUrl } from "@/lib/shot-assets";
import { uploadUrl } from "@/lib/utils/upload-url";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { useTranslations } from "next-intl";
import { useState } from "react";
import useSWR from "swr";

interface Version {
  id: string;
  label: string;
  versionNum: number;
}

interface VersionCompareProps {
  versions: Version[];
  projectId: string;
  episodeId: string;
}

export function VersionCompare({
  versions,
  projectId,
  episodeId,
}: VersionCompareProps) {
  const t = useTranslations();
  const [versionAId, setVersionAId] = useState(versions[0]?.id || "");
  const [versionBId, setVersionBId] = useState(versions[1]?.id || "");

  const url = `/api/projects/${projectId}/episodes/${episodeId}`;
  const { data: versionA, error: errorA } = useSWR<EpisodeDetail>(
    versionAId ? `${url}?versionId=${versionAId}` : null,
    fetchJson,
  );
  const { data: versionB, error: errorB } = useSWR<EpisodeDetail>(
    versionBId ? `${url}?versionId=${versionBId}` : null,
    fetchJson,
  );
  const shotsA = versionA?.shots ?? [];
  const shotsB = versionB?.shots ?? [];
  if (errorA || errorB) return <p role="alert">{String(errorA || errorB)}</p>;
  if (!versionA || !versionB) return <p>{t("common.loading")}</p>;

  const maxLen = Math.max(shotsA.length, shotsB.length);

  if (versions.length < 2) {
    return (
      <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
        {t("storyboard.needTwoVersions")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Version selectors */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="text-sm font-medium">A:</span>
          <select
            aria-label="Version A"
            value={versionAId}
            onChange={(e) => setVersionAId(e.target.value)}
            className="h-10 min-w-0 rounded-md border bg-white px-2 text-sm"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNum} — {v.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-muted-foreground">vs</span>
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="text-sm font-medium">B:</span>
          <select
            aria-label="Version B"
            value={versionBId}
            onChange={(e) => setVersionBId(e.target.value)}
            className="h-10 min-w-0 rounded-md border bg-white px-2 text-sm"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNum} — {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="space-y-4">
        {Array.from({ length: maxLen }, (_, i) => {
          const shotA = shotsA[i];
          const shotB = shotsB[i];
          return (
            <div
              key={i}
              className="workspace-panel grid grid-cols-1 gap-5 p-4 sm:grid-cols-2"
            >
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("shot.shot")} {i + 1} — v
                  {versions.find((v) => v.id === versionAId)?.versionNum}
                </span>
                {shotA && getFirstFrameUrl(shotA) ? (
                  <img
                    src={uploadUrl(getFirstFrameUrl(shotA)!)}
                    alt={`Shot ${i + 1} version A`}
                    className="w-full rounded aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full rounded aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {t("storyboard.noFrame")}
                  </div>
                )}
                {shotA?.prompt && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {shotA.prompt}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("shot.shot")} {i + 1} — v
                  {versions.find((v) => v.id === versionBId)?.versionNum}
                </span>
                {shotB && getFirstFrameUrl(shotB) ? (
                  <img
                    src={uploadUrl(getFirstFrameUrl(shotB)!)}
                    alt={`Shot ${i + 1} version B`}
                    className="w-full rounded aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full rounded aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {t("storyboard.noFrame")}
                  </div>
                )}
                {shotB?.prompt && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {shotB.prompt}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
