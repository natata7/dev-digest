import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDashboard } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { evalCase, evalRun } from "@/test/eval-fixtures";

const runMutate = vi.fn();
const state = {
  cases: [] as ReturnType<typeof evalCase>[],
  dash: undefined as EvalAgentDashboard | undefined,
  running: false,
};
vi.mock("@/lib/hooks/eval", () => ({
  useEvalCases: () => ({ data: state.cases, isLoading: false }),
  useAgentEvalDashboard: () => ({ data: state.dash }),
  useRunEvals: () => ({ mutate: runMutate, isPending: state.running }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);
beforeEach(() => {
  runMutate.mockClear();
  state.running = false;
  state.cases = [
    evalCase({ id: "c1", name: "stripe-key-leak" }),
    evalCase({ id: "c2", name: "missing-retry-after", expectation_kind: "must_find", last_run: { pass: false, status: "ok", ran_at: "2026-05-29T09:14:00Z" } }),
    evalCase({ id: "c3", name: "unused-import-noise", expectation_kind: "must_not_flag", last_run: null }),
  ];
  const cur = evalRun();
  state.dash = {
    agent_id: "a1", agent_name: "Security Reviewer", model: "gpt-4.1", cases_total: 3, current: cur,
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: null }, trend: [], runs: [cur], alert: null,
  };
});

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab agentId="a1" />
    </NextIntlClientProvider>,
  );

describe("EvalsTab", () => {
  it("lists the cases with their kind and last-run state and counts passing ones", () => {
    renderTab();
    const row = (n: string) => within(screen.getByTestId(`case-${n}`));
    expect(row("stripe-key-leak").getByText("passed")).toBeInTheDocument();
    expect(row("missing-retry-after").getByText("failed")).toBeInTheDocument();
    expect(row("unused-import-noise").getByText("never run")).toBeInTheDocument();
    expect(row("unused-import-noise").getByText("must not flag")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
  });

  it("shows metric tiles with ▲/▼ deltas in points (AC-19)", () => {
    renderTab();
    const tile = (k: string) => within(screen.getByTestId(`metric-${k}`));
    expect(tile("recall").getByText("82%")).toBeInTheDocument();
    expect(tile("recall").getByText("▲ 4pt")).toBeInTheDocument();
    expect(tile("precision").getByText("▼ 2pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("traces-passed")).getByText("17/20")).toBeInTheDocument();
  });

  it("run rows show duration and cost (AC-25)", () => {
    renderTab();
    const row = within(screen.getByTestId("run-row"));
    expect(row.getByText("1.8s")).toBeInTheDocument();
    expect(row.getByText("$0.23")).toBeInTheDocument();
    expect(row.getByText("v7")).toBeInTheDocument();
  });

  it("Run all evals starts a run; while running the button is disabled and says Running… (AC-13a)", () => {
    const { unmount } = renderTab();
    fireEvent.click(screen.getByText("Run all evals"));
    expect(runMutate).toHaveBeenCalledTimes(1);
    expect(runMutate.mock.calls[0]![0]).toBeUndefined();
    unmount();

    state.running = true;
    renderTab();
    const btn = screen.getByText("Running…").closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("the case editor blocks Save on invalid expected-output JSON", () => {
    renderTab();
    fireEvent.click(screen.getByText("New eval case"));
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    const [, expected] = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
    fireEvent.change(expected!, { target: { value: "{ nope" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });
});
