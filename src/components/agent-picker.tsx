"use client";

import { useEffect } from "react";
import { useAgentStore } from "@/stores/agent-store";
import { useTranslations } from "next-intl";

export function AgentPicker({
  projectId,
  category,
}: {
  projectId: string;
  category: string;
}) {
  const t = useTranslations("settings");
  const { agents, bindingsByProject, fetchAgents, fetchBindings, setBinding } =
    useAgentStore();

  useEffect(() => {
    fetchAgents();
    fetchBindings(projectId);
  }, [projectId, fetchAgents, fetchBindings]);

  const availableAgents = agents.filter((agent) => agent.category === category);
  const binding = (bindingsByProject[projectId] ?? []).find(
    (item) => item.category === category,
  );
  const selected = availableAgents.find(
    (agent) => agent.id === binding?.agentId,
  );
  if (!availableAgents.length) return null;

  return (
    <select
      aria-label={t("agents")}
      value={selected?.id ?? ""}
      onChange={(event) =>
        setBinding(projectId, category, event.target.value || null)
      }
      className="h-9 min-w-0 max-w-full border border-input bg-white px-2 text-sm sm:max-w-64"
    >
      <option value="">{t("defaultAgent")}</option>
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
