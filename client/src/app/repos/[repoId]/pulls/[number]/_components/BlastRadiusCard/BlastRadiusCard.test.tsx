import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

const REPO_ID = "repo-1";
const PR_ID = "pr-1";

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "processPayment", file: "src/payments.ts", kind: "function" },
    { name: "refundOrder", file: "src/payments.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "processPayment",
      callers: [
        { name: "checkoutHandler", file: "src/routes/checkout.ts", line: 42 },
        { name: "webhookHandler", file: "src/routes/webhook.ts", line: 10 },
        { name: "retryJob", file: "src/jobs/retry.ts", line: 5 },
        { name: "adminTool", file: "src/admin/tools.ts", line: 88 },
      ],
      endpoints_affected: ["POST /checkout", "POST /webhook"],
      crons_affected: ["nightly-retry"],
    },
    {
      symbol: "refundOrder",
      callers: [
        { name: "supportTool", file: "src/admin/support.ts", line: 12 },
        { name: "webhookHandler", file: "src/routes/webhook.ts", line: 30 },
        { name: "refundJob", file: "src/jobs/refund.ts", line: 3 },
      ],
      endpoints_affected: ["POST /webhook", "POST /refund"],
      crons_affected: [],
    },
  ],
  summary: "2 symbols · 7 callers · 3 endpoints · 1 crons",
  indexed_sha: "abc123",
};

const ZERO_CALLERS_BLAST: BlastRadius = {
  changed_symbols: [
    { name: "processPayment", file: "src/payments.ts", kind: "function" },
    { name: "refundOrder", file: "src/payments.ts", kind: "function" },
  ],
  downstream: [
    { symbol: "processPayment", callers: [], endpoints_affected: [], crons_affected: [] },
    { symbol: "refundOrder", callers: [], endpoints_affected: [], crons_affected: [] },
  ],
  summary: "2 symbols · 0 callers · 0 endpoints · 0 crons",
};

const MIXED_CALLERS_BLAST: BlastRadius = {
  changed_symbols: [
    { name: "processPayment", file: "src/payments.ts", kind: "function" },
    { name: "refundOrder", file: "src/payments.ts", kind: "function" },
    { name: "auditLog", file: "src/audit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "processPayment",
      callers: [{ name: "checkoutHandler", file: "src/routes/checkout.ts", line: 42 }],
      endpoints_affected: ["POST /checkout"],
      crons_affected: [],
    },
    { symbol: "refundOrder", callers: [], endpoints_affected: [], crons_affected: [] },
    { symbol: "auditLog", callers: [], endpoints_affected: [], crons_affected: [] },
  ],
  summary: "3 symbols · 1 callers · 1 endpoints · 0 crons",
  indexed_sha: "abc123",
};

const EMPTY_BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: "0 symbols · 0 callers · 0 endpoints · 0 crons",
};

const DEGRADED_BLAST: BlastRadius = {
  changed_symbols: [{ name: "processPayment", file: "src/payments.ts", kind: "function" }],
  downstream: [],
  summary: "1 symbols · 0 callers · 0 endpoints · 0 crons",
  degraded: true,
  reason: "index_partial",
};

