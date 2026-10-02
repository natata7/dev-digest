import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { PriorPrs } from "./PriorPrs";

const HISTORY: PrHistory = {
  history: [
    {
      pr_number: 12,
      title: "Refactor payments retry logic",
      merged_at: "2026-01-02T10:00:00.000Z",
      author: "alice",
      files_overlap: ["src/payments.ts"],
      notes: "Introduced exponential backoff",
    },
    {
      pr_number: 8,
      title: "Add webhook retries",
      merged_at: "2026-01-01T00:00:00.000Z",
      author: "bob",
      files_overlap: [],
      notes: "",
    },
  ],
};

const EMPTY_HISTORY: PrHistory = { history: [] };

/** Mocks the fetch boundary only, mirroring BlastRadiusCard.test.tsx — PriorPrs
 *  fetches through the real usePrHistory hook, not a stubbed hook module. */
function stubFetch(history: PrHistory | "error") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/history")) {
      if (history === "error") {
        return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
      }
      return { ok: true, status: 200, json: async () => history };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPriorPrs(overrides: Partial<React.ComponentProps<typeof PriorPrs>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <PriorPrs prId="pr-1" provider="github" repoFullName="acme/widgets" {...overrides} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PriorPrs", () => {
  it("shows the history count in the header chip, collapsed by default", async () => {
    stubFetch(HISTORY);
    renderPriorPrs();

    const header = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    expect(header).toHaveTextContent("2");
    expect(screen.queryByText("Refactor payments retry logic")).not.toBeInTheDocument();
  });

  it("expands to show author/date/files/notes for each prior PR", async () => {
    stubFetch(HISTORY);
    renderPriorPrs();

    const header = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    fireEvent.click(header);

    expect(screen.getByText(/Refactor payments retry logic/)).toBeInTheDocument();
    expect(screen.getByText("merged 2026-01-02 by alice")).toBeInTheDocument();
    expect(screen.getByText("src/payments.ts")).toBeInTheDocument();
    expect(screen.getByText("Introduced exponential backoff")).toBeInTheDocument();

    // Second item has no files_overlap/notes — those spans shouldn't render for it.
    expect(screen.getByText(/Add webhook retries/)).toBeInTheDocument();
    expect(screen.getByText("merged 2026-01-01 by bob")).toBeInTheDocument();
  });

  it("links to the GitHub PR URL for a github repo", async () => {
    stubFetch(HISTORY);
    renderPriorPrs({ provider: "github", repoFullName: "o/r" });

    fireEvent.click(await screen.findByRole("button", { name: /Prior PRs touching these files/ }));
    const link = screen.getByText(/Refactor payments retry logic/);

    expect(link).toHaveAttribute("href", "https://github.com/o/r/pull/12");
  });

  it("links to the GitLab merge-request URL for a gitlab repo", async () => {
    stubFetch(HISTORY);
    renderPriorPrs({ provider: "gitlab", repoFullName: "o/r" });

    fireEvent.click(await screen.findByRole("button", { name: /Prior PRs touching these files/ }));
    const link = screen.getByText(/Refactor payments retry logic/);

    expect(link).toHaveAttribute("href", "https://gitlab.com/o/r/-/merge_requests/12");
  });

  it("shows the empty message (with a 0 count) when there's no prior PR history", async () => {
    stubFetch(EMPTY_HISTORY);
    renderPriorPrs();

    const header = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    expect(header).toHaveTextContent("0");

    fireEvent.click(header);
    expect(screen.getByText("No prior PRs found for these files.")).toBeInTheDocument();
  });

  it("shows the error message when the history fetch fails", async () => {
    stubFetch("error");
    renderPriorPrs();

    const header = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    fireEvent.click(header);

    await waitFor(() => expect(screen.getByText("Couldn't load prior PRs for this PR.")).toBeInTheDocument());
  });
});
