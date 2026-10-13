"use client";

import { useParams } from "next/navigation";
import { AgentEvalView } from "../_components/AgentEvalView";

/* Route: /eval/:agentId — one agent's metric trend, runs and Compare. */
export default function AgentEvalPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return <AgentEvalView agentId={agentId} />;
}
