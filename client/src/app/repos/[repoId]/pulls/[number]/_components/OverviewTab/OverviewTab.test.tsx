/** Regression guard: Overview must keep mounting both IntentCard and
 *  BlastRadiusCard (and pass BlastRadiusCard the new repoId/provider/repoFullName
 *  props) — a prop-wiring slip here would silently drop the blast radius block. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord, BlastRadius, PrBrief } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";

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
  usePrReviews: () => ({ data: [], isLoading: false }),
}));

const BRIEF = {
  summary: "Adds rate limiting.",
  risks: { risks: [{ kind: "k", title: "Burst risk", explanation: "burst expl", severity: "high", file_refs: ["src/h.ts"] }] },
  review_focus: [{ file: "src/config.ts", line: 12, reason: "new limit default" }],
  head_sha: "head-sha",
  generated_at: "2026-01-01T00:00:00.000Z",
  missing_inputs: [],
  generation: { provider: "p", model: "m", tokens_in: 1, tokens_out: 1, cost_usd: 0.01, attempts: 1 },
} as unknown as PrBrief;
let brief: PrBrief | null = null;

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: brief, isLoading: false }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useBriefGenerating: () => false,
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

afterEach(() => {
  cleanup();
  brief = null;
});

function renderOverview(onOpenFile?: (p: string, l?: number) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages, brief: briefMessages }}>
        <OverviewTab
          prBody="Some PR body"
          prId="pr-1"
          headSha="head-sha"
          repoId="repo-1"
          provider="github"
          repoFullName="acme/widgets"
          onOpenFile={onOpenFile}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("OverviewTab", () => {
  it("without a brief: only the empty state; Intent and Blast radius are hidden", () => {
    renderOverview();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.queryByText(/Add rate limiting to the public API/)).not.toBeInTheDocument();
    expect(screen.queryByText("Blast radius")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryByText(/Review focus/)).not.toBeInTheDocument();
  });

  it("with a brief: renders both IntentCard and BlastRadiusCard (prop wiring intact)", () => {
    brief = BRIEF;
    renderOverview();
    expect(screen.getByText(/Add rate limiting to the public API/)).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    // "<value> <label>" splits across a span + text node → match on textContent.
    expect(screen.getByText((_, el) => (el?.textContent ?? "").trim() === "1 symbols")).toBeInTheDocument();
    expect(screen.getByText("processPayment()")).toBeInTheDocument();
  });

  it("with a brief: banner above, Risk areas inside the Intent card, Review focus below the grid", () => {
    brief = BRIEF;
    renderOverview();
    const banner = screen.getByText("Adds rate limiting.");
    const intent = screen.getByText(/Add rate limiting to the public API/);
    const risks = screen.getByText("Risk areas");
    const blast = screen.getByText("Blast radius");
    const focus = screen.getByText(/Review focus/);
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(follows(banner, intent)).toBe(true);
    expect(follows(intent, risks)).toBe(true);
    expect(follows(risks, blast)).toBe(true); // risks end the Intent card, before Blast
    expect(follows(blast, focus)).toBe(true);
    const intentSection = intent.closest("section")!;
    expect(intentSection).toContainElement(risks);
    expect(intentSection).not.toContainElement(blast);
  });

  it("forwards onOpenFile to risk file links and focus items", () => {
    brief = BRIEF;
    const onOpenFile = vi.fn();
    renderOverview(onOpenFile);
    fireEvent.click(screen.getByRole("button", { name: "Open src/h.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/h.ts");
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/config.ts", 12);
  });

  it("still renders the description section", () => {
    renderOverview();
    expect(screen.getByText("Some PR body")).toBeInTheDocument();
  });
});
