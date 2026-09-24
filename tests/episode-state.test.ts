import { beforeEach, expect, test, vi } from "vitest";
import {
  useEpisodeEditorStore,
  type EpisodeDetail,
} from "@/stores/episode-editor-store";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-fetch", () => ({ apiFetch: request }));
function response(id: string, version: string) {
  return new Response(
    JSON.stringify({
      id,
      projectId: "p",
      title: id,
      shots: [{ id: version }],
      versions: [],
    }),
  );
}
beforeEach(() => {
  request.mockReset();
  useEpisodeEditorStore.setState({
    scope: null,
    episode: null,
    loading: false,
  });
});

test("late episode responses and edits cannot overwrite the new editor", async () => {
  let finishA!: (response: Response) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishA = resolve;
      }),
  );
  const a = useEpisodeEditorStore.getState().openEpisode("p", "a");
  request.mockResolvedValueOnce(response("b", "b1"));
  await useEpisodeEditorStore.getState().openEpisode("p", "b");
  finishA(response("a", "a1"));
  await a;
  const store = useEpisodeEditorStore.getState();
  expect(store.episode?.id).toBe("b");
  store.updateDraft("a", { script: "late stream" });
  await store.fetchEpisode("p", "a");
  expect(request).toHaveBeenCalledTimes(2);
  expect(useEpisodeEditorStore.getState().episode?.id).toBe("b");
  expect(useEpisodeEditorStore.getState().episode?.script).not.toBe(
    "late stream",
  );
});

test("the last requested version wins even when responses arrive out of order", async () => {
  useEpisodeEditorStore.setState({
    scope: { projectId: "p", episodeId: "a" },
    episode: { id: "a", projectId: "p" } as EpisodeDetail,
  });
  let finishOld!: (response: Response) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  const old = useEpisodeEditorStore.getState().fetchEpisode("p", "a", "old");
  request.mockResolvedValueOnce(response("a", "new"));
  await useEpisodeEditorStore.getState().fetchEpisode("p", "a", "new");
  finishOld(response("a", "old"));
  await old;
  expect(useEpisodeEditorStore.getState().episode?.shots[0].id).toBe("new");
  expect(request).toHaveBeenLastCalledWith(
    "/api/projects/p/episodes/a?versionId=new",
  );
});
