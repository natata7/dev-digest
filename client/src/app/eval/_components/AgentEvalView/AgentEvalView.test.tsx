import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDashboard } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { evalRun } from "@/test/eval-fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../CompareRuns", () => ({
  CompareRuns: ({ older, newer }: { older: string; newer: string }) => <div data-testid="compare-open">{older}→{newer}</div>,
}));
// recharts needs layout; the chart is not under test here
vi.mock("@devdigest/ui", async (orig) => ({ ...(await orig<typeof import("@devdigest/ui")>()), LineChart: () => <div data-testid="chart" /> }));

let dash: EvalAgentDashboard;
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalDashboard: () => ({ data: dash, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunEvals: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentEvalView } from "./AgentEvalView";

afterEach(cleanup);
beforeEach(() => {
  const r7 = evalRun({ id: "r7", agent_version: 7, ran_at: "2026-05-29T09:14:00Z" });
  const r6 = evalRun({ id: "r6", agent_version: 6, ran_at: "2026-05-27T16:40:00Z", recall: 0.78 });
  const r5 = evalRun({ id: "r5", agent_version: 5, ran_at: "2026-05-25T11:02:00Z", recall: 0.8 });
  dash = {
    agent_id: "a1", agent_name: "Security Reviewer", model: "gpt-4.1", cases_total: 20, current: r7,
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: 0.02 },
    trend: [], runs: [r7, r6, r5], alert: "Precision dipped 2pts on v7 (vs v6)",
  };
});

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentEvalView agentId="a1" />
    </NextIntlClientProvider>,
  );

describe("AgentEvalView", () => {
  it("shows the regression alert and the three metrics with deltas (AC-21)", () => {
    renderIt();
    expect(screen.getByTestId("eval-alert")).toHaveTextContent("Precision dipped 2pts on v7 (vs v6)");
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument();
    expect(screen.getAllByTestId("run-row")).toHaveLength(3);
  });

  it("Compare is disabled unless exactly two runs are selected (AC-23) and opens older → newer", () => {
    renderIt();
    const compare = screen.getByText("Compare").closest("button")!;
    const boxes = screen.getAllByRole("checkbox");
    expect(compare).toBeDisabled();

    fireEvent.click(boxes[0]!); // r7
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]!); // r6
    expect(compare).not.toBeDisabled();
    fireEvent.click(boxes[2]!); // r5 — third pick drops the oldest pick (r7)
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(compare);
    expect(screen.getByTestId("compare-open")).toHaveTextContent("r5→r6");
  });
});
