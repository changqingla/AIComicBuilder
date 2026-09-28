"use client";
import { fetchJson } from "@/lib/api-fetch";
import useSWR from "swr";

import { CharacterCard } from "@/components/editor/character-card";
import { CharacterRelations } from "@/components/editor/character-relations";
import { apiFetch } from "@/lib/api-fetch";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/workspace/page-header";
import { use, useMemo } from "react";
import { toast } from "sonner";

interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  visualHint: string | null;
  referenceImage: string | null;
  referenceImageHistory: string | null;
  scope: string;
  episodeId: string | null;
}

interface Episode {
  id: string;
  title: string;
  sequence: number;
}

const EMPTY_CHARACTERS: Character[] = [];
const EMPTY_EPISODES: Episode[] = [];

export default function CharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const t = useTranslations();
  const tc = useTranslations("common");
  const tChar = useTranslations("character");

  const {
    data,
    isLoading: loading,
    mutate: fetchData,
  } = useSWR(["project-characters", projectId], async ([, id]) => {
    const [characters, episodes] = await Promise.all([
      fetchJson<Character[]>(`/api/projects/${id}/characters`),
      fetchJson<Episode[]>(`/api/projects/${id}/episodes`),
    ]);
    return { characters, episodes };
  });
  const characters = data?.characters ?? EMPTY_CHARACTERS;
  const episodes = data?.episodes ?? EMPTY_EPISODES;

  const mainCharacters = useMemo(
    () => characters.filter((c) => c.scope === "main"),
    [characters],
  );

  const guestByEpisode = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const c of characters) {
      if (c.scope === "guest") {
        const list = map.get(c.episodeId ?? "") || [];
        list.push(c);
        map.set(c.episodeId ?? "", list);
      }
    }
    return map;
  }, [characters]);

  const guestCount = useMemo(
    () => characters.filter((c) => c.scope === "guest").length,
    [characters],
  );

  async function handlePromote(characterId: string) {
    await apiFetch(`/api/projects/${projectId}/characters/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "main" }),
    });
    fetchData();
  }

  async function handleDelete(characterId: string, name: string) {
    if (!confirm(tChar("deleteConfirm", { name }))) return;
    await apiFetch(`/api/projects/${projectId}/characters/${characterId}`, {
      method: "DELETE",
    });
    toast.success(tc("delete"));
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-[var(--text-muted)]">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <PageHeader
        title={tChar("management")}
        description={t("workspace.charactersHint")}
      />
      {/* Main Characters Section */}
      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="font-sans text-lg font-semibold text-[var(--text-primary)]">
            {tChar("mainSection")}
          </h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {mainCharacters.length}
          </span>
        </div>
        {mainCharacters.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-white/50 p-6">
            <p className="text-sm text-[var(--text-muted)]">
              {tChar("noMain")}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 2xl:grid-cols-2">
            {mainCharacters.map((char) => (
              <CharacterCard
                key={char.id}
                id={char.id}
                projectId={projectId}
                name={char.name}
                description={char.description}
                visualHint={char.visualHint}
                referenceImage={char.referenceImage}
                referenceImageHistory={char.referenceImageHistory}
                scope={char.scope}
                onUpdate={fetchData}
                onDelete={() => handleDelete(char.id, char.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Character Relations */}
      {characters.length >= 2 && (
        <section className="mb-8">
          <CharacterRelations
            projectId={projectId}
            characters={characters.map((c) => ({ id: c.id, name: c.name }))}
          />
        </section>
      )}

      {/* Guest Characters Section */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="font-sans text-lg font-semibold text-[var(--text-primary)]">
            {tChar("guestSection")}
          </h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {guestCount}
          </span>
        </div>
        {guestCount === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-white/50 p-6">
            <p className="text-sm text-[var(--text-muted)]">
              {tChar("noGuest")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(guestByEpisode, ([episodeId, guests]) => {
              const ep = episodes.find((episode) => episode.id === episodeId);
              return (
                <div key={episodeId}>
                  {ep && (
                    <h4 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
                      EP.{String(ep.sequence).padStart(2, "0")} — {ep.title}
                    </h4>
                  )}
                  <div className="grid gap-5 2xl:grid-cols-2">
                    {guests.map((char) => (
                      <CharacterCard
                        key={char.id}
                        id={char.id}
                        projectId={projectId}
                        name={char.name}
                        description={char.description}
                        visualHint={char.visualHint}
                        referenceImage={char.referenceImage}
                        referenceImageHistory={char.referenceImageHistory}
                        scope={char.scope}
                        episodeName={
                          ep
                            ? `EP.${String(ep.sequence).padStart(2, "0")} ${ep.title}`
                            : undefined
                        }
                        onUpdate={fetchData}
                        onPromote={() => handlePromote(char.id)}
                        onDelete={() => handleDelete(char.id, char.name)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
