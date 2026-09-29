"use client";

import { CharacterReview } from "@/components/import/character-review";
import { EpisodeReview } from "@/components/import/episode-review";
import { FileUpload } from "@/components/import/file-upload";
import { ImportLog } from "@/components/import/import-log";
import { ImportSteps } from "@/components/import/import-steps";
import { PageHeader } from "@/components/workspace/page-header";
import { useProjectImport } from "@/hooks/use-project-import";
import type { ImportStep } from "@/lib/import-types";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";

export default function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ImportContent key={id} projectId={id} />;
}

function ImportContent({ projectId }: { projectId: string }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const router = useRouter();
  const episodesUrl = `/${locale}/project/${projectId}/episodes`;
  const flow = useProjectImport(projectId, () => {
    toast.success(t("complete"));
    router.push(episodesUrl);
  });
  const [selectedStep, setSelectedStep] = useState<ImportStep | null>(null);
  const reviewingCharacters =
    !flow.historyMode && flow.status[2] === "done" && flow.status[3] === "idle";
  const reviewingEpisodes =
    !flow.historyMode && flow.status[3] === "done" && flow.status[4] === "idle";

  return (
    <div className="workspace-page">
      <PageHeader title={t("title")} />
      <ImportSteps
        status={flow.status}
        historyMode={flow.historyMode}
        selectedStep={selectedStep}
        onSelect={setSelectedStep}
      />
      <div className="mt-7 min-w-0">
        {flow.currentStep === 0 && !flow.historyMode && (
          <FileUpload onStart={flow.start} disabled={flow.loading} />
        )}
        {reviewingCharacters && (
          <CharacterReview
            characters={flow.characters}
            onToggle={flow.toggleScope}
            onConfirm={flow.split}
          />
        )}
        {reviewingEpisodes && (
          <EpisodeReview
            episodes={flow.episodes}
            characters={flow.characters}
            onRename={flow.renameEpisode}
            onRemove={flow.removeEpisode}
            onConfirm={flow.generate}
          />
        )}
        {(flow.currentStep > 0 || flow.historyMode) &&
          !reviewingCharacters &&
          !reviewingEpisodes && (
            <ImportLog
              logs={flow.logs}
              selectedStep={selectedStep}
              historyMode={flow.historyMode}
              canRetry={
                !flow.historyMode &&
                flow.currentStep !== 0 &&
                flow.status[flow.currentStep] === "error"
              }
              onShowAll={() => setSelectedStep(null)}
              onRetry={flow.retry}
              onReset={() => {
                flow.reset();
                setSelectedStep(null);
              }}
            />
          )}
      </div>
    </div>
  );
}
