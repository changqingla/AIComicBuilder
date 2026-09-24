"use client";

import { apiFetch } from "@/lib/api-fetch";
import type { Shot } from "@/lib/editor-types";
import type { ShotAsset } from "@/lib/shot-assets";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export type AssetChanges = Partial<
  Pick<ShotAsset, "prompt" | "characters" | "modelProvider" | "modelId">
>;
type AssetItem = Pick<ShotAsset, "sequenceInType" | "prompt"> & {
  id?: string;
} & AssetChanges;
type ShotChanges = Partial<
  Pick<
    Shot,
    | "prompt"
    | "motionScript"
    | "cameraDirection"
    | "duration"
    | "videoPrompt"
    | "transitionIn"
    | "transitionOut"
  >
>;

export function useShotMutations(
  projectId: string,
  shotId: string,
  onUpdate: () => void | Promise<void>,
) {
  const t = useTranslations();
  const base = `/api/projects/${projectId}/shots/${shotId}`;

  async function mutate(
    path: string,
    method: string,
    data?: object | FormData,
  ) {
    try {
      const isFile = data instanceof FormData;
      await apiFetch(`${base}${path}`, {
        method,
        ...(isFile
          ? { body: data }
          : {
              headers: { "Content-Type": "application/json" },
              body: data ? JSON.stringify(data) : undefined,
              keepalive: true,
            }),
      });
      await onUpdate();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.saveFailed"),
      );
      return false;
    }
  }

  return {
    updateShot: (changes: ShotChanges) => mutate("", "PATCH", changes),
    updateAsset: (assetId: string, changes: AssetChanges) =>
      mutate(`/assets/${assetId}`, "PATCH", changes),
    replaceAssets: (type: ShotAsset["type"], items: AssetItem[]) =>
      mutate("/assets", "PUT", { type, items }),
    activateAsset: (assetId: string) =>
      mutate(`/assets/${assetId}/activate`, "POST"),
    uploadAsset: (
      type: ShotAsset["type"],
      sequenceInType: number,
      file: File,
    ) => {
      const data = new FormData();
      data.append("file", file);
      data.append("type", type);
      data.append("sequenceInType", String(sequenceInType));
      return mutate("/upload", "POST", data);
    },
  };
}
export type ShotMutations = ReturnType<typeof useShotMutations>;
