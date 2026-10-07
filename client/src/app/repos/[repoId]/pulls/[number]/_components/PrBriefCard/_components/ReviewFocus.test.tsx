import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../messages/en/brief.json";

let brief: PrBrief | null = null;
vi.mock("@/lib/hooks/brief", () => ({ usePrBrief: () => ({ data: brief }) }));

import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const withFocus = (review_focus: PrBrief["review_focus"]) => {
  brief = { review_focus } as unknown as PrBrief;
};

function renderFocus(onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <ReviewFocus prId="pr-1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("ReviewFocus", () => {
  it("renders nothing without a brief", () => {
    brief = null;
    renderFocus();
    expect(screen.queryByText(/Review focus/)).not.toBeInTheDocument();
  });

  it("shows count badge and `file:line — reason` items", () => {
    withFocus([
      { file: "src/a.ts", line: 3, reason: "why a" },
      { file: "src/b.ts", line: 9, reason: "why b" },
    ]);
    renderFocus();
    expect(screen.getByText(/Review focus/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:3")).toBeInTheDocument();
    expect(screen.getByText(/why b/)).toBeInTheDocument();
  });

  it("click → onOpenFile(file, line)", () => {
    withFocus([{ file: "src/config.ts", line: 12, reason: "r" }]);
    const onOpenFile = renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("empty state and no count badge when nothing to focus on", () => {
    withFocus([]);
    renderFocus();
    expect(screen.getByText("No specific places to start were flagged.")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders reason as plain text", () => {
    withFocus([{ file: "a.ts", line: 1, reason: '<img src=x onerror="alert(1)"> **bold**' }]);
    renderFocus();
    expect(screen.getByText(/\*\*bold\*\*/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("strong")).toBeNull();
  });
});
