import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

let smartDiff: SmartDiff | undefined;
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSmartDiff: () => ({ data: smartDiff, isLoading: false, isError: false }),
  usePrReviews: () => ({ data: [{ id: "r", findings: [] }] }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../FindingCard", () => ({ FindingCard: () => null }));

import { DiffTab } from "./DiffTab";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+added line" });
const sdFile = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const FILES = [file("src/core.ts"), file("docs/guide.md")];
const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [sdFile("src/core.ts")] },
    { role: "tests", files: [] },
    { role: "wiring", files: [] },
    { role: "docs", files: [sdFile("docs/guide.md")] },
    { role: "boilerplate", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
};

function ui(focusPath?: string | null) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      <DiffTab prId="pr-1" filesCount={2} files={FILES} focusPath={focusPath} focusLine={2} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  smartDiff = SMART;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("DiffTab focus", () => {
  it("keeps the docs group collapsed without a focus", () => {
    render(ui());
    expect(screen.queryByText("docs/guide.md")).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });

  it("expands a collapsed group when the focused file lives in it, and shows its lines", () => {
    render(ui("docs/guide.md"));
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.getAllByText("added line")).toHaveLength(2); // core + focused docs
  });

  it("expands the group when smartDiff arrives after first render (ungrouped → grouped)", () => {
    smartDiff = undefined;
    const { rerender } = render(ui("docs/guide.md"));
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument(); // ungrouped view lists all
    smartDiff = SMART;
    rerender(ui("docs/guide.md"));
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.getAllByText("added line")).toHaveLength(2);
  });

  it("shows a notice when the focused file is not in the diff", () => {
    render(ui("missing/file.ts"));
    expect(screen.getByText("File not in this PR's diff: missing/file.ts")).toBeInTheDocument();
  });

  it("shows no notice for a file that is in the diff", () => {
    render(ui("src/core.ts"));
    expect(screen.queryByText(/File not in this PR's diff/)).not.toBeInTheDocument();
  });
});
