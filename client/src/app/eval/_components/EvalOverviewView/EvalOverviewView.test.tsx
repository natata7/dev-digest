import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/eval.json";
import { evalRun } from "@/test/eval-fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const runAll = vi.fn();
vi.mock("@/lib/hooks/eval", () => ({
  useEvalOverview: () => ({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      agents: [
        { agent_id: "a1", agent_name: "Security Reviewer", model: "gpt-4.1", cases_total: 20, last_run: evalRun(), trend: [0.7, 0.8, 0.82] },
        { agent_id: "a2", agent_name: "Custom Mentor", model: "gpt-4o-mini", cases_total: 0, last_run: null, trend: [] },
      ],
      recent_runs: [evalRun({ id: "x", agent_name: "Security Reviewer" })],
    },
  }),
  useRunAllAgents: () => ({ mutate: runAll, isPending: false }),
}));

import { EvalOverviewView } from "./EvalOverviewView";

afterEach(cleanup);

describe("EvalOverviewView", () => {
  it("lists agents with last-run metrics and links to the agent page; never-run agents say so", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalOverviewView />
      </NextIntlClientProvider>,
    );
    const sec = within(screen.getByTestId("agent-Security Reviewer"));
    expect(sec.getByText("82%")).toBeInTheDocument();
    expect(sec.getByText(/Last run v7/)).toBeInTheDocument();
    expect(screen.getByTestId("agent-Security Reviewer")).toHaveAttribute("href", "/eval/a1");
    expect(within(screen.getByTestId("agent-Custom Mentor")).getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getAllByTestId("recent-run")).toHaveLength(1);
  });

  it("Run all agents only runs agents that have cases", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalOverviewView />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("Run all agents"));
    expect(runAll).toHaveBeenCalledWith(["a1"]);
  });
});
