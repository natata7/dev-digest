import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: { get, post } }));

import { ApiError } from "@/lib/api";
import { PrBriefCard } from "./PrBriefCard";

const BRIEF: PrBrief = {
  summary: "Adds rate limiting.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      { kind: "a", title: "Low thing", explanation: "low expl", severity: "low", file_refs: ["src/l.ts"] },
      { kind: "b", title: "High thing", explanation: "high expl", severity: "high", file_refs: ["src/h.ts"] },
      { kind: "c", title: "Med thing", explanation: "med expl", severity: "medium", file_refs: [] },
    ],
  },
  review_focus: [{ file: "src/config.ts", line: 12, reason: "new limit default" }],
  head_sha: "sha-1",
  generated_at: "2026-01-01T00:00:00.000Z",
  missing_inputs: [],
  generation: { provider: "openrouter", model: "m/x", tokens_in: 1000, tokens_out: 200, cost_usd: 0.01, attempts: 1 },
};

let reviews: ReviewRecord[] = [];
let stored: PrBrief | null = null;

beforeEach(() => {
  reviews = [];
  stored = null;
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/reviews")) return reviews;
    if (stored) return stored;
    throw new ApiError("no brief", 404, "no_brief");
  });
});
afterEach(cleanup);

function renderCard(props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenFile = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
        <PrBriefCard prId="pr-1" headSha="sha-1" filesCount={3} onOpenFile={onOpenFile} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onOpenFile };
}

const postCalls = () => post.mock.calls.length;

describe("PrBriefCard", () => {
  it("shows Generate when GET 404s and does not POST on its own", async () => {
    renderCard();
    expect(await screen.findByRole("button", { name: "Generate brief" })).toBeEnabled();
    expect(postCalls()).toBe(0);
  });

  it("Generate → renders summary, Risk areas (severity sorted) and Review focus", async () => {
    post.mockResolvedValue(BRIEF);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText(/Review focus/)).toBeInTheDocument();
    const titles = screen.getAllByText(/ thing$/).map((e) => e.textContent);
    expect(titles).toEqual(["High thing", "Med thing", "Low thing"]);
    expect(postCalls()).toBe(1);
  });

  it("shows a stored brief on load and lists missing inputs", async () => {
    stored = { ...BRIEF, missing_inputs: ["intent", "blast"] };
    renderCard();
    expect(await screen.findByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("Generated without: intent, blast radius")).toBeInTheDocument();
  });

  it("shows empty states for no risks / no focus", async () => {
    stored = { ...BRIEF, risks: { risks: [] }, review_focus: [] };
    renderCard();
    expect(await screen.findByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("No specific places to start were flagged.")).toBeInTheDocument();
  });

  it("stale brief shows a banner and never auto-POSTs", async () => {
    stored = BRIEF;
    renderCard({ headSha: "sha-2" });
    expect(await screen.findByText("PR updated since this brief was generated.")).toBeInTheDocument();
    expect(postCalls()).toBe(0);
    post.mockResolvedValue({ ...BRIEF, head_sha: "sha-2" });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(screen.queryByText(/PR updated since/)).not.toBeInTheDocument());
  });

  it("matching head_sha shows no stale banner", async () => {
    stored = BRIEF;
    renderCard();
    await screen.findByText("Adds rate limiting.");
    expect(screen.queryByText(/PR updated since/)).not.toBeInTheDocument();
  });

  it("pending first generation shows a busy skeleton and no Generate button", async () => {
    post.mockReturnValue(new Promise(() => {}));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByLabelText("Generating brief…")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
  });

  it("pending refresh disables the Refresh button and keeps the old brief", async () => {
    stored = BRIEF;
    post.mockReturnValue(new Promise(() => {}));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByRole("button", { name: "Generating brief…" })).toBeDisabled();
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
  });

  it("POST failure keeps the old brief, shows the error and Retry re-POSTs", async () => {
    stored = BRIEF;
    post.mockRejectedValueOnce(new ApiError("llm down", 502, "llm_failed"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not generate the brief: llm down");
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
    post.mockResolvedValueOnce({ ...BRIEF, summary: "Fresh summary." });
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(postCalls()).toBe(2);
  });

  it("filesCount 0 disables Generate and explains why", async () => {
    renderCard({ filesCount: 0 });
    expect(await screen.findByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.getByText("This PR has no changed files — nothing to brief.")).toBeInTheDocument();
  });

  it("filesCount 0 also disables Refresh on an existing brief", async () => {
    stored = BRIEF;
    renderCard({ filesCount: 0 });
    expect(await screen.findByRole("button", { name: "Refresh brief" })).toBeDisabled();
  });

  it("focus item click → onOpenFile(path, line); risk file click → onOpenFile(path)", async () => {
    stored = BRIEF;
    const { onOpenFile } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/config.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Open src/h.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/h.ts");
  });

  it("risk explanation toggles", async () => {
    stored = BRIEF;
    renderCard();
    await screen.findByText("High thing");
    expect(screen.queryByText("high expl")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Show explanation" })[0]!);
    expect(screen.getByText("high expl")).toBeInTheDocument();
  });

  it("shows VerdictBanner (with the brief summary) when a review with a verdict exists", async () => {
    stored = BRIEF;
    reviews = [{
      id: "r1", pr_id: "pr-1", agent_id: null, run_id: null, kind: "review", verdict: "request_changes",
      summary: "review summary", score: 40, model: null, created_at: "2026-02-01", findings: [],
    }];
    renderCard();
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
  });

  it("renders no verdict banner when reviews have no verdict", async () => {
    stored = BRIEF;
    reviews = [{
      id: "r1", pr_id: "pr-1", agent_id: null, run_id: null, kind: "summary", verdict: null,
      summary: null, score: null, model: null, created_at: "2026-02-01", findings: [],
    }];
    renderCard();
    await screen.findByText("Adds rate limiting.");
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
  });

  it("renders model text as plain text (no HTML / markdown interpretation)", async () => {
    const evil = '<img src=x onerror="alert(1)"> **bold**';
    stored = {
      ...BRIEF,
      summary: evil,
      risks: { risks: [{ kind: "k", title: evil, explanation: evil, severity: "high", file_refs: [] }] },
      review_focus: [{ file: "a.ts", line: 1, reason: evil }],
    };
    renderCard();
    expect((await screen.findAllByText(evil, { exact: false })).length).toBeGreaterThan(0);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("strong")).toBeNull();
  });
});