const INDEX_STATE: RepoIntelState = {
  status: "full",
  filesIndexed: 100,
  filesSkipped: 0,
  lastIndexedSha: "abc123",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Mocks the fetch boundary only — real hooks (useBlastRadius, useResyncRepoIntel,
 *  useRepoIntelStatus) run for real, so a click really produces the HTTP call the
 *  proof artifact list asks us to assert on. Mirrors ConventionsView.test.tsx. */
function stubFetch(blast: BlastRadius | "error", indexState: RepoIntelState = INDEX_STATE) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.endsWith("/blast")) {
      if (blast === "error") {
        return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
      }
      return { ok: true, status: 200, json: async () => blast };
    }
    if (method === "GET" && url.includes("/index-state")) {
      return { ok: true, status: 200, json: async () => indexState };
    }
    if (method === "POST" && url.endsWith("/resync")) {
      return { ok: true, status: 202, json: async () => ({ status: "accepted" }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The summary row splits "<value> <label>" across a nested <span> (value)
 *  and a plain sibling text node (label) — RTL's getByText only matches an
 *  element's own direct text nodes, so a regex spanning both never matches.
 *  This matches on the full (own + descendant) textContent instead. */
function findStatText(text: string) {
  return screen.getByText((_, element) => (element?.textContent ?? "").trim() === text);
}

function renderCard(overrides: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard
          prId={PR_ID}
          repoId={REPO_ID}
          provider="github"
          repoFullName="acme/widgets"
          headSha="head-sha"
          {...overrides}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BlastRadiusCard", () => {
  it("renders summary counts for symbols, callers, endpoints, and crons", async () => {
    stubFetch(BLAST);
    renderCard();

    await waitFor(() => expect(findStatText("2 symbols")).toBeInTheDocument());
    expect(findStatText("7 callers")).toBeInTheDocument();
    expect(findStatText("3 endpoints")).toBeInTheDocument();
    expect(findStatText("1 cron/jobs")).toBeInTheDocument();
  });

  it("links a caller to file:line on the code host, pinned to indexed_sha, opening in a new tab", async () => {
    stubFetch(BLAST);
    renderCard();

    // The first downstream group (processPayment) has callers, so BlastTree
    // defaults it open — no click needed to see its caller links.
    await screen.findByRole("button", { name: /processPayment/ });
    const link = screen.getByText("src/routes/checkout.ts:42");

    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/routes/checkout.ts#L42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
  });

  it("renders cron pills separately from (and styled differently than) endpoint pills", async () => {
    stubFetch(BLAST);
    renderCard();

    // processPayment is the first group with callers, so it's open by default.
    await screen.findByRole("button", { name: /processPayment/ });
    const endpointPill = screen.getByText("POST /checkout");
    const cronPill = screen.getByText("nightly-retry");

    expect(endpointPill).not.toBe(cronPill);
    expect(endpointPill).toHaveStyle({ color: "var(--accent-text)" });
    expect(cronPill).toHaveStyle({ color: "var(--warn)" });
  });

  it("shows the no-downstream-callers message when every changed symbol has zero callers", async () => {
    stubFetch(ZERO_CALLERS_BLAST);
    renderCard();

    expect(await screen.findByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("shows the no-changed-symbols message when the PR touches no known symbols", async () => {
    stubFetch(EMPTY_BLAST);
    renderCard();

    expect(await screen.findByText("No changed symbols detected for this PR.")).toBeInTheDocument();
  });

  it("shows the degraded badge with its translated reason, and Resync POSTs /repos/:id/resync", async () => {
    const fetchMock = stubFetch(DEGRADED_BLAST);
    renderCard();

    expect(await screen.findByText("Incomplete index")).toBeInTheDocument();
    expect(screen.getByText("The index only covers part of this repo.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Resync/ }));

    await waitFor(() => {
      const resyncCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
      expect(resyncCall).toBeTruthy();
      expect(String(resyncCall![0])).toBe(`http://localhost:3001/repos/${REPO_ID}/resync`);
    });
  });

  it("collapses and expands a symbol node to hide/show its callers", async () => {
    stubFetch(BLAST);
    renderCard();

    // The first group with callers (processPayment) defaults open.
    const header = await screen.findByRole("button", { name: /processPayment/ });
    expect(screen.getByText("src/routes/checkout.ts:42")).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText("src/routes/checkout.ts:42")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText("src/routes/checkout.ts:42")).toBeInTheDocument();
  });

  it("keeps a non-first downstream group collapsed by default even when it has callers", async () => {
    stubFetch(BLAST);
    renderCard();

    await screen.findByRole("button", { name: /processPayment/ });
    // refundOrder is the second group — collapsed by default regardless of caller count.
    expect(screen.queryByText("src/admin/support.ts:12")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refundOrder/ }));
    expect(screen.getByText("src/admin/support.ts:12")).toBeInTheDocument();
  });

  it("shows an error message (and doesn't crash) when the blast fetch fails", async () => {
    stubFetch("error");
    renderCard();

    expect(await screen.findByText("Couldn't load the blast radius for this PR.")).toBeInTheDocument();
  });

  it("collapses zero-caller groups into a single summary line instead of a node each", async () => {
    stubFetch(MIXED_CALLERS_BLAST);
    renderCard();

    // Only the one group with callers gets a BlastTree node.
    await screen.findByRole("button", { name: /processPayment/ });
    expect(screen.queryByRole("button", { name: /refundOrder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /auditLog/ })).not.toBeInTheDocument();

    expect(screen.getByText("2 more changed symbols have no downstream callers.")).toBeInTheDocument();
  });

  it("defaults to the Tree view, with Tree pressed and Graph not", async () => {
    stubFetch(BLAST);
    renderCard();

    await screen.findByRole("button", { name: /processPayment/ });
    expect(screen.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the Graph view on click, rendering the labelled svg", async () => {
    stubFetch(BLAST);
    renderCard();

    await screen.findByRole("button", { name: /processPayment/ });
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
  });

  it("shows the graph-empty message in Graph view when there are no callers to graph", async () => {
    stubFetch(ZERO_CALLERS_BLAST);
    renderCard();

    await screen.findByText("2 changed symbol(s), no downstream callers found.");
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
  });
});
