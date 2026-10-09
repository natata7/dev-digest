import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { evalRun } from "@/test/eval-fixtures";

let data: EvalCompare | undefined;
vi.mock("@/lib/hooks/eval", () => ({
  useEvalCompare: () => ({ data, isLoading: !data, isError: false, refetch: vi.fn() }),
}));

import { CompareRuns } from "./CompareRuns";

afterEach(cleanup);
const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CompareRuns older="a" newer="b" onClose={() => {}} />
    </NextIntlClientProvider>,
  );

describe("CompareRuns", () => {
  it("shows metric deltas and highlights the changed prompt line (AC-22)", () => {
    const a = evalRun({ id: "a", agent_version: 6, recall: 0.78, precision: 0.93, citation_accuracy: 0.94, cost_usd: 0.21, system_prompt: "Be strict.\nReturn at most 5 findings." });
    const b = evalRun({ id: "b", agent_version: 7, recall: 0.82, precision: 0.91, citation_accuracy: 0.95, cost_usd: 0.23, system_prompt: "Be strict.\nFlag unused imports as suggestions.\nReturn at most 5 findings." });
    data = { a, b, delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: 0.02 } };
    renderIt();

    expect(screen.getByText("Compare runs · v6 → v7")).toBeInTheDocument();
    const recall = within(screen.getByTestId("cmp-recall"));
    expect(recall.getByText("78%")).toBeInTheDocument();
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByText("▲ 4pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("cmp-precision")).getByText("▼ 2pt")).toBeInTheDocument();

    const added = screen.getByTestId("prompt-diff").querySelector('[data-kind="add"]')!;
    expect(added.textContent).toContain("Flag unused imports as suggestions.");
  });

  it("says the prompts are identical instead of rendering an empty diff (AC-24)", () => {
    const a = evalRun({ id: "a", agent_version: 6 });
    const b = evalRun({ id: "b", agent_version: 7 });
    data = { a, b, delta: { recall: 0, precision: 0, citation_accuracy: 0, cost_usd: 0 } };
    renderIt();
    expect(screen.queryByTestId("prompt-diff")).toBeNull();
    expect(screen.getByText(/system prompts are identical/i)).toBeInTheDocument();
  });
});
