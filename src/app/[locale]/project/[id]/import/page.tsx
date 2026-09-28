"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { CharacterReview } from "@/components/import/character-review";
import { EpisodeReview } from "@/components/import/episode-review";
import { FileUpload } from "@/components/import/file-upload";
import { ImportLog } from "@/components/import/import-log";
import { ImportSteps } from "@/components/import/import-steps";
import { useProjectImport } from "@/hooks/use-project-import";
import type { ImportStep } from "@/lib/import-types";

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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)] md:flex-row md:overflow-hidden">
      <aside className="shrink-0 border-b border-[--border-subtle] bg-white p-4 md:w-56 md:border-b-0 md:border-r">
        <Link
          href={episodesUrl}
          className="mb-6 flex items-center gap-2 text-sm text-[--text-muted] transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToEpisodes")}
        </Link>
        <h2 className="mb-4 font-display text-lg font-bold text-[--text-primary]">
          {t("title")}
        </h2>
        <ImportSteps
          status={flow.status}
          historyMode={flow.historyMode}
          selectedStep={selectedStep}
          onSelect={setSelectedStep}
        />
      </aside>
      <main className="min-w-0 flex-1 bg-[--surface] p-4 sm:p-6 md:overflow-y-auto">
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
      </main>
    </div>
  );
}
