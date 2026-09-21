import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrIntentRecord } from "@devdigest/shared";

const mutate = vi.hoisted(() => vi.fn());
const hookState = vi.hoisted(() => ({
  data: undefined as PrIntentRecord | null | undefined,
  isLoading: false,
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => hookState,
  useRecomputeIntent: () => ({ mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Add rate limiting to the public API",
  in_scope: ["Add a token-bucket limiter middleware", "Return 429 on limit exceeded"],
  out_of_scope: ["Refactor the auth module"],
  confidence: "high",
  sources: [
    { kind: "linked_issue", ref: "#412", status: "used" },
    { kind: "spec", ref: "docs/specs/rate-limit.md", status: "unavailable" },
  ],
  head_sha: "sha-1",
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
  computed_at: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  mutate.mockReset();
  hookState.data = undefined;
  hookState.isLoading = false;
});

describe("IntentCard", () => {
  it("renders the summary quote, both columns, and source tags", () => {
    hookState.data = INTENT;
    render(<IntentCard prId="pr-1" headSha="sha-1" />);

    expect(screen.getByText(/Add rate limiting to the public API/)).toBeInTheDocument();
    expect(screen.getByText("Add a token-bucket limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Refactor the auth module")).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Linked issue #412/)).toBeInTheDocument();
    expect(screen.getByText(/unavailable/)).toBeInTheDocument();
  });

  it("shows a compact empty-state with a CTA when no intent has been computed yet", () => {
    hookState.data = null;
    render(<IntentCard prId="pr-1" headSha="sha-1" />);

    expect(screen.getByText("Intent not yet derived")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Derive intent"));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows the staleness banner when the PR's head_sha has moved past the computed one", () => {
    hookState.data = INTENT;
    render(<IntentCard prId="pr-1" headSha="sha-2" />);

    expect(screen.getByText(/PR updated since this intent was computed/)).toBeInTheDocument();
  });

  it("does not show the staleness banner when head_sha matches", () => {
    hookState.data = INTENT;
    render(<IntentCard prId="pr-1" headSha="sha-1" />);

    expect(screen.queryByText(/PR updated since this intent was computed/)).not.toBeInTheDocument();
  });

  it("clicking Recompute calls the mutation", () => {
    hookState.data = INTENT;
    render(<IntentCard prId="pr-1" headSha="sha-1" />);

    fireEvent.click(screen.getByText("Recompute"));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
