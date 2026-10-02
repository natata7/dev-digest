/** Regression guard: Overview must keep mounting both IntentCard and
 *  BlastRadiusCard (and pass BlastRadiusCard the new repoId/provider/repoFullName
 *  props) — a prop-wiring slip here would silently drop the blast radius block. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord, BlastRadius } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Add rate limiting to the public API",
  in_scope: ["Add a token-bucket limiter middleware"],
  out_of_scope: [],
  confidence: "high",
  sources: [],
  head_sha: "head-sha",
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
  computed_at: "2026-01-01T00:00:00.000Z",
};

const BLAST: BlastRadius = {
  changed_symbols: [{ name: "processPayment", file: "src/payments.ts", kind: "function" }],
  downstream: [
    {
      symbol: "processPayment",
      callers: [{ name: "checkoutHandler", file: "src/routes/checkout.ts", line: 42 }],
      endpoints_affected: ["POST /checkout"],
      crons_affected: [],
    },
  ],
  summary: "1 symbols · 1 callers · 1 endpoints · 0 crons",
  indexed_sha: "abc123",
};

vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: INTENT, isLoading: false }),
  useRecomputeIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ data: BLAST, isLoading: false, isError: false }),
  usePrHistory: () => ({ data: { history: [] }, isLoading: false, isError: false }),
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: undefined }),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderOverview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <OverviewTab
          prBody="Some PR body"
          prId="pr-1"
          headSha="head-sha"
          repoId="repo-1"
          provider="github"
          repoFullName="acme/widgets"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("renders both IntentCard and BlastRadiusCard", () => {
    renderOverview();

    // IntentCard
    expect(screen.getByText(/Add rate limiting to the public API/)).toBeInTheDocument();

    // BlastRadiusCard
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    // The "<value> <label>" stat splits across a nested span + a sibling text
    // node, so RTL's getByText (own direct text only) needs the full textContent.
    expect(screen.getByText((_, el) => (el?.textContent ?? "").trim() === "1 symbols")).toBeInTheDocument();
    expect(screen.getByText("processPayment()")).toBeInTheDocument();
  });

  it("still renders the description section below both cards", () => {
    renderOverview();
    expect(screen.getByText("Some PR body")).toBeInTheDocument();
  });
});
